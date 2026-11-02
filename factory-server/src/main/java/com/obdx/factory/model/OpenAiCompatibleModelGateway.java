package com.obdx.factory.model;

import dev.langchain4j.data.embedding.Embedding;
import dev.langchain4j.data.message.ChatMessage;
import dev.langchain4j.data.message.ImageContent;
import dev.langchain4j.data.message.SystemMessage;
import dev.langchain4j.data.message.TextContent;
import dev.langchain4j.data.message.UserMessage;
import dev.langchain4j.data.segment.TextSegment;
import dev.langchain4j.model.chat.ChatModel;
import dev.langchain4j.model.chat.StreamingChatModel;
import dev.langchain4j.model.chat.request.ChatRequest;
import dev.langchain4j.model.chat.request.ResponseFormat;
import dev.langchain4j.model.chat.response.ChatResponse;
import dev.langchain4j.model.chat.response.StreamingChatResponseHandler;
import dev.langchain4j.model.embedding.EmbeddingModel;
import dev.langchain4j.model.openai.OpenAiChatModel;
import dev.langchain4j.model.openai.OpenAiChatRequestParameters;
import dev.langchain4j.model.openai.OpenAiChatResponseMetadata;
import dev.langchain4j.model.openai.OpenAiEmbeddingModel;
import dev.langchain4j.model.openai.OpenAiStreamingChatModel;
import dev.langchain4j.model.output.FinishReason;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.Consumer;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * {@link ModelGateway} for any server that speaks the OpenAI-compatible API (Ollama, vLLM, private cloud endpoints).
 * It connects to the server and models chosen on the Models page ({@link ModelSettings}) and reconnects when they change.
 */
@Component
public class OpenAiCompatibleModelGateway implements ModelGateway {

    private static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(OpenAiCompatibleModelGateway.class);

    /**
     * The models of one choice of servers; replaced as a whole when the settings change. jsonStreams: false once the
     * server refused a streamed answer in JSON mode (some cloud servers do), so JSON answers come in one piece there.
     */
    private record Connection(String baseUrl, String chatModelName, String embeddingUrl, String embeddingModelName,
                              ChatModel chatModel, StreamingChatModel streamingChatModel, EmbeddingModel embeddingModel,
                              java.util.concurrent.atomic.AtomicBoolean jsonStreams, Limits limits, boolean noThink,
                              java.util.concurrent.atomic.AtomicBoolean effortRefused) {
    }

    /** What the chat model's server takes in one request, learned when it refused a larger one. */
    private static final class Limits {
        volatile int input;
        volatile double charsPerToken = 3.5;
        /**
         * The output tokens a minute the server allows (Groq's OTPM), learned from its refusals; 0 while unknown. Each answer
         * asks for no more than what is left of it this minute.
         */
        volatile int output;
        /** The most max_tokens the server takes in one request, learned from its refusal ("must be less than or equal to N"); 0 while unknown. */
        volatile int answerMax;
        /** The model refuses max_tokens and takes max_completion_tokens instead (OpenAI's reasoning models). */
        volatile boolean completionTokens;
        /** When output was learned: an hour later one call goes without it, to see whether it still holds. */
        volatile long outputLearnedAt;
        /** The output tokens of this server's answers in the last minute: [when (ms), tokens]. */
        private final java.util.ArrayDeque<long[]> written = new java.util.ArrayDeque<>();

        synchronized void wrote(int tokens, long now) {
            written.addLast(new long[] {now, tokens});
            forget(now);
        }

        /** Output tokens this server wrote for the factory in the minute before now. */
        synchronized int usedLastMinute(long now) {
            forget(now);
            return written.stream().mapToInt(w -> (int) w[1]).sum();
        }

        /** How long until at least wanted output tokens of the minute's allowance are free again (ms), at most a minute. */
        synchronized long waitFor(int wanted, long now) {
            forget(now);
            int left = (int) (output * 0.9) - written.stream().mapToInt(w -> (int) w[1]).sum();
            for (long[] w : written) {
                if (left >= wanted) {
                    break;
                }
                left += (int) w[1];
                if (left >= wanted) {
                    return Math.max(0, w[0] + 60_000 - now);
                }
            }
            return left >= wanted ? 0 : 60_000;
        }

        private void forget(long now) {
            while (!written.isEmpty() && written.peekFirst()[0] <= now - 60_000) {
                written.removeFirst();
            }
        }
        /**
         * Tokens a minute in all, prompt and max_tokens together (Groq counts both against "tokens per minute"); 0
         * while unknown. max_tokens is sized so that the two stay within it.
         */
        volatile int total;
    }

    /** The limits learned before for this server and model (they survive restarts), or none. */
    private Limits loadLimits(String baseUrl, String model) {
        Limits limits = new Limits();
        if (store != null) {
            try {
                java.util.Optional<ModelLimitsStore.Stored> stored = store.find(baseUrl, model);
                if (stored.isEmpty()) {
                    log.info("No stored limits for {} at {}: they are learned from the server's answers", model, ModelSettings.origin(baseUrl));
                }
                stored.ifPresent(s -> {
                    // values below the floors are no limit any server has: unknown
                    limits.input = s.input() >= MIN_INPUT ? s.input() : 0;
                    limits.charsPerToken = s.charsPerToken() > 0 ? s.charsPerToken() : 3.5;
                    limits.output = s.outputPerMinute();
                    limits.outputLearnedAt = System.currentTimeMillis();
                    limits.total = s.total() >= MIN_TOTAL ? s.total() : 0;
                    limits.answerMax = s.answerMax();
                    log.info("Using stored limits for {}: input {}, output {} a minute, total {} (at {})", model, s.input(), s.outputPerMinute(),
                            s.total(), ModelSettings.origin(baseUrl));
                    if (s.output() > 0) {
                        // A per-answer cap from earlier rules: one refusal in a busy minute could set it, and nothing could clear it
                        log.info("Cleared a stored output cap of {} for {}: answers are sized by what is left of the server's output "
                                + "tokens a minute instead", s.output(), model);
                        store.save(baseUrl, model, new ModelLimitsStore.Stored(s.input(), s.charsPerToken(), 0, s.total(), s.outputPerMinute(),
                                s.answerMax()));
                    }
                });
            } catch (RuntimeException e) {
                log.warn("Could not read the learned limits of chat model '{}'", model, e);
            }
        }
        return limits;
    }

    private void saveLimits(Connection current) {
        if (store != null) {
            try {
                store.save(current.baseUrl(), current.chatModelName(), new ModelLimitsStore.Stored(current.limits().input,
                        current.limits().charsPerToken, 0, current.limits().total, current.limits().output, current.limits().answerMax));
            } catch (RuntimeException e) {
                log.warn("Could not keep the learned limits of chat model '{}'", current.chatModelName(), e);
            }
        }
    }

    /** "output tokens per minute (OTPM): Limit 1000, Requested 1407" (or with "Used 600, " between) */
    private static final Pattern OUTPUT_LIMIT = Pattern.compile("(?i)limit:?\\s*(\\d{1,9}),\\s*(?:used:?\\s*(\\d{1,9}),\\s*)?requested:?\\s*(\\d{1,9})");
    /** The fewest output tokens worth asking for; a server that allows less cannot write files. */
    static final int MIN_OUTPUT = 256;

    /**
     * Asks for no more output than the server's learned limits allow, and logs what the request asks for (QA reads
     * factory.log to see why a request was the size it was).
     */
    /** A request ready to send, and the max_tokens it asks for (0: left to the server). */
    private record Prepared(ChatRequest request, int max) {
    }

