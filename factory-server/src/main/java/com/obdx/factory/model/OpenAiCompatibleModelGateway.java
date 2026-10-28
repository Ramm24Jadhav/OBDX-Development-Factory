package com.obdx.factory.model;

import dev.langchain4j.data.embedding.Embedding;
import dev.langchain4j.data.message.ChatMessage;
import dev.langchain4j.data.message.SystemMessage;
import dev.langchain4j.data.message.UserMessage;
import dev.langchain4j.data.segment.TextSegment;
import dev.langchain4j.model.chat.ChatModel;
import dev.langchain4j.model.chat.request.ChatRequest;
import dev.langchain4j.model.chat.request.ResponseFormat;
import dev.langchain4j.model.chat.response.ChatResponse;
import dev.langchain4j.model.embedding.EmbeddingModel;
import dev.langchain4j.model.openai.OpenAiChatModel;
import dev.langchain4j.model.openai.OpenAiEmbeddingModel;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;

/**
 * {@link ModelGateway} for any server that speaks the OpenAI-compatible API (Ollama, vLLM, private cloud endpoints).
 * It connects to the server and models chosen on the Models page ({@link ModelSettings}) and reconnects when they change.
 */
@Component
public class OpenAiCompatibleModelGateway implements ModelGateway {

    /** The models of one choice of server; replaced as a whole when the settings change. */
    private record Connection(String baseUrl, String chatModelName, String embeddingModelName, ChatModel chatModel,
                              EmbeddingModel embeddingModel) {
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
                properties.embeddingModel(), false, null, null));
    }

    @EventListener
    public void settingsChanged(ModelSettings.Changed event) {
        this.connection = connect(event.settings());
    }

    private Connection connect(ModelSettings.Current settings) {
        String apiKey = settings.apiKey() == null || settings.apiKey().isBlank() ? "not-needed" : settings.apiKey();
        return new Connection(settings.baseUrl(), settings.chatModel(), settings.embeddingModel(),
                OpenAiChatModel.builder()
                        .baseUrl(settings.baseUrl())
                        .apiKey(apiKey)
                        .modelName(settings.chatModel())
                        .timeout(timeout)
                        .maxRetries(0)
                        .build(),
                OpenAiEmbeddingModel.builder()
                        .baseUrl(settings.baseUrl())
                        .apiKey(apiKey)
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

    private ChatResult chat(String systemPrompt, String userPrompt, ResponseFormat format) {
        Connection current = connection;
        List<ChatMessage> messages = new ArrayList<>();
        if (systemPrompt != null && !systemPrompt.isBlank()) {
            messages.add(SystemMessage.from(systemPrompt));
        }
        messages.add(UserMessage.from(userPrompt));

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
            throw new ModelGatewayException(
                    "Chat model '" + current.chatModelName() + "' at " + current.baseUrl() + " failed: " + e.getMessage(), e);
        }
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

    private static ModelGatewayException embeddingFailure(Connection current, RuntimeException e) {
        return new ModelGatewayException(
                "Embedding model '" + current.embeddingModelName() + "' at " + current.baseUrl() + " failed: " + e.getMessage(), e);
    }
}
