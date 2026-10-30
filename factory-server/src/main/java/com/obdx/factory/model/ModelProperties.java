package com.obdx.factory.model;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

import java.time.Duration;

/**
 * Connection to an OpenAI-compatible model endpoint: a local Ollama or vLLM server, or a privately hosted API.
 *
 * @param baseUrl        endpoint base URL including the API version path, for example http://localhost:11434/v1
 * @param apiKey         API key; local servers usually accept any value
 * @param chatModel      model used for chat and code generation
 * @param embeddingModel model used for search embeddings
 * @param timeout          maximum time to wait for one model call
 * @param embeddingBaseUrl server of the embedding model when it is not baseUrl, for example chat from a cloud API and
 *                         embeddings from Ollama on this computer; empty: baseUrl
 * @param embeddingApiKey  API key of that server
 * @param maxContext       the most context (tokens) the factory asks an Ollama server for: Ollama runs a model with
 *                         4,096 unless asked, and the factory asks for what a prompt needs up to this and the model's
 *                         own limit. Larger needs more memory on the model server
 */
@ConfigurationProperties(prefix = "factory.model")
public record ModelProperties(
        @DefaultValue("http://localhost:11434/v1") String baseUrl,
        @DefaultValue("not-needed") String apiKey,
        @DefaultValue("qwen2.5-coder:7b") String chatModel,
        @DefaultValue("nomic-embed-text") String embeddingModel,
        @DefaultValue("120s") Duration timeout,
        String embeddingBaseUrl,
        String embeddingApiKey,
        @DefaultValue("16384") int maxContext) {
}