    /**
     * The request for a chat: the messages (with /no_think for a model asked not to think out loud), the response
     * format, max_tokens within the learned limits, and reasoning_effort "none" where the server takes it.
     */
    private Prepared prepare(Connection current, String systemPrompt, UserMessage userMessage, ResponseFormat format) {
        Limits limits = current.limits();
        if (limits.output > 0 && CALL_CAP.get() == null && PROBE.get() == null) {
            long now = System.currentTimeMillis();
            if (now - limits.outputLearnedAt > PROBE_AFTER.toMillis()) {
                // Learned over an hour ago: one call goes without it, and an answer the server takes clears it
                PROBE.set(true);
                log.info("Trying chat model '{}' without its learned output limit of {} tokens a minute (learned over an hour ago)",
                        current.chatModelName(), limits.output);
            } else {
                // The minute nearly used up: wait the short while until enough is free, rather than ask for a tiny answer
                int wanted = MIN_OUTPUT;
                long wait = limits.output * 0.9 < MIN_OUTPUT ? 0 : limits.waitFor(wanted, now);
                if (wait > 0) {
                    log.info("Waiting {} for chat model '{}' to have {} output tokens free this minute (used {} of {} a minute)",
                            roughly(Duration.ofMillis(wait)), current.chatModelName(), wanted, limits.usedLastMinute(now), limits.output);
                    WaitBudget.spend(Duration.ofMillis(wait), current.chatModelName());
                    try {
                        Thread.sleep(wait);
                    } catch (InterruptedException e) {
                        Thread.currentThread().interrupt();
                        throw new ModelGatewayException("Chat model '" + current.chatModelName() + "' was stopped", e);
                    }
                }
            }
        }
        OpenAiChatRequestParameters.Builder parameters = OpenAiChatRequestParameters.builder();
        if (format != null) {
            parameters.responseFormat(format);
        }
        int max = capOutput(current, parameters, chars(systemPrompt, userMessage));
        if (current.noThink() && !current.effortRefused().get()) {
            parameters.reasoningEffort("none");
        }
        return new Prepared(ChatRequest.builder().messages(messages(systemFor(current, systemPrompt), userMessage))
                .parameters(parameters.build()).build(), max);
    }

    /** The system prompt, with /no_think for a model asked not to think out loud (qwen3 understands it). */
    static String systemFor(Connection current, String systemPrompt) {
        if (!current.noThink()) {
            return systemPrompt;
        }
        return systemPrompt == null || systemPrompt.isBlank() ? "/no_think" : systemPrompt + "\n\n/no_think";
    }


    /**
     * A reply without the model's thinking: &lt;think&gt;...&lt;/think&gt; blocks are left out, and a reply that stopped
     * while still thinking (no closing tag) has no answer at all.
     */
    static String withoutThinking(String reply) {
        if (reply == null || !reply.contains("<think>")) {
            return reply;
        }
        // One pass with indexOf (a regex over a long run of "<think>" takes seconds): each block and the spaces after it go
        StringBuilder answer = new StringBuilder();
        int at = 0;
        while (true) {
            int open = reply.indexOf("<think>", at);
            if (open < 0) {
                answer.append(reply, at, reply.length());
                return answer.toString();
            }
            answer.append(reply, at, open);
            int close = reply.indexOf("</think>", open + 7);
            if (close < 0) {
                // stopped while still thinking: no answer after it
                return answer.toString();
            }
            at = close + 8;
            while (at < reply.length() && Character.isWhitespace(reply.charAt(at))) {
                at++;
            }
        }
    }

    /** The server refused the request because of its reasoning_effort (an unknown or unsupported parameter). */
    static boolean reasoningEffortRefused(String text) {
        String lower = text.toLowerCase(java.util.Locale.ROOT);
        return lower.contains("reasoning_effort") || lower.contains("reasoning effort")
                || lower.contains("reasoning") && (lower.contains("not supported") || lower.contains("unsupported")
                || lower.contains("unrecognized") || lower.contains("unknown") || lower.contains("invalid"));
    }

    private int capOutput(Connection current, OpenAiChatRequestParameters.Builder request, int promptChars) {
        int max = maxTokens(current.limits(), maxOutput, promptChars);
        if (max > 0 && current.limits().completionTokens) {
            request.maxCompletionTokens(max);
        } else if (max > 0) {
            request.maxOutputTokens(max);
        }
        ASKED.set(max);
        PROMPT.set(promptChars);
        logRequest(current, promptChars, max);
        return max;
    }

    /**
     * max_tokens for a prompt: the learned per-minute output cap (else FACTORY_MODEL_MAX_OUTPUT_TOKENS), and, once the
     * server's tokens a minute in all are known, no more than what is left of them after the prompt (90%, room for the
     * server counting differently), never below MIN_OUTPUT. 0 leaves it to the server.
     */
    /** A lower max_tokens for the call being asked again after an output-per-minute refusal; null otherwise. */
    private static final ThreadLocal<Integer> CALL_CAP = new ThreadLocal<>();
    /** The max_tokens the call on this thread asked for last (to tell what the server counted against what was asked). */
    private static final ThreadLocal<Integer> ASKED = new ThreadLocal<>();
    /** Set while one call goes without the learned output limit, to see whether it still holds. */
    private static final ThreadLocal<Boolean> PROBE = new ThreadLocal<>();
    /** The prompt characters of the call on this thread (a larger prompt the server took raises a learned input limit). */
    private static final ThreadLocal<Integer> PROMPT = new ThreadLocal<>();
    /** How long a learned output limit is used before one call goes without it. */
    static final Duration PROBE_AFTER = Duration.ofHours(1);

    private static int maxTokens(Limits limits, Integer maxOutput, int promptChars) {
        int cap = maxOutput == null ? 0 : maxOutput;
        if (limits.output > 0 && !Boolean.TRUE.equals(PROBE.get())) {
            // What is left of the server's output tokens this minute (90%, room for counting differently)
            int left = Math.max(MIN_OUTPUT, (int) (limits.output * 0.9) - limits.usedLastMinute(System.currentTimeMillis()));
            cap = cap > 0 ? Math.min(cap, left) : left;
        }
        Integer callCap = CALL_CAP.get();
        if (callCap != null) {
            cap = cap > 0 ? Math.min(cap, callCap) : callCap;
        }
        // Only a small per-minute total sizes the answer: on a large plan (OpenAI's 30 million, Groq's 300,000) prompt and answer
        // fit anyway, and 90% of it would be a max_tokens no server takes
        if (limits.total > 0 && limits.total < SMALL_TOTAL) {
            int room = Math.max(MIN_OUTPUT, (int) (limits.total * 0.9 - promptChars / limits.charsPerToken));
            cap = cap > 0 ? Math.min(cap, room) : room;
        }
        if (limits.answerMax > 0) {
            cap = cap > 0 ? Math.min(cap, limits.answerMax) : limits.answerMax;
        }
        // Never above FACTORY_MODEL_MAX_OUTPUT_TOKENS, or a sane size when that is not set
        return cap > 0 ? Math.min(cap, maxOutput != null && maxOutput > 0 ? maxOutput : DEFAULT_ANSWER) : cap;
    }

    /** Learned limits below these are taken as unknown: no server's limit is that small, so they came from a stray message. */
    static final int MIN_INPUT = 1024;
    static final int MIN_TOTAL = 2048;

    /**
     * Whether a refusal is about the request's size: 413 or 429, or a 400 whose message is about the context or tokens (a 400
     * for anything else, such as a bad parameter, teaches no limit). Without a status, its message decides.
     */
    static boolean sizeRefusal(Throwable e, String text) {
        String lower = text.toLowerCase(java.util.Locale.ROOT);
        boolean aboutSize = lower.contains("context") || lower.contains("token");
        for (Throwable t = e; t != null; t = t.getCause()) {
            if (t instanceof dev.langchain4j.exception.HttpException h) {
                return h.statusCode() == 413 || h.statusCode() == 429 || h.statusCode() == 400 && aboutSize;
            }
        }
        return aboutSize;
    }

