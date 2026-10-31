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
import dev.langchain4j.model.openai.OpenAiEmbeddingModel;
import dev.langchain4j.model.openai.OpenAiStreamingChatModel;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
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
                              java.util.concurrent.atomic.AtomicBoolean jsonStreams, Limits limits) {
    }

    /** What the chat model's server takes in one request, learned when it refused a larger one. */
    private static final class Limits {
        volatile int input;
        volatile double charsPerToken = 3.5;
    }

    /** "Request too large ... Limit 7000, Requested 7663": a per-minute token limit smaller than the request. */
    private static final Pattern TOO_LARGE = Pattern.compile("(?i)limit:?\\s*(\\d+),\\s*requested:?\\s*(\\d+)");
    /** "maximum context length is 8192 tokens. However, your messages resulted in 9000 tokens" */
    private static final Pattern CONTEXT_LENGTH = Pattern.compile("(?is)maximum context length is (\\d+) tokens.*?(?:resulted in|requested) (\\d+) tokens");
    /** "Please try again in 7.66s", "in 1m30.5s", "in 330ms" */
    private static final Pattern TRY_AGAIN = Pattern.compile("(?i)try again in ([\\d.]+ms|(?:\\d+h)?(?:\\d+m)?(?:[\\d.]+s)?)");
    private static final Pattern TIME_PART = Pattern.compile("([\\d.]+)([hms])");
    /** Longest rate-limit wait before giving up; a per-minute limit frees up within it. */
    static final Duration MAX_WAIT = Duration.ofSeconds(90);
    private static final int RATE_LIMIT_ATTEMPTS = 8;

    private final Duration timeout;
    /** max_tokens for each answer; null leaves it to the server (FACTORY_MODEL_MAX_OUTPUT_TOKENS). */
    private final Integer maxOutput;
    private final OllamaChat ollama;
    private volatile Connection connection;

    @Autowired
    public OpenAiCompatibleModelGateway(ModelProperties properties, ModelSettings settings) {
        this.timeout = properties.timeout();
        this.maxOutput = properties.maxOutput() > 0 ? properties.maxOutput() : null;
        this.ollama = new OllamaChat(properties.maxContext());
        this.connection = connect(settings.current());
    }

    /** With the FACTORY_MODEL_* settings only (tests). */
    public OpenAiCompatibleModelGateway(ModelProperties properties) {
        this.timeout = properties.timeout();
        this.maxOutput = properties.maxOutput() > 0 ? properties.maxOutput() : null;
        this.ollama = new OllamaChat(properties.maxContext());
        this.connection = connect(new ModelSettings.Current(properties.baseUrl(), properties.apiKey(), properties.chatModel(),
                properties.embeddingModel(), null, null, false, null, null));
    }

    @EventListener
    public void settingsChanged(ModelSettings.Changed event) {
        ollama.forget();
        this.connection = connect(event.settings());
    }

    private Connection connect(ModelSettings.Current settings) {
        return new Connection(settings.baseUrl(), settings.chatModel(), settings.embeddingUrl(), settings.embeddingModel(),
                OpenAiChatModel.builder()
                        .baseUrl(settings.baseUrl())
                        .apiKey(keyOrPlaceholder(settings.apiKey()))
                        .modelName(settings.chatModel())
                        .maxTokens(maxOutput)
                        .timeout(timeout)
                        .maxRetries(0)
                        .build(),
                OpenAiStreamingChatModel.builder()
                        .baseUrl(settings.baseUrl())
                        .apiKey(keyOrPlaceholder(settings.apiKey()))
                        .modelName(settings.chatModel())
                        .maxTokens(maxOutput)
                        .timeout(timeout)
                        .build(),
                OpenAiEmbeddingModel.builder()
                        .baseUrl(settings.embeddingUrl())
                        .apiKey(keyOrPlaceholder(settings.embeddingKey()))
                        .modelName(settings.embeddingModel())
                        .timeout(timeout)
                        .maxRetries(0)
                        .build(),
                new java.util.concurrent.atomic.AtomicBoolean(true), new Limits());
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
        Connection current = connection;
        for (int attempt = 1; ; attempt++) {
            try {
                return call.get();
            } catch (ModelGatewayException e) {
                String text = messages(e);
                int[] tooLarge = tooLarge(text);
                if (tooLarge != null) {
                    int chars = (systemPrompt == null ? 0 : systemPrompt.length()) + userPrompt.length();
                    int input = inputLimit(text, tooLarge[0], maxOutput);
                    current.limits().input = current.limits().input == 0 ? input : Math.min(current.limits().input, input);
                    current.limits().charsPerToken = Math.clamp((double) chars / tooLarge[1], 2.0, 6.0);
                    throw new PromptTooLargeException("Chat model '" + current.chatModelName() + "' at " + current.baseUrl() + " takes at most "
                            + tooLarge[0] + " tokens in one request; this one had " + tooLarge[1] + ".", tooLarge[0], tooLarge[1], e);
                }
                Duration wait = rateLimitWait(text);
                if (wait == null || !canRetry.getAsBoolean()) {
                    throw e;
                }
                if (attempt >= RATE_LIMIT_ATTEMPTS) {
                    throw new ModelGatewayException("Chat model '" + current.chatModelName() + "' at " + current.baseUrl()
                            + " stayed at its rate limit after " + attempt + " tries (" + serverMessage(text) + "). Try again in a few "
                            + "minutes, or use a plan or model with larger limits.", e);
                }
                if (wait.compareTo(MAX_WAIT) > 0) {
                    throw new ModelGatewayException("Chat model '" + current.chatModelName() + "' at " + current.baseUrl()
                            + " reached its rate limit and asks to wait " + readable(wait) + " (often the daily limit of a free plan). "
                            + "Try again then, or use a plan or model with a larger limit.", e);
                }
                try {
                    Thread.sleep(wait);
                } catch (InterruptedException interrupted) {
                    Thread.currentThread().interrupt();
                    throw new ModelGatewayException("Chat model '" + current.chatModelName() + "' at " + current.baseUrl() + " was stopped", interrupted);
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
            return Duration.ofMillis((long) Double.parseDouble(when.substring(0, when.length() - 2)) + 1000);
        }
        double seconds = 0;
        Matcher part = TIME_PART.matcher(when);
        while (part.find()) {
            double value = Double.parseDouble(part.group(1));
            seconds += switch (part.group(2)) {
                case "h" -> value * 3600;
                case "m" -> value * 60;
                default -> value;
            };
        }
        return Duration.ofMillis((long) (seconds * 1000) + 1000);
    }

    private static final Pattern ERROR_MESSAGE = Pattern.compile("\"message\"\\s*:\\s*\"([^\"]+)\"");

    /** The first sentence of the server's own error message, without its JSON around it. */
    static String serverMessage(String text) {
        Matcher m = ERROR_MESSAGE.matcher(text);
        String message = m.find() ? m.group(1) : text.strip();
        message = message.replaceAll("\\s+in organization `[^`]*`", "").replaceAll("\\s+service tier `[^`]*`", "");
        int end = message.indexOf(". ");
        return end > 0 ? message.substring(0, end) : message.length() > 200 ? message.substring(0, 200) : message;
    }

    private static String messages(Throwable e) {
        StringBuilder text = new StringBuilder();
        for (Throwable t = e; t != null; t = t.getCause()) {
            if (t.getMessage() != null) {
                text.append(t.getMessage()).append('\n');
            }
        }
        return text.toString();
    }

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
                if (pieces.get() > 0 || !refused(e) || tooLarge(messages(e)) != null) {
                    throw e;
                }
                current.jsonStreams().set(false);
            }
        }
        return chat(systemPrompt, userPrompt, ResponseFormat.JSON);
    }

    @Override
    public ChatResult chatJsonWithImage(String systemPrompt, String userPrompt, byte[] image, String mimeType) {
        return chat(systemPrompt, UserMessage.from(TextContent.from(userPrompt),
                ImageContent.from(Base64.getEncoder().encodeToString(image), mimeType)), ResponseFormat.JSON);
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
        long start = System.nanoTime();
        AtomicLong lastPiece = new AtomicLong(start);
        java.util.concurrent.atomic.AtomicReference<java.io.InputStream> body = new java.util.concurrent.atomic.AtomicReference<>();
        CompletableFuture<OllamaChat.Answer> done = new CompletableFuture<>();
        Thread worker = Thread.ofVirtual().name("ollama-chat").start(() -> {
            try {
                done.complete(ollama.chat(current.baseUrl(), current.chatModelName(), systemPrompt, userPrompt, jsonFormat, pieces, lastPiece::set, body::set));
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
                    return new ChatResult(answer.text(), current.chatModelName(), (System.nanoTime() - start) / 1_000_000, answer.cutOff());
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
            throw new ModelGatewayException("Chat model '" + current.chatModelName() + "' at " + current.baseUrl() + " was stopped", e);
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
            ChatRequest.Builder request = ChatRequest.builder().messages(messages(systemPrompt, userMessage));
            if (format != null) {
                request.responseFormat(format);
            }
            current.streamingChatModel().chat(request.build(),
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
                    return new ChatResult(reply, model, (System.nanoTime() - start) / 1_000_000, cutOff(current, response, reply));
                } catch (TimeoutException e) {
                    if (System.nanoTime() - lastPiece.get() > timeout.toNanos()) {
                        done.cancel(true);
                        throw e;
                    }
                }
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new ModelGatewayException("Chat model '" + current.chatModelName() + "' at " + current.baseUrl() + " was stopped", e);
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
        List<ChatMessage> messages = messages(systemPrompt, userMessage);

        long start = System.nanoTime();
        try {
            ChatRequest.Builder request = ChatRequest.builder().messages(messages);
            if (format != null) {
                request.responseFormat(format);
            }
            ChatResponse response = current.chatModel().chat(request.build());
            long latencyMs = (System.nanoTime() - start) / 1_000_000;
            String model = response.metadata().modelName() != null ? response.metadata().modelName() : current.chatModelName();
            return new ChatResult(response.aiMessage().text(), model, latencyMs, cutOff(current, response, response.aiMessage().text()));
        } catch (RuntimeException e) {
            throw chatFailure(current, e);
        }
    }

    /** The model stopped at its output limit (finish reason "length"): the reply is incomplete. */
    private static boolean cutOff(Connection current, ChatResponse response, String reply) {
        boolean cut = response.metadata() != null && response.metadata().finishReason() == dev.langchain4j.model.output.FinishReason.LENGTH;
        if (cut) {
            warnCutOff(current, reply);
        }
        return cut;
    }

    private static void warnCutOff(Connection current, String reply) {
        log.warn("Chat model '{}' stopped at its output limit after {} characters; the answer is incomplete",
                current.chatModelName(), reply == null ? 0 : reply.length());
    }

    private ModelGatewayException chatFailure(Connection current, RuntimeException e) {
        if (timedOut(e)) {
            return new ModelGatewayException("Chat model '" + current.chatModelName() + "' at " + current.baseUrl() + " did not answer within "
                    + readable(timeout) + ". It may be busy, for example embedding documents an import added: try again when that "
                    + "finishes. If it keeps happening, use a faster model server (one with a GPU) or a longer FACTORY_MODEL_TIMEOUT.", e);
        }
        return new ModelGatewayException(
                "Chat model '" + current.chatModelName() + "' at " + current.baseUrl() + " failed: " + e.getMessage(), e);
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
                "Embedding model '" + current.embeddingModelName() + "' at " + current.embeddingUrl() + " failed: " + e.getMessage(), e);
    }
}
