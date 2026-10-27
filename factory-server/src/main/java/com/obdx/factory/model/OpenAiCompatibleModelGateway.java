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
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

/**
 * {@link ModelGateway} for any server that speaks the OpenAI-compatible API (Ollama, vLLM, private cloud endpoints).
 */
@Component
public class OpenAiCompatibleModelGateway implements ModelGateway {

    private final ModelProperties properties;
    private final ChatModel chatModel;
    private final EmbeddingModel embeddingModel;

    public OpenAiCompatibleModelGateway(ModelProperties properties) {
        this.properties = properties;
        this.chatModel = OpenAiChatModel.builder()
                .baseUrl(properties.baseUrl())
                .apiKey(properties.apiKey())
                .modelName(properties.chatModel())
                .timeout(properties.timeout())
                .maxRetries(0)
                .build();
        this.embeddingModel = OpenAiEmbeddingModel.builder()
                .baseUrl(properties.baseUrl())
                .apiKey(properties.apiKey())
                .modelName(properties.embeddingModel())
                .timeout(properties.timeout())
                .maxRetries(0)
                .build();
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
            ChatResponse response = chatModel.chat(request.build());
            long latencyMs = (System.nanoTime() - start) / 1_000_000;
            String model = response.metadata().modelName() != null ? response.metadata().modelName() : properties.chatModel();
            return new ChatResult(response.aiMessage().text(), model, latencyMs);
        } catch (RuntimeException e) {
            throw new ModelGatewayException(
                    "Chat model '" + properties.chatModel() + "' at " + properties.baseUrl() + " failed: " + e.getMessage(), e);
        }
    }

    @Override
    public float[] embed(String text) {
        try {
            return embeddingModel.embed(text).content().vector();
        } catch (RuntimeException e) {
            throw embeddingFailure(e);
        }
    }

    @Override
    public List<float[]> embedAll(List<String> texts) {
        try {
            List<Embedding> embeddings = embeddingModel.embedAll(texts.stream().map(TextSegment::from).toList()).content();
            return embeddings.stream().map(Embedding::vector).toList();
        } catch (RuntimeException e) {
            throw embeddingFailure(e);
        }
    }

    private ModelGatewayException embeddingFailure(RuntimeException e) {
        return new ModelGatewayException(
                "Embedding model '" + properties.embeddingModel() + "' at " + properties.baseUrl() + " failed: " + e.getMessage(), e);
    }
}