    /** Below this many tokens a minute in all, the answer is sized to fit beside the prompt. */
    static final int SMALL_TOTAL = 12_000;
    /** The most max_tokens asked for when FACTORY_MODEL_MAX_OUTPUT_TOKENS is not set and a limit gives a size. */
    static final int DEFAULT_ANSWER = 8192;

    private static final Pattern ANSWER_MAX = Pattern.compile("(?i)(?:max_(?:completion_)?tokens`?\\s+must\\s+be\\s+(?:less\\s+than\\s+or\\s+equal\\s+to|<=|≤)"
            + "\\s*`?(\\d{1,9})|supports\\s+at\\s+most\\s+(\\d{1,9})\\s+(?:completion|output)\\s+tokens|maximum\\s+(?:allowed\\s+)?(?:value\\s+)?"
            + "(?:for\\s+`?max_(?:completion_)?tokens`?\\s+)?is\\s+`?(\\d{1,9}))");

    /** The most max_tokens a server said it takes ("max_tokens must be less than or equal to 32768"), or 0. */
    static int answerMaxRefused(String text) {
        Matcher m = ANSWER_MAX.matcher(text);
        if (!m.find()) {
            return 0;
        }
        for (int g = 1; g <= m.groupCount(); g++) {
            if (m.group(g) != null) {
                return Integer.parseInt(m.group(g));
            }
        }
        return 0;
    }

    /** The model takes max_completion_tokens, not max_tokens ("Use 'max_completion_tokens' instead"). */
    static boolean completionTokensAsked(String text) {
        String lower = text.toLowerCase(java.util.Locale.ROOT);
        return lower.contains("max_completion_tokens") && (lower.contains("instead") || lower.contains("not supported") || lower.contains("unsupported"));
    }

    private static void logRequest(Connection current, int promptChars, int maxTokens) {
        Double scale = PromptFit.SCALE.get();
        log.info("Chat request to '{}': {} prompt characters, about {} tokens, max_tokens {}, context {}", current.chatModelName(),
                promptChars, Math.round(promptChars / current.limits().charsPerToken), maxTokens > 0 ? maxTokens : "server default",
                scale == null ? "not scaled" : "at " + Math.round(scale * 100) + "%");
    }

    private static int chars(String systemPrompt, UserMessage userMessage) {
        return (systemPrompt == null ? 0 : systemPrompt.length()) + (userMessage.hasSingleText() ? userMessage.singleText().length() : 0);
    }

    /**
     * [limit, requested] when the server refused a request because its max_tokens alone is more than the server writes
     * in a minute (Groq "output tokens per minute (OTPM): Limit 1000, Requested 1407"): waiting cannot help, a smaller
     * max_tokens does. Null otherwise (also when the output of this minute is merely used up: that is waited out).
     */
    static int[] outputTooLarge(String text) {
        if (!text.toLowerCase(java.util.Locale.ROOT).contains("output tokens")) {
            return null;
        }
        Matcher m = OUTPUT_LIMIT.matcher(text.length() > 2000 ? text.substring(0, 2000) : text);
        if (m.find()) {
            int limit = Integer.parseInt(m.group(1));
            int requested = Integer.parseInt(m.group(3));
            if (requested > limit) {
                // Used: what the minute had already used (-1 when the server does not say)
                return new int[] {limit, requested, m.group(2) == null ? -1 : Integer.parseInt(m.group(2))};
            }
        }
        return null;
    }

    /**
     * A lower cap after the server refused the current one: it counted requested tokens for the cap's answers, so the cap
     * shrinks by limit/requested, with the same 90% margin.
     */
    static int lowerCap(int cap, int limit, int requested) {
        return (int) (cap * ((double) limit / requested) * 0.9);
    }

    /** The max_tokens to ask for below a per-minute output limit: 90% of it, room for the server counting differently. */
    static int outputCap(int limit) {
        return (int) (limit * 0.9);
    }

    /** "Request too large ... Limit 7000, Requested 7663": a per-minute token limit smaller than the request. */
    private static final Pattern TOO_LARGE = Pattern.compile("(?i)limit:?\\s*(\\d{1,9}),\\s*requested:?\\s*(\\d{1,9})");
    /** "maximum context length is 8192 tokens. However, your messages resulted in 9000 tokens" */
    private static final Pattern CONTEXT_LENGTH = Pattern.compile("(?is)maximum context length is (\\d{1,9}) tokens.{0,300}?(?:resulted in|requested) (\\d{1,9}) tokens");
    /** "Please try again in 7.66s", "in 1m30.5s", "in 330ms" */
    private static final Pattern TRY_AGAIN = Pattern.compile("(?i)try again in ([\\d.]{1,12}ms|(?:\\d{1,9}h)?(?:\\d{1,9}m)?(?:[\\d.]{1,12}s)?)");
    private static final Pattern TIME_PART = Pattern.compile("([\\d.]{1,12})([hms])");
    /** Longest rate-limit wait before giving up; a per-minute limit frees up within it (some servers ask for over 90 s). */
    static final Duration MAX_WAIT = Duration.ofMinutes(3);
    private static final int RATE_LIMIT_ATTEMPTS = 8;

    /** The FACTORY_MODEL_* settings (whether to ask the chat model not to think out loud) */
    private final ModelProperties properties;
    private final Duration timeout;
    /** max_tokens for each answer; null leaves it to the server (FACTORY_MODEL_MAX_OUTPUT_TOKENS). */
    private final Integer maxOutput;
    private final OllamaChat ollama;
    private volatile Connection connection;
    /** Where learned limits are kept over restarts; null in tests without a database */
    private final ModelLimitsStore store;

    @Autowired
    public OpenAiCompatibleModelGateway(ModelProperties properties, ModelSettings settings, ModelLimitsStore store) {
        this.properties = properties;
        this.timeout = properties.timeout();
        this.maxOutput = properties.maxOutput() > 0 ? properties.maxOutput() : null;
        this.ollama = new OllamaChat(properties.maxContext());
        this.store = store;
        this.connection = connect(settings.current());
    }

    /** With the FACTORY_MODEL_* settings only (tests). */
    public OpenAiCompatibleModelGateway(ModelProperties properties) {
        this(properties, (ModelLimitsStore) null);
    }

    /** With the FACTORY_MODEL_* settings and a store for learned limits (tests). */
    OpenAiCompatibleModelGateway(ModelProperties properties, ModelLimitsStore store) {
        this.properties = properties;
        this.timeout = properties.timeout();
        this.maxOutput = properties.maxOutput() > 0 ? properties.maxOutput() : null;
        this.ollama = new OllamaChat(properties.maxContext());
        this.store = store;
        this.connection = connect(new ModelSettings.Current(properties.baseUrl(), properties.apiKey(), properties.chatModel(),
                properties.embeddingModel(), null, null, false, null, null));
    }

    /** Forgets what the chat model's server showed (an admin's action, after a plan changed or a limit was learned wrongly). */
    @Override
    public void forgetLimits() {
        Connection current = connection;
        if (store != null) {
            store.clear(current.baseUrl(), current.chatModelName());
        }
        Limits fresh = new Limits();
        Limits limits = current.limits();
        limits.input = fresh.input;
        limits.charsPerToken = fresh.charsPerToken;
        limits.output = 0;
        limits.total = 0;
        limits.answerMax = 0;
        limits.completionTokens = false;
        log.info("Forgot the learned limits of chat model '{}': they are learned again from the server's answers", current.chatModelName());
    }

