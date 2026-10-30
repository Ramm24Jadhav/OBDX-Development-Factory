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
    void asksForJsonObjectInJsonMode() {
        gatewayFor("/v1").chatJson("Answer in JSON.", "Give me a spec");

        assertThat(lastChatRequest.get()).contains("json_object");
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
                new ModelProperties(baseUrl, "test-key", "qwen2.5-coder:7b", "nomic-embed-text", timeout, null, null));
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
