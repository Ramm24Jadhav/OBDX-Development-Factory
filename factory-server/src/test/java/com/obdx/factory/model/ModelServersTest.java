package com.obdx.factory.model;

import com.obdx.factory.common.BadRequestException;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ModelServersTest {

    private HttpServer server;
    private String base;

    @BeforeEach
    void start() throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/v1/models", exchange -> respond(exchange, 200, """
                {"object": "list", "data": [
                  {"id": "qwen2.5-coder:7b", "object": "model"},
                  {"id": "nomic-embed-text:latest", "object": "model"},
                  {"id": "BAAI/bge-m3", "object": "model"},
                  {"id": "llama3.1:8b", "object": "model"}]}
                """));
        server.createContext("/locked/v1/models", exchange -> respond(exchange,
                "Bearer right-key".equals(exchange.getRequestHeaders().getFirst("Authorization")) ? 200 : 401,
                "{\"data\": [{\"id\": \"private-model\"}]}"));
        server.start();
        base = "http://127.0.0.1:" + server.getAddress().getPort();
    }

    @AfterEach
    void stop() {
        server.stop(0);
    }

    @Test
    void listsTheModelsAndRecognisesEmbeddingModels() {
        assertThat(new ModelServers(JsonMapper.builder().build()).models(base + "/v1/", null))
                .containsExactly(new ModelServers.Model("BAAI/bge-m3", true), new ModelServers.Model("llama3.1:8b", false),
                        new ModelServers.Model("nomic-embed-text:latest", true), new ModelServers.Model("qwen2.5-coder:7b", false));
    }

    @Test
    void sendsTheApiKeyAndExplainsAMissingOne() {
        ModelServers servers = new ModelServers(JsonMapper.builder().build());
        assertThat(servers.models(base + "/locked/v1", "right-key")).extracting(ModelServers.Model::id).containsExactly("private-model");
        assertThatThrownBy(() -> servers.models(base + "/locked/v1", null))
                .isInstanceOf(BadRequestException.class).hasMessageContaining("needs a valid API key");
    }

    @Test
    void explainsAWrongAddress() {
        assertThatThrownBy(() -> new ModelServers(JsonMapper.builder().build()).models(base + "/nothing", null))
                .isInstanceOf(BadRequestException.class).hasMessageContaining("usually ends with /v1");
    }

    private static void respond(HttpExchange exchange, int status, String body) throws IOException {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().add("Content-Type", "application/json");
        exchange.sendResponseHeaders(status, bytes.length);
        exchange.getResponseBody().write(bytes);
        exchange.close();
    }
}