    @EventListener
    public void settingsChanged(ModelSettings.Changed event) {
        ollama.forget();
        Connection old = connection;
        ModelSettings.Current next = event.settings();
        if (store != null && old != null && (!java.util.Objects.equals(old.baseUrl(), next.baseUrl())
                || !java.util.Objects.equals(old.chatModelName(), next.chatModel()))) {
            // Another server or model: what the old one showed is no longer known to hold (a new plan may have come with it)
            try {
                store.clear(old.baseUrl(), old.chatModelName());
            } catch (RuntimeException e) {
                log.warn("Could not clear the learned limits of chat model '{}'", old.chatModelName(), e);
            }
        }
        this.connection = connect(next);
    }

    private Connection connect(ModelSettings.Current settings) {
        if (properties.noThinkFor(settings.chatModel())) {
            log.info("Thinking turned off for model '{}' (/no_think, reasoning_effort none)", settings.chatModel());
        }
        return new Connection(settings.baseUrl(), settings.chatModel(), settings.embeddingUrl(), settings.embeddingModel(),
                OpenAiChatModel.builder()
                        .baseUrl(settings.baseUrl())
                        .apiKey(keyOrPlaceholder(settings.apiKey()))
                        .modelName(settings.chatModel())
                        .timeout(timeout)
                        .maxRetries(0)
                        .build(),
                OpenAiStreamingChatModel.builder()
                        .baseUrl(settings.baseUrl())
                        .apiKey(keyOrPlaceholder(settings.apiKey()))
                        .modelName(settings.chatModel())
                        .timeout(timeout)
                        .build(),
                OpenAiEmbeddingModel.builder()
                        .baseUrl(settings.embeddingUrl())
                        .apiKey(keyOrPlaceholder(settings.embeddingKey()))
                        .modelName(settings.embeddingModel())
                        .timeout(timeout)
                        .maxRetries(0)
                        .build(),
                new java.util.concurrent.atomic.AtomicBoolean(true), loadLimits(settings.baseUrl(), settings.chatModel()),
                properties.noThinkFor(settings.chatModel()), new java.util.concurrent.atomic.AtomicBoolean());
    }

    @Override
    public ChatResult chat(String systemPrompt, String userPrompt) {
        return limited(systemPrompt, userPrompt, () -> chat(systemPrompt, userPrompt, null));
    }

    @Override
    public int inputLimit() {
        return connection.limits().input;
    }

    @Override
    public int outputLimit() {
        return connection.limits().output;
    }

    @Override
    public int tokensPerMinute() {
        return connection.limits().total;
    }

    @Override
    public boolean local() {
        return ollama.isOllama(connection.baseUrl());
    }

    @Override
    public double charsPerToken() {
        return connection.limits().charsPerToken;
    }

    /**
     * Runs a chat call within the server's limits: a rate limit ("try again in 7.66s", a cloud server's tokens per
     * minute) is waited out and the call made again; a request larger than the server takes at once is reported as
     * {@link PromptTooLargeException}, and the limit is remembered so that the next prompt is built to fit (PromptFit).
     */
    private ChatResult limited(String systemPrompt, String userPrompt, java.util.function.Supplier<ChatResult> call) {
        return limited(systemPrompt, userPrompt, call, () -> true);
    }

    /** canRetry: whether the call may be made again after a rate limit (a streamed call that handed on no piece yet). */
    private ChatResult limited(String systemPrompt, String userPrompt, java.util.function.Supplier<ChatResult> call,
                               java.util.function.BooleanSupplier canRetry) {
        try {
            return limitedCall(systemPrompt, userPrompt, call, canRetry);
        } finally {
            // a lower max_tokens asked of one call's retry does not carry over to the next call
            CALL_CAP.remove();
            ASKED.remove();
            PROBE.remove();
            PROMPT.remove();
        }
    }

