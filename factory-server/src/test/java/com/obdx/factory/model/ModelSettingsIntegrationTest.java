package com.obdx.factory.model;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;

/** Choosing the model server on the Models page takes effect at once. Runs when FACTORY_TEST_DB_URL is set. */
@SpringBootTest
@EnabledIfEnvironmentVariable(named = "FACTORY_TEST_DB_URL", matches = ".+")
class ModelSettingsIntegrationTest {

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", () -> System.getenv("FACTORY_TEST_DB_URL"));
        registry.add("spring.datasource.username", () -> System.getenv().getOrDefault("FACTORY_TEST_DB_USER", "factory"));
        registry.add("spring.datasource.password", () -> System.getenv().getOrDefault("FACTORY_TEST_DB_PASSWORD", "factory"));
        registry.add("factory.security.secret-key", () -> Base64.getEncoder().encodeToString(new byte[32]));
    }

    @Autowired
    private ModelSettings settings;
    @Autowired
    private ModelGateway gateway;
    @Autowired
    private JdbcTemplate jdbc;

    private HttpServer server;
    private String base;
    private final AtomicReference<String> lastRequest = new AtomicReference<>();
    private final AtomicReference<String> lastAuthorization = new AtomicReference<>();
    private final AtomicReference<String> lastEmbeddingAuthorization = new AtomicReference<>();

    @BeforeEach
    void start() throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        for (String name : new String[]{"a", "b"}) {
            server.createContext("/" + name + "/v1/chat/completions", exchange -> {
                lastRequest.set(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
                lastAuthorization.set(exchange.getRequestHeaders().getFirst("Authorization"));
                respond(exchange, """
                        {"id": "1", "object": "chat.completion", "created": 1, "model": "m",
                         "choices": [{"index": 0, "finish_reason": "stop", "message": {"role": "assistant", "content": "server %s"}}]}
                        """.formatted(name));
            });
        }
        server.createContext("/e/v1/embeddings", exchange -> {
            lastEmbeddingAuthorization.set(exchange.getRequestHeaders().getFirst("Authorization"));
            respond(exchange, """
                    {"object": "list", "model": "embed-e", "usage": {"prompt_tokens": 1, "total_tokens": 1},
                     "data": [{"object": "embedding", "index": 0, "embedding": [0.5, 0.25, 0.125]}]}
                    """);
        });
        server.start();
        base = "http://127.0.0.1:" + server.getAddress().getPort();
    }

    @AfterEach
    void stop() {
        server.stop(0);
        jdbc.update("DELETE FROM model_settings");
        settings.current();
    }

    @Test
    void switchesServerAndModelsWithoutRestart() {
        settings.save(new ModelSettings.Update(base + "/a/v1/", "", "chat-a", "embed-a"), "tester");
        assertThat(gateway.chat(null, "hello").reply()).isEqualTo("server a");
        assertThat(lastRequest.get()).contains("\"chat-a\"");

        settings.save(new ModelSettings.Update(base + "/b/v1", "secret-key-123", "chat-b", "embed-a"), "tester");
        assertThat(gateway.chat(null, "hello").reply()).isEqualTo("server b");
        assertThat(lastRequest.get()).contains("\"chat-b\"");
        assertThat(lastAuthorization.get()).isEqualTo("Bearer secret-key-123");

        ModelSettings.Current current = settings.current();
        assertThat(current.saved()).isTrue();
        assertThat(current.updatedBy()).isEqualTo("tester");
        assertThat(current.apiKey()).isEqualTo("secret-key-123");
        assertThat(jdbc.queryForObject("SELECT api_key FROM model_settings", String.class)).doesNotContain("secret-key-123");
        // Listing the models of the same server again uses the stored key
        assertThat(settings.storedKeyFor(base + "/b/v1/")).isEqualTo("secret-key-123");
        assertThat(settings.storedKeyFor(base + "/a/v1")).isNull();
    }

    @Test
    void reportsWhenTheEmbeddingModelChanges() {
        settings.save(new ModelSettings.Update(base + "/a/v1", "", "chat-a", "embed-a"), "tester");
        assertThat(settings.save(new ModelSettings.Update(base + "/b/v1", "", "chat-b", "embed-a"), "tester")).isFalse();
        assertThat(settings.save(new ModelSettings.Update(base + "/b/v1", "", "chat-b", "embed-b"), "tester")).isTrue();
    }

    @Test
    void usesAnotherServerForCodeSearch() {
        settings.save(new ModelSettings.Update(base + "/a/v1", "chat-key", "chat-a", "embed-e", base + "/e/v1/", "embed-key"), "tester");

        assertThat(gateway.chat(null, "hello").reply()).isEqualTo("server a");
        assertThat(lastAuthorization.get()).isEqualTo("Bearer chat-key");
        assertThat(gateway.embed("search text")).containsExactly(0.5f, 0.25f, 0.125f);
        assertThat(lastEmbeddingAuthorization.get()).isEqualTo("Bearer embed-key");

        ModelSettings.Current current = settings.current();
        assertThat(current.embeddingBaseUrl()).isEqualTo(base + "/e/v1");
        assertThat(settings.storedKeyFor(base + "/e/v1")).isEqualTo("embed-key");
        assertThat(jdbc.queryForObject("SELECT embedding_api_key FROM model_settings", String.class)).doesNotContain("embed-key");

        // Back to one server with the same embedding model: the embeddings are kept
        assertThat(settings.save(new ModelSettings.Update(base + "/a/v1", null, "chat-a", "embed-e"), "tester")).isFalse();
        assertThat(settings.current().embeddingBaseUrl()).isNull();
        assertThat(settings.current().apiKey()).as("null keeps the stored key").isEqualTo("chat-key");
        // Naming the chat server as the code search server is the same as no separate server
        assertThat(settings.save(new ModelSettings.Update(base + "/a/v1", null, "chat-a", "embed-e", base + "/a/v1", null), "tester")).isFalse();
        assertThat(settings.current().embeddingBaseUrl()).isNull();
    }

    private static void respond(HttpExchange exchange, String body) throws IOException {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().add("Content-Type", "application/json");
        exchange.sendResponseHeaders(200, bytes.length);
        exchange.getResponseBody().write(bytes);
        exchange.close();
    }
}
