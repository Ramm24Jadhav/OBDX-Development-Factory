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

/**
 * {@link ModelGateway} for any server that speaks the OpenAI-compatible API (Ollama, vLLM, private cloud endpoints).
 * It connects to the server and models chosen on the Models page ({@link ModelSettings}) and reconnects when they change.
 */
@Component
public class OpenAiCompatibleModelGateway implements ModelGateway {

    /** The models of one choice of servers; replaced as a whole when the settings change. */
    private record Connection(String baseUrl, String chatModelName, String embeddingUrl, String embeddingModelName,
                              ChatModel chatModel, StreamingChatModel streamingChatModel, EmbeddingModel embeddingModel) {
    }

    private final Duration timeout;
    private volatile Connection connection;

    @Autowired
    public OpenAiCompatibleModelGateway(ModelProperties properties, ModelSettings settings) {
        this.timeout = properties.timeout();
        this.connection = connect(settings.current());
    }

    /** With the FACTORY_MODEL_* settings only (tests). */
    public OpenAiCompatibleModelGateway(ModelProperties properties) {
        this.timeout = properties.timeout();
        this.connection = connect(new ModelSettings.Current(properties.baseUrl(), properties.apiKey(), properties.chatModel(),
                properties.embeddingModel(), null, null, false, null, null));
    }

    @EventListener
    public void settingsChanged(ModelSettings.Changed event) {
        this.connection = connect(event.settings());
    }

    private Connection connect(ModelSettings.Current settings) {
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
                        .build());
    }

    @Override
    public ChatResult chat(String systemPrompt, String userPrompt) {
        return chat(systemPrompt, userPrompt, null);
    }

    @Override
    public ChatResult chatJson(String systemPrompt, String userPrompt) {
        return chat(systemPrompt, userPrompt, ResponseFormat.JSON);
    }

    @Override
    public ChatResult chatJsonWithImage(String systemPrompt, String userPrompt, byte[] image, String mimeType) {
        return chat(systemPrompt, UserMessage.from(TextContent.from(userPrompt),
                ImageContent.from(Base64.getEncoder().encodeToString(image), mimeType)), ResponseFormat.JSON);
    }

    @Override
    public ChatResult chatStream(String systemPrompt, String userPrompt, Consumer<String> pieces) {
        Connection current = connection;
        long start = System.nanoTime();
        AtomicLong lastPiece = new AtomicLong(start);
        CompletableFuture<ChatResponse> done = new CompletableFuture<>();
        try {
            current.streamingChatModel().chat(ChatRequest.builder().messages(messages(systemPrompt, UserMessage.from(userPrompt))).build(),
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
                    return new ChatResult(reply, model, (System.nanoTime() - start) / 1_000_000);
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
            return new ChatResult(response.aiMessage().text(), model, latencyMs);
        } catch (RuntimeException e) {
            throw chatFailure(current, e);
        }
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