    private ChatResult limitedCall(String systemPrompt, String userPrompt, java.util.function.Supplier<ChatResult> call,
                                   java.util.function.BooleanSupplier canRetry) {
        Connection current = connection;
        int lowered = 0;
        for (int attempt = 1; ; attempt++) {
            // The call uses the connection of the moment: limits learned below go to the same one
            current = connection;
            try {
                return call.get();
            } catch (ModelGatewayException e) {
                String text = messages(e);
                if (current.noThink() && !current.effortRefused().get() && reasoningEffortRefused(text)) {
                    // The server does not take reasoning_effort: asked again without it, and not sent to it again
                    current.effortRefused().set(true);
                    log.info("Chat model '{}' at {} does not take reasoning_effort; asking without it", current.chatModelName(),
                            ModelSettings.origin(current.baseUrl()));
                    continue;
                }
                if (!current.limits().completionTokens && completionTokensAsked(text)) {
                    // The model takes max_completion_tokens instead: asked again with it, and always from now on
                    current.limits().completionTokens = true;
                    log.info("Chat model '{}' takes max_completion_tokens, not max_tokens; asking with it", current.chatModelName());
                    continue;
                }
                int answerMax = answerMaxRefused(text);
                Integer askedMax = ASKED.get();
                if (answerMax > 0 && askedMax != null && askedMax > answerMax && lowered < 3) {
                    // One request may not ask for more: learned and kept, and asked again at once within it
                    current.limits().answerMax = answerMax;
                    saveLimits(current);
                    lowered++;
                    log.info("Chat model '{}' takes at most {} max_tokens in one request (asked {}); answers now ask for no more", current.chatModelName(),
                            answerMax, askedMax);
                    continue;
                }
                int[] tooLarge = tooLarge(text);
                // Learned only from a refusal of size (413, 429, or a 400 about context or tokens), and never below a floor: one odd
                // message must not shrink every later prompt for good
                if (tooLarge != null && (!sizeRefusal(e, text) || tooLarge[0] < MIN_INPUT)) {
                    log.info("Chat model '{}' refused a request as too large ({} tokens, limit {}); not learned as its limit", current.chatModelName(),
                            tooLarge[1], tooLarge[0]);
                    throw new PromptTooLargeException("Chat model '" + current.chatModelName() + "' at " + ModelSettings.shown(current.baseUrl()) + " takes at most "
                            + tooLarge[0] + " tokens in one request; this one had " + tooLarge[1] + ".", tooLarge[0], tooLarge[1], e);
                }
                if (tooLarge != null) {
                    int chars = (systemPrompt == null ? 0 : systemPrompt.length()) + userPrompt.length();
                    int input;
                    int prompt = tooLarge[1];
                    if (countsAnswer(text)) {
                        // Groq's "Requested" is the prompt plus max_tokens: learn the prompt's share, keep room for an
                        // answer, and size max_tokens from now on so that the two stay within the limit
                        int asked = maxTokens(current.limits(), maxOutput, chars);
                        if (asked > 0 && tooLarge[1] - asked >= tooLarge[1] / 5) {
                            prompt = tooLarge[1] - asked;
                        }
                        input = tooLarge[0] - Math.min(asked > 0 ? asked : 1024, tooLarge[0] / 4);
                        if (tooLarge[0] >= MIN_TOTAL) {
                            current.limits().total = current.limits().total == 0 ? tooLarge[0] : Math.min(current.limits().total, tooLarge[0]);
                        }
                        log.info("Learned the model server's per-minute token limit: {} (chat model '{}', from its refusal)", current.limits().total,
                                current.chatModelName());
                    } else {
                        input = inputLimit(text, tooLarge[0], maxOutput);
                    }
                    if (input >= MIN_INPUT) {
                        current.limits().input = current.limits().input == 0 ? input : Math.min(current.limits().input, input);
                    }
                    current.limits().charsPerToken = Math.clamp((double) chars / prompt, 2.0, 6.0);
                    saveLimits(current);
                    throw new PromptTooLargeException("Chat model '" + current.chatModelName() + "' at " + ModelSettings.shown(current.baseUrl()) + " takes at most "
                            + tooLarge[0] + " tokens in one request; this one had " + tooLarge[1] + ".", tooLarge[0], tooLarge[1], e);
                }
                int[] output = outputTooLarge(text);
                if (output != null && canRetry.getAsBoolean()) {
                    int limit = output[0];
                    int requested = output[1];
                    int used = output[2];
                    Limits limits = current.limits();
                    // The limit is output tokens a MINUTE: learned as such, and each answer asks for what is left of it. A server
                    // that counted more than was asked (requested above what max_tokens said) allows that much less of it
                    Integer asked = ASKED.get();
                    int perMinute = asked != null && asked > 0 && requested > asked ? (int) ((long) limit * asked / requested) : limit;
                    if (limits.output == 0 || perMinute < limits.output || Boolean.TRUE.equals(PROBE.get())) {
                        limits.output = perMinute;
                        saveLimits(current);
                        log.info("Learned the model server's output limit: {} tokens a minute (chat model '{}', from its refusal)", perMinute,
                                current.chatModelName());
                    }
                    limits.outputLearnedAt = System.currentTimeMillis();
                    PROBE.remove();
                    long now = System.currentTimeMillis();
                    // What this minute still allows: the server's own count of what is used, or the factory's, the larger
                    int room = (int) (perMinute * 0.9) - Math.max(Math.max(used, 0), limits.usedLastMinute(now));
                    if (room < MIN_OUTPUT && perMinute * 0.9 >= MIN_OUTPUT && lowered < 3) {
                        // The minute is used up: wait for it (at most a minute) rather than ask for a tiny answer
                        long wait = used > 0 ? 60_000 : limits.waitFor(MIN_OUTPUT, now);
                        log.info("Waiting {} for chat model '{}': this minute's output tokens are used up (used {} of {})",
                                roughly(Duration.ofMillis(wait)), current.chatModelName(), Math.max(used, limits.usedLastMinute(now)), perMinute);
                        WaitBudget.spend(Duration.ofMillis(wait), current.chatModelName());
                        try {
                            Thread.sleep(wait);
                        } catch (InterruptedException interrupted) {
                            Thread.currentThread().interrupt();
                            throw new ModelGatewayException("Chat model '" + current.chatModelName() + "' at " + ModelSettings.shown(current.baseUrl()) + " was stopped",
                                    interrupted);
                        }
                        room = (int) (perMinute * 0.9) - limits.usedLastMinute(System.currentTimeMillis());
                    }
                    if (room < MIN_OUTPUT || lowered >= 3) {
                        throw new ModelGatewayException("Chat model '" + current.chatModelName() + "' at " + ModelSettings.shown(current.baseUrl()) + " writes at most "
                                + limit + " tokens a minute, too few for an answer. Use a model or plan with a higher output limit.", e);
                    }
                    lowered++;
                    CALL_CAP.set(room);
                    log.info("Chat model '{}' refused {} output tokens (limit {} a minute{}); asking again with max_tokens {}", current.chatModelName(),
                            requested, limit, used > 0 ? ", " + used + " used" : "", room);
                    continue;
                }
                Duration wait = rateLimitWait(text);
                if (wait == null || !canRetry.getAsBoolean()) {
                    throw e;
                }
                boolean daily = daily(text);
                // A daily limit is rolling: a short wait it asks for is waited out like a per-minute one; without a time,
                // or with a long one, every call fails until the allowance frees up
                if (daily && (!waitGiven(text) || wait.compareTo(MAX_WAIT) > 0)) {
                    throw new ModelLimitReachedException("Chat model '" + current.chatModelName() + "' at " + ModelSettings.shown(current.baseUrl())
                            + " has used up its daily limit (" + serverMessage(text) + "). Try again "
                            + (waitGiven(text) ? "in " + roughly(wait) + " (the server's estimate; it changes if others use the same key)"
                            : "later") + ", or use a plan or model with a larger limit.", true,
                            waitGiven(text) ? roughly(wait) : null, e);
                }
                if (attempt >= RATE_LIMIT_ATTEMPTS) {
                    throw new ModelLimitReachedException("Chat model '" + current.chatModelName() + "' at " + ModelSettings.shown(current.baseUrl())
                            + " stayed at its rate limit after " + attempt + " tries (" + serverMessage(text) + "). Try again in a few "
                            + "minutes, or use a plan or model with larger limits.", daily, "a few minutes", e);
                }
                if (wait.compareTo(MAX_WAIT) > 0) {
                    throw new ModelLimitReachedException("Chat model '" + current.chatModelName() + "' at " + ModelSettings.shown(current.baseUrl())
                            + " reached its rate limit and asks to wait " + roughly(wait) + ". Try again then, or use a plan or model "
                            + "with a larger limit.", false, roughly(wait), e);
                }
                log.info("Chat model '{}' is at its rate limit ({}); waiting {} before asking again", current.chatModelName(), serverMessage(text),
                        roughly(wait));
                WaitBudget.spend(wait, current.chatModelName());
                try {
                    Thread.sleep(wait);
                } catch (InterruptedException interrupted) {
                    Thread.currentThread().interrupt();
                    throw new ModelGatewayException("Chat model '" + current.chatModelName() + "' at " + ModelSettings.shown(current.baseUrl()) + " was stopped", interrupted);
                }
            }
        }
    }

    /** [limit, requested] when the server refused the request as larger than it takes at once; otherwise null. */
    static int[] tooLarge(String text) {
        // "The request's expected output tokens exceed the enforced limit": the answers of this minute used the server's
        // output allowance; that is waited out like a rate limit, not fixed with a smaller prompt
        if (text.toLowerCase(java.util.Locale.ROOT).contains("output tokens")) {
            return null;
        }
        for (Pattern pattern : List.of(TOO_LARGE, CONTEXT_LENGTH)) {
            Matcher m = pattern.matcher(text);
            if (m.find()) {
                int limit = Integer.parseInt(m.group(1));
                int requested = Integer.parseInt(m.group(2));
                if (requested > limit) {
                    return new int[] {limit, requested};
                }
            }
        }
        return null;
    }

    /**
     * The input a prompt may take, from a refusal's limit: a model's context length ("maximum context length is 8192
     * tokens") holds the answer too, so the answer's room (maxOutput, or 1,024 tokens) is left out of it; a per-minute
     * limit is all input.
     */
    static int inputLimit(String text, int limit, Integer maxOutput) {
        if (!CONTEXT_LENGTH.matcher(text).find() || TOO_LARGE.matcher(text).find()) {
            return limit;
        }
        int answer = maxOutput != null && maxOutput > 0 ? maxOutput : 1024;
        return Math.max(limit / 4, limit - answer);
    }

    /**
     * A refusal of a per-minute limit on all tokens, prompt and max_tokens together (Groq "on tokens per minute (TPM):
     * Limit 6000, Requested 7663"); not an input-only limit (ITPM) or a model's context length.
     */
    static boolean countsAnswer(String text) {
        String lower = text.toLowerCase(java.util.Locale.ROOT);
        return TOO_LARGE.matcher(text).find() && !CONTEXT_LENGTH.matcher(text).find() && lower.contains("tokens per minute")
                && !lower.contains("input tokens per minute");
    }

    /** How long a rate-limited server asks to wait, plus a second to be safe; null when the call was not rate limited. */
    static Duration rateLimitWait(String text) {
        String lower = text.toLowerCase(java.util.Locale.ROOT);
        if (!lower.contains("rate limit") && !lower.contains("rate_limit") && !lower.contains("too many requests")) {
            return null;
        }
        Matcher m = TRY_AGAIN.matcher(text);
        if (!m.find() || m.group(1).isEmpty()) {
            return Duration.ofSeconds(20);
        }
        String when = m.group(1);
        if (when.endsWith("ms")) {
            return Duration.ofMillis((long) number(when.substring(0, when.length() - 2)) + 1000);
        }
        double seconds = 0;
        Matcher part = TIME_PART.matcher(when);
        while (part.find()) {
            double value = number(part.group(1));
            seconds += switch (part.group(2)) {
                case "h" -> value * 3600;
                case "m" -> value * 60;
                default -> value;
            };
        }
        return Duration.ofMillis((long) (seconds * 1000) + 1000);
    }

