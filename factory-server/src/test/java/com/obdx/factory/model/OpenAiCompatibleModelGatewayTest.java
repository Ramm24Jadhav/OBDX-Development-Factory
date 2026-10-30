package com.obdx.factory.model;

import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Runs the gateway against a stub HTTP server that answers like an OpenAI-compatible endpoint (Ollama, vLLM).
 */
class OpenAiCompatibleModelGatewayTest {

    private HttpServer server;
    private final AtomicReference<String> lastChatRequest = new AtomicReference<>();

    @BeforeEach
    void startStubServer() throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/v1/chat/completions", exchange -> {
            lastChatRequest.set(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            if (lastChatRequest.get().matches("(?s).*\"stream\"\\s*:\\s*true.*")) {
                String chunk = "data: {\"id\":\"c1\",\"object\":\"chat.completion.chunk\",\"created\":1,\"model\":\"qwen2.5-coder:7b\","
                        + "\"choices\":[{\"index\":0,\"delta\":{\"content\":\"%s\"},\"finish_reason\":%s}]}\n\n";
                byte[] bytes = (chunk.formatted("OBDX is ", "null") + chunk.formatted("a platform.", "null") + chunk.formatted("", "\"stop\"")
                        + "data: [DONE]\n\n").getBytes(StandardCharsets.UTF_8);
                exchange.getResponseHeaders().add("Content-Type", "text/event-stream");
                exchange.sendResponseHeaders(200, bytes.length);
                try (OutputStream out = exchange.getResponseBody()) {
                    out.write(bytes);
                }
                return;
            }
            respond(exchange, 200, """
                    {"id": "chatcmpl-1", "object": "chat.completion", "created": 1, "model": "qwen2.5-coder:7b",
                     "choices": [{"index": 0, "finish_reason": "stop",
                                  "message": {"role": "assistant", "content": "OBDX is Oracle's digital banking platform."}}],
                     "usage": {"prompt_tokens": 10, "completion_tokens": 8, "total_tokens": 18}}
                    """);
        });
        server.createContext("/v1/embeddings", exchange -> respond(exchange, 200, """
                {"object": "list", "model": "nomic-embed-text",
                 "data": [{"object": "embedding", "index": 0, "embedding": [0.1, 0.2, 0.3, 0.4]}],
                 "usage": {"prompt_tokens": 3, "total_tokens": 3}}
                """));
        server.createContext("/broken/v1/chat/completions", exchange -> respond(exchange, 500, """
                {"error": {"message": "model not loaded", "type": "server_error"}}
                """));
        // An Ollama server: its own API, a model with a 32k context, and a streamed answer in lines of JSON
        server.createContext("/ollama/api/version", exchange -> respond(exchange, 200, "{\"version\": \"0.12.0\"}"));
        server.createContext("/ollama/api/show", exchange -> respond(exchange, 200,
                "{\"model_info\": {\"general.architecture\": \"qwen2\", \"qwen2.context_length\": 32768}}"));
        server.createContext("/ollama/api/chat", exchange -> {
            lastChatRequest.set(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            byte[] bytes = ("{\"message\": {\"role\": \"assistant\", \"content\": \"{\\\"ok\\\": \"}, \"done\": false}\n"
                    + "{\"message\": {\"role\": \"assistant\", \"content\": \"true}\"}, \"done\": false}\n"
                    + "{\"message\": {\"role\": \"assistant\", \"content\": \"\"}, \"done\": true}\n").getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/x-ndjson");
            exchange.sendResponseHeaders(200, bytes.length);
            try (OutputStream out = exchange.getResponseBody()) {
                out.write(bytes);
            }
        });
        // A server that refuses JSON in a stream (as some cloud servers do) but answers it in one piece
        server.createContext("/nostream/v1/chat/completions", exchange -> {
            String body = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
            if (body.matches("(?s).*\"stream\"\\s*:\\s*true.*")) {
                respond(exchange, 400, """
                        {"error": {"message": "response_format json_object is not supported with stream", "type": "invalid_request_error"}}
                        """);
                return;
            }
            respond(exchange, 200, """
                    {"id": "chatcmpl-2", "object": "chat.completion", "created": 1, "model": "cloud-model",
                     "choices": [{"index": 0, "finish_reason": "stop", "message": {"role": "assistant", "content": "{\\"ok\\": true}"}}]}
                    """);
        });
        server.createContext("/slow/v1/chat/completions", exchange -> {
            try {
                Thread.sleep(3000);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
            respond(exchange, 500, "{}");
        });
        server.start();
    }

    @AfterEach
    void stopStubServer() {
        server.stop(0);
    }

    @Test
    void sendsSystemAndUserMessagesAndReturnsReply() {
        ModelGateway gateway = gatewayFor("/v1");

        ModelGateway.ChatResult result = gateway.chat("Be brief.", "What is OBDX?");

        assertThat(result.reply()).isEqualTo("OBDX is Oracle's digital banking platform.");
        assertThat(result.model()).isEqualTo("qwen2.5-coder:7b");
        assertThat(lastChatRequest.get())
                .contains("qwen2.5-coder:7b")
                .contains("system")
                .contains("Be brief.")
                .contains("What is OBDX?");
    }

    @Test
    void asksForJsonObjectInJsonModeAndStreamsIt() {
        // Streamed, so a slow model writing a long JSON answer is timed from its last piece, not from the start
        assertThat(gatewayFor("/v1").chatJson("Answer in JSON.", "Give me a spec").reply()).isEqualTo("OBDX is a platform.");

        assertThat(lastChatRequest.get()).contains("json_object").containsPattern("\"stream\"\\s*:\\s*true");
    }

    @Test
    void ollamaGetsAContextLargeEnoughForThePrompt() {
        ModelGateway gateway = gatewayFor("/ollama/v1");
        List<String> pieces = new java.util.ArrayList<>();

        assertThat(gateway.chatStream("Be brief.", "x".repeat(30_000), pieces::add).reply()).isEqualTo("{\"ok\": true}");
        assertThat(pieces).containsExactly("{\"ok\": ", "true}");
        // 30,000 characters is about 10,000 tokens, with 4,096 for the answer: 14,336, not Ollama's 4,096
        assertThat(lastChatRequest.get()).contains("\"num_ctx\":14336").contains("\"stream\":true").doesNotContain("\"format\"");

        gateway.chatJson("Answer in JSON.", "short");
        // JSON mode, and the context stays as large as before, so the model is not loaded again
        assertThat(lastChatRequest.get()).contains("\"format\":\"json\"").contains("\"num_ctx\":14336");
    }

    @Test
    void ollamaContextFollowsThePromptWithinTheLimits() {
        OllamaChat chat = new OllamaChat(16384);
        String base = "http://127.0.0.1:" + server.getAddress().getPort() + "/ollama/v1";
        assertThat(OllamaChat.root(base)).endsWith("/ollama");
        assertThat(chat.contextFor(base, "small", 1_000)).isEqualTo(6144);
        assertThat(chat.contextFor(base, "small", 100)).isEqualTo(6144);
        assertThat(chat.contextFor(base, "small", 20_000)).isEqualTo(12288);
        assertThat(chat.contextFor(base, "small", 200_000)).isEqualTo(16384);
    }

    @Test
    void aServerThatRefusesJsonInAStreamAnswersInOnePiece() {
        ModelGateway gateway = gatewayFor("/nostream/v1");

        assertThat(gateway.chatJson("Answer in JSON.", "Give me a spec").reply()).isEqualTo("{\"ok\": true}");
        assertThat(gateway.chatJson("Answer in JSON.", "Again").reply()).isEqualTo("{\"ok\": true}");
    }

    @Test
    void returnsEmbeddingVector() {
        assertThat(gatewayFor("/v1").embed("fund transfer screen")).containsExactly(0.1f, 0.2f, 0.3f, 0.4f);
    }

    @Test
    void wrapsServerErrorsWithEndpointDetails() {
        ModelGateway gateway = gatewayFor("/broken/v1");

        assertThatThrownBy(() -> gateway.chat(null, "hello"))
                .isInstanceOf(ModelGatewayException.class)
                .hasMessageContaining("qwen2.5-coder:7b")
                .hasMessageContaining("/broken/v1");
    }

    @Test
    void streamsTheReplyInPieces() {
        List<String> pieces = new ArrayList<>();

        ModelGateway.ChatResult result = gatewayFor("/v1").chatStream("Be brief.", "What is OBDX?", pieces::add);

        assertThat(pieces).containsExactly("OBDX is ", "a platform.");
        assertThat(result.reply()).isEqualTo("OBDX is a platform.");
        assertThat(result.model()).isEqualTo("qwen2.5-coder:7b");
        assertThat(lastChatRequest.get()).contains("Be brief.").containsPattern("\"stream\"\\s*:\\s*true");
    }

    @Test
    void streamingReportsServerErrors() {
        assertThatThrownBy(() -> gatewayFor("/broken/v1").chatStream(null, "hello", piece -> { }))
                .isInstanceOf(ModelGatewayException.class)
                .hasMessageContaining("/broken/v1");
    }

    @Test
    void saysWhatToDoWhenTheModelTakesTooLong() {
        ModelGateway gateway = gatewayFor("/slow/v1", Duration.ofSeconds(1));

        assertThatThrownBy(() -> gateway.chat(null, "hello"))
                .isInstanceOf(ModelGatewayException.class)
                .hasMessageContaining("did not answer within 1 seconds")
                .hasMessageContaining("try again");
    }

    @Test
    void tellsQuestionsFromPassagesForTheModelsThatExpectIt() {
        assertThat(OpenAiCompatibleModelGateway.queryPrefix("nomic-embed-text:latest")).isEqualTo("search_query: ");
        assertThat(OpenAiCompatibleModelGateway.passagePrefix("nomic-embed-text:latest")).isEqualTo("search_document: ");
        assertThat(OpenAiCompatibleModelGateway.queryPrefix("intfloat/multilingual-e5-large")).isEqualTo("query: ");
        assertThat(OpenAiCompatibleModelGateway.passagePrefix("intfloat/multilingual-e5-large")).isEqualTo("passage: ");
        assertThat(OpenAiCompatibleModelGateway.queryPrefix("mxbai-embed-large")).startsWith("Represent this sentence");
        assertThat(OpenAiCompatibleModelGateway.passagePrefix("mxbai-embed-large")).isEmpty();
        assertThat(OpenAiCompatibleModelGateway.queryPrefix("text-embedding-3-small")).isEmpty();
        assertThat(OpenAiCompatibleModelGateway.queryPrefix("qwen3-embedding:4b")).startsWith("Instruct: ").endsWith("\nQuery: ");
        assertThat(OpenAiCompatibleModelGateway.passagePrefix("qwen3-embedding:4b")).isEmpty();
        // bge-m3 takes questions as they are; the English bge models want their instruction
        assertThat(OpenAiCompatibleModelGateway.queryPrefix("bge-m3:latest")).isEmpty();
        assertThat(OpenAiCompatibleModelGateway.queryPrefix("BAAI/bge-large-en-v1.5")).startsWith("Represent this sentence");
    }

    @Test
    void readsTimeoutsInMinutes() {
        assertThat(OpenAiCompatibleModelGateway.readable(Duration.ofSeconds(300))).isEqualTo("5 minutes");
        assertThat(OpenAiCompatibleModelGateway.readable(Duration.ofSeconds(60))).isEqualTo("1 minute");
        assertThat(OpenAiCompatibleModelGateway.readable(Duration.ofSeconds(90))).isEqualTo("90 seconds");
    }

    private ModelGateway gatewayFor(String path) {
        return gatewayFor(path, Duration.ofSeconds(5));
    }

    private ModelGateway gatewayFor(String path, Duration timeout) {
        String baseUrl = "http://127.0.0.1:" + server.getAddress().getPort() + path;
        return new OpenAiCompatibleModelGateway(
                new ModelProperties(baseUrl, "test-key", "qwen2.5-coder:7b", "nomic-embed-text", timeout, null, null, 16384));
    }

    private static void respond(com.sun.net.httpserver.HttpExchange exchange, int status, String body) throws IOException {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().add("Content-Type", "application/json");
        exchange.sendResponseHeaders(status, bytes.length);
        try (OutputStream out = exchange.getResponseBody()) {
            out.write(bytes);
        }
    }
}