    /** A number a server wrote ("7.66"), or 0 when it is none ("." or "1.2.3"). */
    private static double number(String text) {
        try {
            return Double.parseDouble(text);
        } catch (NumberFormatException e) {
            return 0;
        }
    }

    private static final Pattern ERROR_MESSAGE = Pattern.compile("\"message\"\\s*:\\s*\"([^\"]+)\"");

    /** The first sentence of the server's own error message, without its JSON around it. */
    static String serverMessage(String text) {
        Matcher m = ERROR_MESSAGE.matcher(text);
        String message = m.find() ? m.group(1) : text.strip();
        // patterns that start with their words, not with spaces, so a long run of spaces costs nothing
        message = message.replaceAll("in organization `[^`]{0,200}` ?", "").replaceAll("service tier `[^`]{0,200}` ?", "").replaceAll(" {2,}", " ");
        // hidden before it is cut, so a cut never leaves part of a secret behind
        message = com.obdx.factory.common.Messages.redacted(message);
        int end = message.indexOf(". ");
        return end > 0 ? message.substring(0, end) : message.length() > 200 ? message.substring(0, 200) : message;
    }

    /** The messages of an error and its causes, at most 4 KB: the patterns read only the start of what a server sent. */
    static String messages(Throwable e) {
        StringBuilder text = new StringBuilder();
        for (Throwable t = e; t != null && text.length() < MAX_ERROR_TEXT; t = t.getCause()) {
            if (t.getMessage() != null) {
                // hidden first, then cut: no part of a secret is left at a cut (the scan is linear in the length)
                String m = t.getMessage();
                String hidden = com.obdx.factory.common.Messages.redacted(m);
                text.append(hidden.length() > 2 * MAX_ERROR_TEXT ? hidden.substring(0, 2 * MAX_ERROR_TEXT) : hidden).append('\n');
            }
        }
        return text.length() > MAX_ERROR_TEXT ? text.substring(0, MAX_ERROR_TEXT) : text.toString();
    }

    static final int MAX_ERROR_TEXT = 4096;

    /**
     * A JSON answer, streamed where the server allows it: a long answer from a slow model (a spec drafted from a BRD,
     * a file written on a laptop's CPU) is then not cut off while the model is still writing, because the timeout
     * counts from the last piece. A server that refuses JSON in a stream answers in one piece from then on.
     */
    @Override
    public ChatResult chatJson(String systemPrompt, String userPrompt) {
        return limited(systemPrompt, userPrompt, () -> json(systemPrompt, userPrompt));
    }

    private ChatResult json(String systemPrompt, String userPrompt) {
        Connection current = connection;
        if (ollama.isOllama(current.baseUrl())) {
            return ollamaChat(current, systemPrompt, userPrompt, true, piece -> { });
        }
        if (current.jsonStreams().get()) {
            AtomicLong pieces = new AtomicLong();
            try {
                return streamed(current, systemPrompt, UserMessage.from(userPrompt), ResponseFormat.JSON, piece -> pieces.incrementAndGet());
            } catch (ModelGatewayException e) {
                String refusal = messages(e);
                // A refusal of a parameter or of the size is no refusal of JSON in a stream: limited() handles it
                if (pieces.get() > 0 || !refused(e) || tooLarge(refusal) != null || outputTooLarge(refusal) != null || reasoningEffortRefused(refusal)
                        || completionTokensAsked(refusal) || answerMaxRefused(refusal) > 0) {
                    throw e;
                }
                current.jsonStreams().set(false);
            }
        }
        return chat(systemPrompt, userPrompt, ResponseFormat.JSON);
    }

    @Override
    public ChatResult chatJsonWithImage(String systemPrompt, String userPrompt, byte[] image, String mimeType) {
        // Through limited(), as every call: its limits are learned, and this thread's per-call state is cleared after it
        return limited(systemPrompt, userPrompt, () -> chat(systemPrompt, UserMessage.from(TextContent.from(userPrompt),
                ImageContent.from(Base64.getEncoder().encodeToString(image), mimeType)), ResponseFormat.JSON));
    }

    @Override
    public ChatResult chatStream(String systemPrompt, String userPrompt, Consumer<String> pieces) {
        // A rate limit after pieces were handed on is not waited out: asking again would hand them on twice
        java.util.concurrent.atomic.AtomicBoolean delivered = new java.util.concurrent.atomic.AtomicBoolean();
        Consumer<String> counted = piece -> {
            delivered.set(true);
            pieces.accept(piece);
        };
        return limited(systemPrompt, userPrompt, () -> {
            Connection current = connection;
            if (ollama.isOllama(current.baseUrl())) {
                return ollamaChat(current, systemPrompt, userPrompt, false, counted);
            }
            return streamed(current, systemPrompt, UserMessage.from(userPrompt), null, counted);
        }, () -> !delivered.get());
    }

    /**
     * A chat with an Ollama server through its own API, which takes a context large enough for the prompt (see
     * OllamaChat); timed from the last piece, like a streamed answer.
     */
    private ChatResult ollamaChat(Connection current, String systemPrompt, String userPrompt, boolean jsonFormat, Consumer<String> pieces) {
        logRequest(current, (systemPrompt == null ? 0 : systemPrompt.length()) + userPrompt.length(), 0);
        long start = System.nanoTime();
        AtomicLong lastPiece = new AtomicLong(start);
        java.util.concurrent.atomic.AtomicReference<java.io.InputStream> body = new java.util.concurrent.atomic.AtomicReference<>();
        CompletableFuture<OllamaChat.Answer> done = new CompletableFuture<>();
        Thread worker = Thread.ofVirtual().name("ollama-chat").start(() -> {
            try {
                done.complete(ollama.chat(current.baseUrl(), current.chatModelName(), systemFor(current, systemPrompt), userPrompt, jsonFormat, pieces, lastPiece::set, body::set));
            } catch (Throwable t) {
                done.completeExceptionally(t);
            }
        });
        try {
            while (true) {
                try {
                    OllamaChat.Answer answer = done.get(1, TimeUnit.SECONDS);
                    if (answer.cutOff()) {
                        warnCutOff(current, answer.text());
                    }
                    return new ChatResult(withoutThinking(answer.text()), current.chatModelName(), (System.nanoTime() - start) / 1_000_000, answer.cutOff());
                } catch (TimeoutException e) {
                    if (System.nanoTime() - lastPiece.get() > timeout.toNanos()) {
                        stop(worker, body.get());
                        throw chatFailure(current, new IllegalStateException("timed out", new java.net.http.HttpTimeoutException("request timed out")));
                    }
                }
            }
        } catch (InterruptedException e) {
            stop(worker, body.get());
            Thread.currentThread().interrupt();
            throw new ModelGatewayException("Chat model '" + current.chatModelName() + "' at " + ModelSettings.shown(current.baseUrl()) + " was stopped", e);
        } catch (ExecutionException e) {
            Throwable cause = e.getCause();
            throw chatFailure(current, cause instanceof RuntimeException r ? r : new IllegalStateException(cause.getMessage(), cause));
        }
    }

    private static void stop(Thread worker, java.io.InputStream body) {
        worker.interrupt();
        if (body != null) {
            try {
                body.close();
            } catch (java.io.IOException e) {
                // closed already
            }
        }
    }

    private ChatResult streamed(Connection current, String systemPrompt, UserMessage userMessage, ResponseFormat format, Consumer<String> pieces) {
        long start = System.nanoTime();
        AtomicLong lastPiece = new AtomicLong(start);
        CompletableFuture<ChatResponse> done = new CompletableFuture<>();
        try {
            Prepared prepared = prepare(current, systemPrompt, userMessage, format);
            int max = prepared.max();
            current.streamingChatModel().chat(prepared.request(),
                    new StreamingChatResponseHandler() {
                        @Override
                        public void onPartialResponse(String piece) {
                            lastPiece.set(System.nanoTime());
                            pieces.accept(piece);
                        }

                        @Override
                        public void onCompleteResponse(ChatResponse response) {
                            done.complete(response);
                        }

                        @Override
                        public void onError(Throwable error) {
                            done.completeExceptionally(error);
                        }
                    });
            // The timeout counts from the last piece: a slow model that keeps writing is not cut off
            while (true) {
                try {
                    ChatResponse response = done.get(1, TimeUnit.SECONDS);
                    String model = response.metadata() != null && response.metadata().modelName() != null
                            ? response.metadata().modelName() : current.chatModelName();
                    String reply = response.aiMessage() == null || response.aiMessage().text() == null ? "" : response.aiMessage().text();
                    return new ChatResult(withoutThinking(reply), model, (System.nanoTime() - start) / 1_000_000, cutOff(current, response, reply, max));
                } catch (TimeoutException e) {
                    if (System.nanoTime() - lastPiece.get() > timeout.toNanos()) {
                        done.cancel(true);
                        throw e;
                    }
                }
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new ModelGatewayException("Chat model '" + current.chatModelName() + "' at " + ModelSettings.shown(current.baseUrl()) + " was stopped", e);
        } catch (ExecutionException e) {
            throw chatFailure(current, e.getCause() instanceof RuntimeException r ? r : new IllegalStateException(e.getCause()));
        } catch (TimeoutException e) {
            throw chatFailure(current, new IllegalStateException("timed out", e));
        } catch (RuntimeException e) {
            throw chatFailure(current, e);
        }
    }

    private ChatResult chat(String systemPrompt, String userPrompt, ResponseFormat format) {
        Connection current = connection;
        if (ollama.isOllama(current.baseUrl())) {
            return ollamaChat(current, systemPrompt, userPrompt, format != null, piece -> { });
        }
        return chat(systemPrompt, UserMessage.from(userPrompt), format);
    }

    private static List<ChatMessage> messages(String systemPrompt, UserMessage userMessage) {
        List<ChatMessage> messages = new ArrayList<>();
        if (systemPrompt != null && !systemPrompt.isBlank()) {
            messages.add(SystemMessage.from(systemPrompt));
        }
        messages.add(userMessage);
        return messages;
    }

    private ChatResult chat(String systemPrompt, UserMessage userMessage, ResponseFormat format) {
        Connection current = connection;
        long start = System.nanoTime();
        try {
            Prepared prepared = prepare(current, systemPrompt, userMessage, format);
            int max = prepared.max();
            ChatResponse response = current.chatModel().chat(prepared.request());
            long latencyMs = (System.nanoTime() - start) / 1_000_000;
            String model = response.metadata().modelName() != null ? response.metadata().modelName() : current.chatModelName();
            return new ChatResult(withoutThinking(response.aiMessage().text()), model, latencyMs,
                    cutOff(current, response, response.aiMessage().text(), max));
        } catch (RuntimeException e) {
            throw chatFailure(current, e);
        }
    }

    /**
     * The model stopped at its output limit (finish reason "length"), or an answer without a finish reason ended at about
     * max_tokens (a stream the server ended early): the reply is incomplete. Also learns the server's tokens a minute
     * from the response's rate-limit headers.
     */
    private boolean cutOff(Connection current, ChatResponse response, String reply, int max) {
        learnFromHeaders(current, response);
        clearCapIfExceeded(current, response, reply);
        FinishReason reason = response.metadata() == null ? null : response.metadata().finishReason();
        boolean cut = reason == FinishReason.LENGTH || (reason != FinishReason.STOP && reason != FinishReason.TOOL_EXECUTION
                && endedAtMax(reply, max, current.limits().charsPerToken));
        if (cut) {
            warnCutOff(current, reply);
        }
        return cut;
    }

    /**
     * A remembered output cap that an answer went past (the server wrote more in one answer than the cap allows) no longer
     * holds: it is cleared, and answers ask for as much as the other limits allow again.
     */
    private void clearCapIfExceeded(Connection current, ChatResponse response, String reply) {
        Integer counted = response.tokenUsage() == null ? null : response.tokenUsage().outputTokenCount();
        int written = counted != null && counted > 0 ? counted : (int) ((reply == null ? 0 : reply.length()) / current.limits().charsPerToken);
        // counted against this minute's output allowance
        current.limits().wrote(written, System.currentTimeMillis());
        raiseInput(current);
        int cap = current.limits().output;
        if (cap <= 0) {
            return;
        }
        // A call without the limit proves nothing unless it asked for more than the limit allows
        Integer asked = ASKED.get();
        boolean probed = Boolean.TRUE.equals(PROBE.get()) && asked != null && asked > cap;
        if (written > cap || probed) {
            current.limits().output = 0;
            saveLimits(current);
            log.info(probed ? "Chat model '{}' answered ({} tokens) without its learned output limit of {} tokens a minute: the limit is cleared"
                            : "Chat model '{}' wrote {} tokens in one answer, more than its learned output limit of {} a minute: the limit is cleared",
                    current.chatModelName(), written, cap);
        }
    }

    /** A prompt the server took that is larger than the learned input limit: the limit was too low, and is raised to it. */
    private void raiseInput(Connection current) {
        Integer chars = PROMPT.get();
        int input = current.limits().input;
        if (chars == null || input <= 0) {
            return;
        }
        int tokens = (int) (chars / current.limits().charsPerToken);
        if (tokens > input) {
            current.limits().input = tokens;
            saveLimits(current);
            log.info("Chat model '{}' took a prompt of about {} tokens, more than its learned input limit of {}: the limit is raised",
                    current.chatModelName(), tokens, input);
        }
    }

    /** An answer about as long as max_tokens allows (95% of it, as estimated from its characters). */
    static boolean endedAtMax(String reply, int max, double charsPerToken) {
        return max > 0 && reply != null && reply.length() / charsPerToken >= max * 0.95;
    }

    /**
     * Groq (and OpenAI) say in every response how many tokens a minute the key has (x-ratelimit-limit-tokens): learned
     * as the limit prompt and max_tokens are counted against together, so max_tokens is sized before any refusal.
     */
    private void learnFromHeaders(Connection current, ChatResponse response) {
        if (!(response.metadata() instanceof OpenAiChatResponseMetadata openAi) || openAi.rawHttpResponse() == null) {
            return;
        }
        int limit = tokensPerMinute(openAi.rawHttpResponse().headers());
        int before = current.limits().total;
        if (limit > 0 && limit >= MIN_TOTAL && limit != before) {
            current.limits().total = limit;
            saveLimits(current);
            log.info("Learned the model server's per-minute token limit: {} (chat model '{}', from its response headers{}); "
                    + "max_tokens is sized to fit it", limit, current.chatModelName(), before > 0 ? "; was " + before : "");
        }
    }

    /** x-ratelimit-limit-tokens from response headers (any case), or 0. */
    static int tokensPerMinute(Map<String, List<String>> headers) {
        if (headers == null) {
            return 0;
        }
        for (Map.Entry<String, List<String>> header : headers.entrySet()) {
            if (header.getKey() != null && header.getKey().equalsIgnoreCase("x-ratelimit-limit-tokens") && header.getValue() != null
                    && !header.getValue().isEmpty()) {
                try {
                    return Integer.parseInt(header.getValue().getFirst().strip());
                } catch (NumberFormatException e) {
                    return 0;
                }
            }
        }
        return 0;
    }

    private static void warnCutOff(Connection current, String reply) {
        int cap = current.limits().output;
        log.warn("Chat model '{}' stopped at its output limit after {} characters{}; the answer is incomplete", current.chatModelName(),
                reply == null ? 0 : reply.length(), cap > 0 ? " (its server allows " + cap + " output tokens a minute; use a model "
                        + "or plan with a higher output limit)" : "");
    }

    private ModelGatewayException chatFailure(Connection current, RuntimeException e) {
        if (timedOut(e)) {
            return new ModelGatewayException("Chat model '" + current.chatModelName() + "' at " + ModelSettings.shown(current.baseUrl()) + " did not answer within "
                    + readable(timeout) + ". It may be busy, for example embedding documents an import added: try again when that "
                    + "finishes. If it keeps happening, use a faster model server (one with a GPU) or a longer FACTORY_MODEL_TIMEOUT.", e);
        }
        return new ModelGatewayException(
                "Chat model '" + current.chatModelName() + "' at " + ModelSettings.shown(current.baseUrl()) + " failed: " + failureReason(e), e);
    }

    /**
     * Why a call failed, in plain words with what to do: a server that refused the connection or cannot be found, a
     * server error (5xx) with the server's own sentence instead of its JSON, else the error's message. Secrets hidden.
     */
    static String failureReason(Throwable e) {
        int status = 0;
        for (Throwable t = e; t != null; t = t.getCause()) {
            if (t instanceof java.net.ConnectException || t instanceof java.nio.channels.UnresolvedAddressException
                    || t.getMessage() != null && t.getMessage().contains("Connection refused")) {
                return "the model server is not reachable (it refused the connection). Start it, or check its address on the Models "
                        + "page, then try again.";
            }
            if (t instanceof java.net.UnknownHostException) {
                return "the model server's host cannot be found. Check its address on the Models page, then try again.";
            }
            if (status == 0 && t instanceof dev.langchain4j.exception.HttpException h) {
                status = h.statusCode();
            }
        }
        String text = messages(e);
        if (status >= 500 || status == 0 && e instanceof dev.langchain4j.exception.InternalServerException) {
            return "the model server answered with an error" + (status > 0 ? " (HTTP " + status + ")" : "") + ": "
                    + serverMessage(text).replaceAll("\\.$", "") + ". Try again in a few minutes; if it keeps failing, check the model server.";
        }
        String message = e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage();
        // a server's JSON error body: its own sentence
        return message.stripLeading().startsWith("{") ? serverMessage(text) : com.obdx.factory.common.Messages.redacted(message);
    }

    @Override
    public float[] embedQuery(String text) {
        return embed(queryPrefix(connection.embeddingModelName()) + text);
    }

    @Override
    public List<float[]> embedPassages(List<String> texts) {
        String prefix = passagePrefix(connection.embeddingModelName());
        return embedAll(prefix.isEmpty() ? texts : texts.stream().map(t -> prefix + t).toList());
    }

    /**
     * What the common open embedding models expect before a search question: nomic-embed-text "search_query: ", the e5
     * family "query: ", Qwen3-Embedding a task instruction, the English bge models and mxbai their retrieval
     * instruction. bge-m3 and the others take the text as it is.
     */
    static String queryPrefix(String model) {
        String m = model == null ? "" : model.toLowerCase(java.util.Locale.ROOT);
        if (m.contains("nomic-embed")) {
            return "search_query: ";
        }
        if (m.contains("qwen3-embedding")) {
            return "Instruct: Given a question about Oracle Banking Digital Experience, retrieve the manual sections, notes or code "
                    + "that answer it\nQuery: ";
        }
        if (m.contains("bge-m3")) {
            return "";
        }
        if (m.contains("e5-") || m.contains("/e5") || m.startsWith("e5")) {
            return "query: ";
        }
        if (m.contains("bge-") || m.contains("mxbai-embed")) {
            return "Represent this sentence for searching relevant passages: ";
        }
        return "";
    }

    /** The counterpart for passages: nomic-embed-text "search_document: ", e5 "passage: ". */
    static String passagePrefix(String model) {
        String m = model == null ? "" : model.toLowerCase(java.util.Locale.ROOT);
        if (m.contains("nomic-embed")) {
            return "search_document: ";
        }
        if (m.contains("e5-") || m.contains("/e5") || m.startsWith("e5")) {
            return "passage: ";
        }
        return "";
    }

    @Override
    public float[] embed(String text) {
        Connection current = connection;
        try {
            return current.embeddingModel().embed(text).content().vector();
        } catch (RuntimeException e) {
            throw embeddingFailure(current, e);
        }
    }

    @Override
    public List<float[]> embedAll(List<String> texts) {
        Connection current = connection;
        try {
            List<Embedding> embeddings = current.embeddingModel().embedAll(texts.stream().map(TextSegment::from).toList()).content();
            return embeddings.stream().map(Embedding::vector).toList();
        } catch (RuntimeException e) {
            throw embeddingFailure(current, e);
        }
    }

    /** The client reports a call that ran out of time in several ways, depending on where it stopped. */
    /** The server turned the request down (400 Bad Request and the like), not a server that is down or slow. */
    static boolean refused(Throwable e) {
        for (Throwable t = e; t != null; t = t.getCause()) {
            if (t instanceof dev.langchain4j.exception.InvalidRequestException
                    || (t instanceof dev.langchain4j.exception.HttpException h && h.statusCode() >= 400 && h.statusCode() < 500
                    && h.statusCode() != 401 && h.statusCode() != 403 && h.statusCode() != 429)) {
                return true;
            }
        }
        return false;
    }

    static boolean timedOut(Throwable e) {
        for (Throwable t = e; t != null; t = t.getCause()) {
            if (t instanceof java.net.http.HttpTimeoutException || t instanceof java.net.SocketTimeoutException
                    || t instanceof java.util.concurrent.TimeoutException || t.getClass().getSimpleName().contains("Timeout")
                    || (t.getMessage() != null && t.getMessage().toLowerCase(java.util.Locale.ROOT).contains("timed out"))) {
                return true;
            }
        }
        return false;
    }

    /** Whether the server said how long to wait ("try again in 7.66s"). */
    static boolean waitGiven(String text) {
        Matcher m = TRY_AGAIN.matcher(text);
        return m.find() && !m.group(1).isEmpty();
    }

    /** A daily limit: "tokens per day (TPD)", "requests per day", "daily limit". */
    static boolean daily(String text) {
        String lower = text.toLowerCase(java.util.Locale.ROOT);
        return lower.contains("per day") || lower.contains("(tpd)") || lower.contains("(rpd)") || lower.contains("daily");
    }

    /** A wait as people say it: "45 seconds", "about 2 minutes", "about 3 hours". */
    static String roughly(Duration d) {
        long s = d.toSeconds();
        if (s < 90) {
            return Math.max(1, s) + " seconds";
        }
        if (s < 2 * 3600) {
            return "about " + Math.round(s / 60.0) + " minutes";
        }
        return "about " + Math.round(s / 3600.0) + " hours";
    }

    static String readable(Duration d) {
        long s = d.toSeconds();
        return s % 60 == 0 && s >= 60 ? (s / 60) + (s == 60 ? " minute" : " minutes") : s + " seconds";
    }

    /** Local servers accept any key, but the client needs one. */
    private static String keyOrPlaceholder(String apiKey) {
        return apiKey == null || apiKey.isBlank() ? "not-needed" : apiKey;
    }

    private static ModelGatewayException embeddingFailure(Connection current, RuntimeException e) {
        return new ModelGatewayException(
                "Embedding model '" + current.embeddingModelName() + "' at " + ModelSettings.shown(current.embeddingUrl()) + " failed: " + failureReason(e), e);
    }
}
