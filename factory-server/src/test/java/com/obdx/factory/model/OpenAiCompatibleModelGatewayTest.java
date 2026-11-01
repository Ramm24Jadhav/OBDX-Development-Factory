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
    private final java.util.concurrent.atomic.AtomicInteger limitedCalls = new java.util.concurrent.atomic.AtomicInteger();
    private final List<Integer> otpmAsked = java.util.Collections.synchronizedList(new ArrayList<>());
    private final List<String> thinkRequests = java.util.Collections.synchronizedList(new ArrayList<>());

    /** What the gateway logs while run runs. */
    private static List<String> logged(Runnable run) {
        ch.qos.logback.classic.Logger logger = (ch.qos.logback.classic.Logger) org.slf4j.LoggerFactory.getLogger(OpenAiCompatibleModelGateway.class);
        ch.qos.logback.core.read.ListAppender<ch.qos.logback.classic.spi.ILoggingEvent> appender = new ch.qos.logback.core.read.ListAppender<>();
        appender.start();
        logger.addAppender(appender);
        try {
            run.run();
        } finally {
            logger.detachAppender(appender);
        }
        return appender.list.stream().map(ch.qos.logback.classic.spi.ILoggingEvent::getFormattedMessage).toList();
    }

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
        // Ollama answers that stop at the end of the context, and that hit a rate limit after the first piece
        for (String path : List.of("/ollamacut", "/ollamalimited", "/ollamalate")) {
            server.createContext(path + "/api/show", exchange -> respond(exchange, 200, "{\"model_info\": {}}"));
        }
        server.createContext("/ollamacut/api/version", exchange -> respond(exchange, 200, "{\"version\": \"0.12.0\"}"));
        server.createContext("/ollamacut/api/chat", exchange -> {
            exchange.getRequestBody().readAllBytes();
            ndjson(exchange, "{\"message\": {\"role\": \"assistant\", \"content\": \"{\\\"files\\\": [\"}, \"done\": false}\n"
                    + "{\"message\": {\"role\": \"assistant\", \"content\": \"\"}, \"done\": true, \"done_reason\": \"length\"}\n");
        });
        server.createContext("/ollamalimited/api/version", exchange -> respond(exchange, 200, "{\"version\": \"0.12.0\"}"));
        server.createContext("/ollamalimited/api/chat", exchange -> {
            exchange.getRequestBody().readAllBytes();
            limitedCalls.incrementAndGet();
            ndjson(exchange, "{\"message\": {\"role\": \"assistant\", \"content\": \"The first piece\"}, \"done\": false}\n"
                    + "{\"error\": \"Rate limit reached. Please try again in 300ms.\"}\n");
        });
        // Ollama started after the factory: /api/version fails at first
        server.createContext("/ollamalate/api/version", exchange -> {
            if (limitedCalls.incrementAndGet() == 1) {
                respond(exchange, 404, "{}");
            } else {
                respond(exchange, 200, "{\"version\": \"0.12.0\"}");
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
        // A cloud server on a free plan: the first request is rate limited for a moment, then it answers
        server.createContext("/limited/v1/chat/completions", exchange -> {
            exchange.getRequestBody().readAllBytes();
            if (limitedCalls.incrementAndGet() == 1) {
                respond(exchange, 429, """
                        {"error": {"message": "Rate limit reached for model `qwen` on tokens per minute (TPM): Limit 7000, Used 6500, \
                        Requested 900. Please try again in 300ms.", "type": "tokens", "code": "rate_limit_exceeded"}}
                        """);
                return;
            }
            respond(exchange, 200, """
                    {"id": "chatcmpl-3", "object": "chat.completion", "created": 1, "model": "qwen",
                     "choices": [{"index": 0, "finish_reason": "stop", "message": {"role": "assistant", "content": "{\\"ok\\": true}"}}]}
                    """);
        });
        // A free plan's daily allowance used up: every call fails until it resets
        server.createContext("/daily/v1/chat/completions", exchange -> {
            exchange.getRequestBody().readAllBytes();
            limitedCalls.incrementAndGet();
            respond(exchange, 429, """
                    {"error": {"message": "Rate limit reached for model `qwen` on tokens per day (TPD): Limit 100000, Used 99500, \
                    Requested 900. Please try again in 14m30s.", "type": "tokens", "code": "rate_limit_exceeded"}}
                    """);
        });
        // Groq on a free plan: one answer may not ask for more than the 1000 output tokens it writes a minute
        server.createContext("/otpm/v1/chat/completions", exchange -> {
            String body = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
            java.util.regex.Matcher m = java.util.regex.Pattern.compile("\"max(?:_completion)?_tokens\"\\s*:\\s*(\\d+)").matcher(body);
            int asked = m.find() ? Integer.parseInt(m.group(1)) : -1;
            otpmAsked.add(asked);
            if (asked > 1000) {
                respond(exchange, 413, """
                        {"error": {"message": "Request too large for model `qwen` in organization `org_1` service tier `on_demand` on \
                        output tokens per minute (OTPM): Limit 1000, Requested %d, please reduce your message size and try again.", \
                        "type": "tokens", "code": "rate_limit_exceeded"}}
                        """.formatted(asked));
                return;
            }
            respond(exchange, 200, """
                    {"id": "chatcmpl-5", "object": "chat.completion", "created": 1, "model": "qwen",
                     "choices": [{"index": 0, "finish_reason": "length", "message": {"role": "assistant", "content": "public class A {"}}]}
                    """);
        });
        // A server that counts more output than asked for (1.6 times): refused again at the first cap
        server.createContext("/otpm2/v1/chat/completions", exchange -> {
            String body = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
            java.util.regex.Matcher m = java.util.regex.Pattern.compile("\"max(?:_completion)?_tokens\"\\s*:\\s*(\\d+)").matcher(body);
            int asked = m.find() ? Integer.parseInt(m.group(1)) : -1;
            otpmAsked.add(asked);
            int counted = (int) (asked * 1.6);
            if (counted > 1000) {
                respond(exchange, 413, """
                        {"error": {"message": "Request too large for model `qwen` on output tokens per minute (OTPM): Limit 1000, \
                        Requested %d, please reduce your message size and try again.", "type": "tokens", "code": "rate_limit_exceeded"}}
                        """.formatted(counted));
                return;
            }
            respond(exchange, 200, """
                    {"id": "chatcmpl-6", "object": "chat.completion", "created": 1, "model": "qwen",
                     "choices": [{"index": 0, "finish_reason": "stop", "message": {"role": "assistant", "content": "ok"}}]}
                    """);
        });
        // Tokens a minute in all (Groq TPM): the prompt (4 characters a token) plus max_tokens must stay within 6000
        server.createContext("/tpm/v1/chat/completions", exchange -> {
            String body = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
            java.util.regex.Matcher m = java.util.regex.Pattern.compile("\"max(?:_completion)?_tokens\"\\s*:\\s*(\\d+)").matcher(body);
            int asked = m.find() ? Integer.parseInt(m.group(1)) : 0;
            java.util.regex.Matcher content = java.util.regex.Pattern.compile("\"content\"\\s*:\\s*\"(x*)\"").matcher(body);
            int prompt = content.find() ? content.group(1).length() / 4 : 0;
            otpmAsked.add(asked);
            if (prompt + asked > 6000) {
                respond(exchange, 413, """
                        {"error": {"message": "Request too large for model `qwen` on tokens per minute (TPM): Limit 6000, \
                        Requested %d, please reduce your message size and try again.", "type": "tokens", "code": "rate_limit_exceeded"}}
                        """.formatted(prompt + asked));
                return;
            }
            respond(exchange, 200, """
                    {"id": "chatcmpl-7", "object": "chat.completion", "created": 1, "model": "qwen",
                     "choices": [{"index": 0, "finish_reason": "stop", "message": {"role": "assistant", "content": "ok"}}]}
                    """);
        });
        // Groq's rate-limit headers on every answer: 6000 tokens a minute; a stream that ends without a finish reason
        server.createContext("/headers/v1/chat/completions", exchange -> {
            String body = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
            java.util.regex.Matcher m = java.util.regex.Pattern.compile("\"max(?:_completion)?_tokens\"\\s*:\\s*(\\d+)").matcher(body);
            otpmAsked.add(m.find() ? Integer.parseInt(m.group(1)) : 0);
            exchange.getResponseHeaders().add("x-ratelimit-limit-tokens", "6000");
            exchange.getResponseHeaders().add("x-ratelimit-remaining-tokens", "5400");
            if (body.matches("(?s).*\"stream\"\\s*:\\s*true.*")) {
                String chunk = "data: {\"id\":\"c1\",\"object\":\"chat.completion.chunk\",\"created\":1,\"model\":\"qwen\","
                        + "\"choices\":[{\"index\":0,\"delta\":{\"content\":\"%s\"},\"finish_reason\":null}]}\n\n";
                byte[] bytes = (chunk.formatted("y".repeat(2000)) + "data: [DONE]\n\n").getBytes(StandardCharsets.UTF_8);
                exchange.getResponseHeaders().add("Content-Type", "text/event-stream");
                exchange.sendResponseHeaders(200, bytes.length);
                try (OutputStream out = exchange.getResponseBody()) {
                    out.write(bytes);
                }
                return;
            }
            respond(exchange, 200, """
                    {"id": "chatcmpl-8", "object": "chat.completion", "created": 1, "model": "qwen",
                     "choices": [{"index": 0, "finish_reason": "stop", "message": {"role": "assistant", "content": "ok"}}]}
                    """);
        });
        // A qwen3 model that thinks out loud; /strict refuses reasoning_effort as an unknown parameter
        for (String variant : List.of("/think", "/strict")) {
            server.createContext(variant + "/v1/chat/completions", exchange -> {
                String body = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
                thinkRequests.add(body);
                if (variant.equals("/strict") && body.contains("reasoning_effort")) {
                    respond(exchange, 400, """
                            {"error": {"message": "Unrecognized request argument supplied: reasoning_effort", "type": "invalid_request_error"}}
                            """);
                    return;
                }
                respond(exchange, 200, """
                        {"id": "chatcmpl-9", "object": "chat.completion", "created": 1, "model": "qwen3-32b",
                         "choices": [{"index": 0, "finish_reason": "stop",
                                      "message": {"role": "assistant", "content": "<think>The user wants a class.</think>\\npublic class A {}"}}]}
                        """);
            });
        }
        // Output per minute with what the minute already used: 400 (a busy minute) or 0 (the request alone is over the limit)
        for (String variant : List.of("/busy", "/alone")) {
            server.createContext(variant + "/v1/chat/completions", exchange -> {
                String body = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
                java.util.regex.Matcher m = java.util.regex.Pattern.compile("\"max(?:_completion)?_tokens\"\\s*:\\s*(\\d+)").matcher(body);
                int asked = m.find() ? Integer.parseInt(m.group(1)) : -1;
                otpmAsked.add(asked);
                if (asked > 1000) {
                    respond(exchange, 413, """
                            {"error": {"message": "Request too large for model `qwen` on output tokens per minute (OTPM): Limit 1000, \
                            Used %d, Requested %d, please reduce your message size and try again.", "type": "tokens", "code": "rate_limit_exceeded"}}
                            """.formatted(variant.equals("/busy") ? 400 : 0, asked));
                    return;
                }
                respond(exchange, 200, """
                        {"id": "chatcmpl-10", "object": "chat.completion", "created": 1, "model": "qwen",
                         "choices": [{"index": 0, "finish_reason": "stop", "message": {"role": "assistant", "content": "ok"}}]}
                        """);
            });
        }
        // Large plans: OpenAI's 30 million and Groq's developer 300,000 tokens a minute in the headers
        for (String total : List.of("30000000", "300000")) {
            server.createContext("/hdr" + total + "/v1/chat/completions", exchange -> {
                String body = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
                java.util.regex.Matcher m = java.util.regex.Pattern.compile("\"max(?:_completion)?_tokens\"\\s*:\\s*(\\d+)").matcher(body);
                otpmAsked.add(m.find() ? Integer.parseInt(m.group(1)) : -1);
                exchange.getResponseHeaders().add("x-ratelimit-limit-tokens", total);
                respond(exchange, 200, """
                        {"id": "chatcmpl-13", "object": "chat.completion", "created": 1, "model": "qwen",
                         "choices": [{"index": 0, "finish_reason": "stop", "message": {"role": "assistant", "content": "ok"}}]}
                        """);
            });
        }
        // A model that takes at most 32768 max_tokens; and one that takes only max_completion_tokens
        server.createContext("/answermax/v1/chat/completions", exchange -> {
            String body = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
            java.util.regex.Matcher m = java.util.regex.Pattern.compile("\"max_tokens\"\\s*:\\s*(\\d+)").matcher(body);
            int asked = m.find() ? Integer.parseInt(m.group(1)) : -1;
            otpmAsked.add(asked);
            if (asked > 32768) {
                respond(exchange, 400, """
                        {"error": {"message": "`max_tokens` must be less than or equal to `32768`, the maximum value for `max_tokens` is less \
                        than the `context_window` for this model", "type": "invalid_request_error"}}
                        """);
                return;
            }
            respond(exchange, 200, """
                    {"id": "chatcmpl-14", "object": "chat.completion", "created": 1, "model": "qwen",
                     "choices": [{"index": 0, "finish_reason": "stop", "message": {"role": "assistant", "content": "ok"}}]}
                    """);
        });
        server.createContext("/completiontokens/v1/chat/completions", exchange -> {
            String body = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
            thinkRequests.add(body);
            if (body.contains("\"max_tokens\"")) {
                respond(exchange, 400, """
                        {"error": {"message": "Unsupported parameter: 'max_tokens' is not supported with this model. Use \
                        'max_completion_tokens' instead.", "type": "invalid_request_error"}}
                        """);
                return;
            }
            respond(exchange, 200, """
                    {"id": "chatcmpl-15", "object": "chat.completion", "created": 1, "model": "o4-mini",
                     "choices": [{"index": 0, "finish_reason": "stop", "message": {"role": "assistant", "content": "ok"}}]}
                    """);
        });
        // 1000 output tokens a minute; every answer takes 600
        server.createContext("/opm/v1/chat/completions", exchange -> {
            String body = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
            java.util.regex.Matcher m = java.util.regex.Pattern.compile("\"max(?:_completion)?_tokens\"\\s*:\\s*(\\d+)").matcher(body);
            otpmAsked.add(m.find() ? Integer.parseInt(m.group(1)) : -1);
            respond(exchange, 200, """
                    {"id": "chatcmpl-12", "object": "chat.completion", "created": 1, "model": "qwen",
                     "choices": [{"index": 0, "finish_reason": "stop", "message": {"role": "assistant", "content": "ok"}}],
                     "usage": {"prompt_tokens": 100, "completion_tokens": 600, "total_tokens": 700}}
                    """);
        });
        // An answer of 3600 tokens, more than a remembered cap of 900
        server.createContext("/big/v1/chat/completions", exchange -> {
            exchange.getRequestBody().readAllBytes();
            respond(exchange, 200, """
                    {"id": "chatcmpl-11", "object": "chat.completion", "created": 1, "model": "qwen",
                     "choices": [{"index": 0, "finish_reason": "stop", "message": {"role": "assistant", "content": "public class A {}"}}],
                     "usage": {"prompt_tokens": 4000, "completion_tokens": 3600, "total_tokens": 7600}}
                    """);
        });
        // A rolling daily limit that frees up in a moment: waited out like a per-minute one
        server.createContext("/dailyshort/v1/chat/completions", exchange -> {
            exchange.getRequestBody().readAllBytes();
            if (limitedCalls.incrementAndGet() == 1) {
                respond(exchange, 429, """
                        {"error": {"message": "Rate limit reached for model `qwen` on tokens per day (TPD): Limit 100000, Used 99500, \
                        Requested 900. Please try again in 300ms.", "type": "tokens", "code": "rate_limit_exceeded"}}
                        """);
                return;
            }
            respond(exchange, 200, """
                    {"id": "chatcmpl-4", "object": "chat.completion", "created": 1, "model": "qwen",
                     "choices": [{"index": 0, "finish_reason": "stop", "message": {"role": "assistant", "content": "{\\"ok\\": true}"}}]}
                    """);
        });
        // A request larger than the server takes in a minute: asking again cannot help
        server.createContext("/toolarge/v1/chat/completions", exchange -> {
            exchange.getRequestBody().readAllBytes();
            limitedCalls.incrementAndGet();
            respond(exchange, 413, """
                    {"error": {"message": "Request too large for model `qwen` on input tokens per minute (ITPM): Limit 7000, \
                    Requested 7663, please reduce your message size and try again.", "type": "tokens", "code": "rate_limit_exceeded"}}
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
        assertThat(lastChatRequest.get()).contains("\"num_ctx\":14336").contains("\"num_predict\":4333").contains("\"stream\":true").doesNotContain("\"format\"");

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
    void anOllamaAnswerThatStopsAtTheEndOfTheContextIsCutOff() {
        ModelGateway gateway = gatewayFor("/ollamacut/v1");

        ModelGateway.ChatResult result = gateway.chatJson("Answer in JSON.", "Write the file");

        assertThat(result.reply()).isEqualTo("{\"files\": [");
        assertThat(result.cutOff()).isTrue();
        assertThat(gatewayFor("/ollama/v1").chatJson("Answer in JSON.", "short").cutOff()).isFalse();
    }

    @Test
    void aRateLimitAfterPiecesWereStreamedIsNotAskedAgain() {
        List<String> pieces = new ArrayList<>();

        assertThatThrownBy(() -> gatewayFor("/ollamalimited/v1").chatStream(null, "hello", pieces::add))
                .isInstanceOf(ModelGatewayException.class)
                .hasMessageContaining("Rate limit");
        // asking again would have streamed the first piece twice
        assertThat(pieces).containsExactly("The first piece");
        assertThat(limitedCalls.get()).isEqualTo(1);
    }

    @Test
    void anOllamaServerStartedAfterTheFactoryIsFoundLater() {
        OllamaChat chat = new OllamaChat(16384, Duration.ZERO);
        String base = "http://127.0.0.1:" + server.getAddress().getPort() + "/ollamalate/v1";

        assertThat(chat.isOllama(base)).isFalse();
        assertThat(chat.isOllama(base)).isTrue();
        // found once, it is not asked again
        assertThat(chat.isOllama(base)).isTrue();
        assertThat(limitedCalls.get()).isEqualTo(2);

        OllamaChat cached = new OllamaChat(16384, Duration.ofMinutes(1));
        limitedCalls.set(0);
        assertThat(cached.isOllama(base)).isFalse();
        assertThat(cached.isOllama(base)).isFalse();
        cached.forget();
        assertThat(cached.isOllama(base)).isTrue();
    }

    @Test
    void aContextLengthRefusalLeavesRoomForTheAnswer() {
        String context = "This model's maximum context length is 8192 tokens. However, your messages resulted in 9100 tokens.";
        assertThat(OpenAiCompatibleModelGateway.inputLimit(context, 8192, null)).isEqualTo(7168);
        assertThat(OpenAiCompatibleModelGateway.inputLimit(context, 8192, 2048)).isEqualTo(6144);
        assertThat(OpenAiCompatibleModelGateway.inputLimit(context, 8192, 100_000)).isEqualTo(2048);
        // a per-minute limit is all input
        assertThat(OpenAiCompatibleModelGateway.inputLimit("Request too large: Limit 7000, Requested 7663", 7000, 2048)).isEqualTo(7000);
    }

    @Test
    void aServerThatRefusesJsonInAStreamAnswersInOnePiece() {
        ModelGateway gateway = gatewayFor("/nostream/v1");

        assertThat(gateway.chatJson("Answer in JSON.", "Give me a spec").reply()).isEqualTo("{\"ok\": true}");
        assertThat(gateway.chatJson("Answer in JSON.", "Again").reply()).isEqualTo("{\"ok\": true}");
    }

    @Test
    void waitsOutARateLimitAndAsksAgain() {
        ModelGateway gateway = gatewayFor("/limited/v1");

        List<String> log = logged(() -> assertThat(gateway.chat("Answer in JSON.", "Plan the change").reply()).isEqualTo("{\"ok\": true}"));
        assertThat(limitedCalls.get()).isEqualTo(2);
        // QA reads why a call waited, and how long
        assertThat(log).anyMatch(line -> line.startsWith("Chat model 'qwen2.5-coder:7b' is at its rate limit (") && line.contains("waiting"));
    }

    @Test
    void aQwen3ModelIsAskedNotToThinkAndItsThinkingIsLeftOut() {
        String baseUrl = "http://127.0.0.1:" + server.getAddress().getPort() + "/think/v1";
        OpenAiCompatibleModelGateway gateway = new OpenAiCompatibleModelGateway(
                new ModelProperties(baseUrl, "test-key", "qwen/qwen3-32b", "nomic-embed-text", Duration.ofSeconds(5), null, null, 16384, 0, null));

        assertThat(gateway.chat("Write code.", "A class").reply()).isEqualTo("public class A {}");
        assertThat(thinkRequests.getLast()).contains("Write code.\\n\\n/no_think").containsPattern("\"reasoning_effort\"\\s*:\\s*\"none\"");
        // a continuation is streamed through PromptFit: it is asked the same way
        try {
            PromptFit.chatFrom(gateway, "Write code.", scale -> "Continue the file.", 0.5);
        } catch (RuntimeException e) {
            // the stub answers a stream in one piece; only the request matters here
        }
        assertThat(thinkRequests.getLast()).contains("Continue the file.", "Write code.\\n\\n/no_think")
                .containsPattern("\"stream\"\\s*:\\s*true").containsPattern("\"reasoning_effort\"\\s*:\\s*\"none\"");

        // another model is not asked, unless FACTORY_MODEL_NO_THINK says so
        thinkRequests.clear();
        new OpenAiCompatibleModelGateway(new ModelProperties(baseUrl, "test-key", "llama-3.3-70b", "nomic-embed-text", Duration.ofSeconds(5),
                null, null, 16384, 0, null)).chat("Write code.", "A class");
        assertThat(thinkRequests.getLast()).doesNotContain("/no_think").doesNotContain("reasoning_effort");
        assertThat(new ModelProperties(baseUrl, "k", "llama-3.3-70b", "e", Duration.ofSeconds(5), null, null, 16384, 0, "true")
                .noThinkFor("llama-3.3-70b")).isTrue();
        assertThat(new ModelProperties(baseUrl, "k", "qwen3:8b", "e", Duration.ofSeconds(5), null, null, 16384, 0, "false")
                .noThinkFor("qwen3:8b")).isFalse();

        assertThat(OpenAiCompatibleModelGateway.withoutThinking("<think>a\nb</think>\n\nx")).isEqualTo("x");
        // cut off while still thinking: no answer
        assertThat(OpenAiCompatibleModelGateway.withoutThinking("<think>a long thought")).isEmpty();
    }

    @Test
    void aServerThatRefusesReasoningEffortIsAskedWithoutIt() {
        String baseUrl = "http://127.0.0.1:" + server.getAddress().getPort() + "/strict/v1";
        OpenAiCompatibleModelGateway gateway = new OpenAiCompatibleModelGateway(
                new ModelProperties(baseUrl, "test-key", "qwen3-coder", "nomic-embed-text", Duration.ofSeconds(5), null, null, 16384, 0, null));

        assertThat(gateway.chat("Write code.", "A class").reply()).isEqualTo("public class A {}");
        assertThat(thinkRequests).hasSize(2);
        assertThat(thinkRequests.getLast()).doesNotContain("reasoning_effort").contains("/no_think");

        // remembered: not sent again
        gateway.chat("Write code.", "Another class");
        assertThat(thinkRequests).hasSize(3);
        assertThat(thinkRequests.getLast()).doesNotContain("reasoning_effort");
    }

    @Test
    void remembersTheLimitOfAServerThatRefusesALargeRequest() {
        ModelGateway gateway = gatewayFor("/toolarge/v1");
        assertThat(gateway.inputLimit()).isZero();

        assertThatThrownBy(() -> gateway.chatJson("Answer in JSON.", "x".repeat(26_000)))
                .isInstanceOf(PromptTooLargeException.class)
                .hasMessageContaining("7000");
        assertThat(limitedCalls.get()).isEqualTo(1);
        assertThat(gateway.inputLimit()).isEqualTo(7000);
        assertThat(gateway.charsPerToken()).isBetween(3.3, 3.5);
    }

    @Test
    void readsHowLongARateLimitedServerAsksToWait() {
        assertThat(OpenAiCompatibleModelGateway.rateLimitWait("Rate limit reached ... Please try again in 7.66s.")).isEqualTo(Duration.ofMillis(8660));
        assertThat(OpenAiCompatibleModelGateway.rateLimitWait("rate_limit_exceeded: try again in 1m30.5s")).isEqualTo(Duration.ofMillis(91500));
        assertThat(OpenAiCompatibleModelGateway.rateLimitWait("Rate limit reached. Please try again in 330ms.")).isEqualTo(Duration.ofMillis(1330));
        assertThat(OpenAiCompatibleModelGateway.rateLimitWait("429 Too Many Requests")).isEqualTo(Duration.ofSeconds(20));
        assertThat(OpenAiCompatibleModelGateway.rateLimitWait("model not loaded")).isNull();
        assertThat(OpenAiCompatibleModelGateway.tooLarge("TPM: Limit 6000, Used 5000, Requested 2000. Please try again in 9s")).isNull();
        String output = "Rate limit reached for model `qwen` on output tokens per minute: Limit 1000, Requested 2048. The request's "
                + "expected output tokens exceed the enforced limit; reduce max_tokens and try again. code: rate_limit_exceeded";
        assertThat(OpenAiCompatibleModelGateway.tooLarge(output)).isNull();
        assertThat(OpenAiCompatibleModelGateway.rateLimitWait(output)).isEqualTo(Duration.ofSeconds(20));
        assertThat(OpenAiCompatibleModelGateway.serverMessage("failed: {\"error\":{\"message\":\"Request too large for model `qwen` in "
                + "organization `org_1` service tier `on_demand` on output tokens per minute (OTPM): Limit 1000, Requested 2129. The "
                + "request's expected output tokens exceed the enforced limit\",\"type\":\"tokens\"}}"))
                .isEqualTo("Request too large for model `qwen` on output tokens per minute (OTPM): Limit 1000, Requested 2129");
        assertThat(OpenAiCompatibleModelGateway.tooLarge("This model's maximum context length is 8192 tokens. However, your messages "
                + "resulted in 9100 tokens.")).containsExactly(8192, 9100);
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
    void aDailyLimitWithALongWaitStopsAtOnce() {
        long start = System.nanoTime();

        assertThatThrownBy(() -> gatewayFor("/daily/v1").chatJson("Answer in JSON.", "Write the file"))
                .isInstanceOfSatisfying(ModelLimitReachedException.class, e -> assertThat(e.daily()).isTrue())
                .hasMessageContaining("daily limit").hasMessageContaining("about 15 minutes (the server's estimate");
        assertThat(limitedCalls.get()).isEqualTo(1);
        assertThat(Duration.ofNanos(System.nanoTime() - start)).isLessThan(Duration.ofSeconds(10));
        assertThat(OpenAiCompatibleModelGateway.daily("Rate limit reached on requests per day (RPD)")).isTrue();
        assertThat(OpenAiCompatibleModelGateway.daily("Rate limit reached on tokens per minute (TPM)")).isFalse();
        // a per-minute limit asking for 106 seconds is waited out
        assertThat(OpenAiCompatibleModelGateway.MAX_WAIT).isGreaterThan(Duration.ofSeconds(106));
    }

    @Test
    void aDailyLimitThatFreesUpSoonIsWaitedOut() {
        assertThat(gatewayFor("/dailyshort/v1").chat("Answer in JSON.", "Write the file").reply()).isEqualTo("{\"ok\": true}");
        assertThat(limitedCalls.get()).isEqualTo(2);
        assertThat(OpenAiCompatibleModelGateway.waitGiven("tokens per day (TPD). Please try again in 7.66s")).isTrue();
        assertThat(OpenAiCompatibleModelGateway.waitGiven("daily limit reached")).isFalse();
    }

    @Test
    void anAnswerLargerThanTheOutputPerMinuteAsksAgainAtOnceForLess() {
        String baseUrl = "http://127.0.0.1:" + server.getAddress().getPort() + "/otpm/v1";
        ModelGateway gateway = new OpenAiCompatibleModelGateway(
                new ModelProperties(baseUrl, "test-key", "qwen", "nomic-embed-text", Duration.ofSeconds(5), null, null, 16384, 8192, null));
        long start = System.nanoTime();

        ModelGateway.ChatResult first = gateway.chat("Write the file.", "RemarksValidator.java");

        // refused once with max_tokens 8192, then asked at once for 900 (90% of 1000), not waited out
        assertThat(otpmAsked).containsExactly(8192, 900);
        assertThat(Duration.ofNanos(System.nanoTime() - start)).isLessThan(Duration.ofSeconds(5));
        // the answer is cut off at that size, for the caller to continue
        assertThat(first.cutOff()).isTrue();
        // and later calls ask for what is left of the 1000 a minute: 900 less the 4 tokens that answer took
        gateway.chat("Write the file.", "Another.java");
        assertThat(otpmAsked).containsExactly(8192, 900, 896);

        assertThat(OpenAiCompatibleModelGateway.outputTooLarge("on output tokens per minute (OTPM): Limit 1000, Requested 1407"))
                .containsExactly(1000, 1407, -1);
        assertThat(OpenAiCompatibleModelGateway.outputTooLarge("output tokens per minute (OTPM): Limit 1000, Used 400, Requested 1407"))
                .containsExactly(1000, 1407, 400);
        assertThat(OpenAiCompatibleModelGateway.outputTooLarge("output tokens per minute (OTPM): Limit 1000, Used 900, Requested 500")).isNull();
        assertThat(OpenAiCompatibleModelGateway.outputCap(1000)).isEqualTo(900);
    }

    /** Learned limits in memory, as the database keeps them. */
    static final class MemoryLimits extends ModelLimitsStore {
        final java.util.Map<String, Stored> rows = new java.util.HashMap<>();
        final List<String> cleared = new ArrayList<>();

        MemoryLimits() {
            super(null);
        }

        @Override
        public java.util.Optional<Stored> find(String baseUrl, String model) {
            return java.util.Optional.ofNullable(rows.get(baseUrl + "|" + model));
        }

        @Override
        public void save(String baseUrl, String model, Stored limits) {
            rows.put(baseUrl + "|" + model, limits);
        }

        @Override
        public void clear(String baseUrl, String model) {
            cleared.add(baseUrl + "|" + model);
            rows.remove(baseUrl + "|" + model);
        }
    }

    @Test
    void refusedAtTheCapItLowersItAgainAndKeepsItOverARestart() {
        String baseUrl = "http://127.0.0.1:" + server.getAddress().getPort() + "/otpm2/v1";
        ModelProperties properties = new ModelProperties(baseUrl, "test-key", "qwen", "nomic-embed-text", Duration.ofSeconds(5), null, null, 16384, 8192, null);
        MemoryLimits store = new MemoryLimits();
        long start = System.nanoTime();

        assertThat(new OpenAiCompatibleModelGateway(properties, store).chat("Write the file.", "A.java").reply()).isEqualTo("ok");

        // 8192 refused as 13107 (the server counts 1.6 times what is asked): it allows 625 of what the factory asks a minute,
        // so the retry asks for 90% of that at once, 562: no waiting
        assertThat(otpmAsked).containsExactly(8192, 562);
        assertThat(Duration.ofNanos(System.nanoTime() - start)).isLessThan(Duration.ofSeconds(5));
        assertThat(OpenAiCompatibleModelGateway.lowerCap(900, 1000, 1440)).isEqualTo(562);

        // after a restart the learned cap is used from the first request
        otpmAsked.clear();
        OpenAiCompatibleModelGateway[] holder = new OpenAiCompatibleModelGateway[1];
        // said once, when the connection is made: where a max_tokens that no answer taught this run comes from
        assertThat(logged(() -> holder[0] = new OpenAiCompatibleModelGateway(properties, store)))
                // the server's address as scheme://host:port only, never its path or anything that could carry a secret
                .contains("Using stored limits for qwen: input 0, output 625 a minute, total 0 (at http://127.0.0.1:"
                        + server.getAddress().getPort() + ")");
        // a model without stored limits says so, so a missing line is never a question
        assertThat(logged(() -> new OpenAiCompatibleModelGateway(new ModelProperties(baseUrl, "test-key", "qwen3-32b", "nomic-embed-text",
                Duration.ofSeconds(5), null, null, 16384, 8192, null), store)))
                .contains("No stored limits for qwen3-32b at http://127.0.0.1:" + server.getAddress().getPort()
                                + ": they are learned from the server's answers",
                        "Thinking turned off for model 'qwen3-32b' (/no_think, reasoning_effort none)");
        OpenAiCompatibleModelGateway restarted = holder[0];
        assertThat(restarted.outputLimit()).isEqualTo(625);
        restarted.chat("Write the file.", "B.java");
        assertThat(otpmAsked).containsExactly(562);

        // another model on the server: what this one showed is cleared, and the new one starts unknown
        restarted.settingsChanged(new ModelSettings.Changed(new ModelSettings.Current(baseUrl, "test-key", "llama", "nomic-embed-text",
                null, null, true, null, null)));
        assertThat(store.cleared).containsExactly(baseUrl + "|qwen");
        assertThat(restarted.outputLimit()).isZero();
    }

    @Test
    void aTokensPerMinuteLimitCountsMaxTokensSoThePromptAndAnswerAreSizedToFitIt() {
        String baseUrl = "http://127.0.0.1:" + server.getAddress().getPort() + "/tpm/v1";
        ModelProperties properties = new ModelProperties(baseUrl, "test-key", "qwen", "nomic-embed-text", Duration.ofSeconds(5), null, null, 16384, 8192, null);
        OpenAiCompatibleModelGateway gateway = new OpenAiCompatibleModelGateway(properties, new MemoryLimits());

        // 20,000 characters (5000 tokens) + max_tokens 8192 = 13192: refused; the prompt's share is 5000 tokens, not 13192
        assertThatThrownBy(() -> gateway.chat(null, "x".repeat(20_000))).isInstanceOf(PromptTooLargeException.class);
        assertThat(gateway.charsPerToken()).isEqualTo(4.0);
        assertThat(gateway.inputLimit()).isEqualTo(6000 - 1500);

        // the prompt shortened to fit (4050 tokens), and max_tokens what is left of 90% of the minute's tokens: accepted
        // (the stub answers a stream in one piece the client reads as empty; a refusal would throw)
        PromptFit.chat(gateway, null, scale -> "x".repeat((int) (20_000 * scale)));
        assertThat(otpmAsked).containsExactly(8192, 1350);
        assertThat(OpenAiCompatibleModelGateway.countsAnswer("on input tokens per minute (ITPM): Limit 7000, Requested 7663")).isFalse();
        assertThat(OpenAiCompatibleModelGateway.countsAnswer("on tokens per day (TPD): Limit 100000, Used 99000, Requested 8921")).isFalse();
    }

    @Test
    void theTokensAMinuteInTheResponseHeadersSizeMaxTokensBeforeAnyRefusal() {
        String baseUrl = "http://127.0.0.1:" + server.getAddress().getPort() + "/headers/v1";
        ModelProperties properties = new ModelProperties(baseUrl, "test-key", "qwen", "nomic-embed-text", Duration.ofSeconds(5), null, null, 16384, 8192, null);
        MemoryLimits store = new MemoryLimits();
        ch.qos.logback.classic.Logger logger = (ch.qos.logback.classic.Logger) org.slf4j.LoggerFactory.getLogger(OpenAiCompatibleModelGateway.class);
        ch.qos.logback.core.read.ListAppender<ch.qos.logback.classic.spi.ILoggingEvent> logged = new ch.qos.logback.core.read.ListAppender<>();
        logged.start();
        logger.addAppender(logged);
        OpenAiCompatibleModelGateway gateway = new OpenAiCompatibleModelGateway(properties, store);

        gateway.chat(null, "x".repeat(7000));
        // 7000 characters are about 2000 tokens: 90% of 6000 leaves 3400 for the answer
        gateway.chat(null, "x".repeat(7000));
        logger.detachAppender(logged);
        // said once, when it was learned
        assertThat(logged.list).extracting(ch.qos.logback.classic.spi.ILoggingEvent::getFormattedMessage)
                .filteredOn(m -> m.startsWith("Learned the model server's per-minute token limit: 6000")).hasSize(1);

        assertThat(otpmAsked).containsExactly(8192, 3400);
        assertThat(store.rows.get(baseUrl + "|qwen").total()).isEqualTo(6000);
        assertThat(OpenAiCompatibleModelGateway.tokensPerMinute(java.util.Map.of("X-RateLimit-Limit-Tokens", List.of("12000")))).isEqualTo(12000);
    }

    @Test
    void aStreamThatEndsWithoutAFinishReasonAtMaxTokensIsCutOff() {
        String baseUrl = "http://127.0.0.1:" + server.getAddress().getPort() + "/headers/v1";
        // max_tokens 600: 2000 characters are about 571 tokens, 95% of 600
        ModelProperties properties = new ModelProperties(baseUrl, "test-key", "qwen", "nomic-embed-text", Duration.ofSeconds(5), null, null, 16384, 600, null);
        OpenAiCompatibleModelGateway gateway = new OpenAiCompatibleModelGateway(properties, new MemoryLimits());

        assertThat(gateway.chatStream(null, "Write the file.", piece -> { }).cutOff()).isTrue();
        // the headers of a streamed answer are read too: 17,500 characters (5000 tokens) leave 400 of 90% of 6000
        gateway.chatStream(null, "x".repeat(17_500), piece -> { });
        assertThat(otpmAsked).containsExactly(600, 400);
        assertThat(OpenAiCompatibleModelGateway.endedAtMax("y".repeat(1000), 600, 3.5)).isFalse();
    }

    @Test
    void aRefusalInABusyMinuteAsksForWhatIsLeftAndLaterCallsForTheWholeMinute() {
        String busy = "http://127.0.0.1:" + server.getAddress().getPort() + "/busy/v1";
        OpenAiCompatibleModelGateway gateway = new OpenAiCompatibleModelGateway(
                new ModelProperties(busy, "test-key", "qwen", "nomic-embed-text", Duration.ofSeconds(5), null, null, 16384, 8192, null), new MemoryLimits());

        List<String> log = logged(() -> gateway.chat("Write the file.", "A.java"));
        gateway.chat("Write the file.", "B.java");

        // 400 of the 1000 a minute were used: the retry asks for 500; the next call has the minute again, 900, not a lasting 500
        assertThat(otpmAsked).containsExactly(8192, 500, 900);
        assertThat(gateway.outputLimit()).isEqualTo(1000);
        assertThat(log).contains("Learned the model server's output limit: 1000 tokens a minute (chat model 'qwen', from its refusal)")
                .anyMatch(l -> l.contains("refused 8192 output tokens (limit 1000 a minute, 400 used); asking again with max_tokens 500"));

        otpmAsked.clear();
        String alone = "http://127.0.0.1:" + server.getAddress().getPort() + "/alone/v1";
        OpenAiCompatibleModelGateway remembered = new OpenAiCompatibleModelGateway(
                new ModelProperties(alone, "test-key", "qwen", "nomic-embed-text", Duration.ofSeconds(5), null, null, 16384, 8192, null), new MemoryLimits());
        remembered.chat("Write the file.", "A.java");
        remembered.chat("Write the file.", "B.java");
        assertThat(otpmAsked).containsExactly(8192, 900, 900);
        assertThat(remembered.outputLimit()).isEqualTo(1000);
    }

    @Test
    void eachAnswerAsksForWhatIsLeftOfTheMinute() {
        // 8000 tokens a minute in all, 1000 of them output; each answer takes 600
        String baseUrl = "http://127.0.0.1:" + server.getAddress().getPort() + "/opm/v1";
        MemoryLimits store = new MemoryLimits();
        store.save(baseUrl, "qwen", new ModelLimitsStore.Stored(0, 3.5, 0, 8000, 1000));
        OpenAiCompatibleModelGateway gateway = new OpenAiCompatibleModelGateway(
                new ModelProperties(baseUrl, "test-key", "qwen", "nomic-embed-text", Duration.ofSeconds(5), null, null, 16384, 8192, null), store);

        gateway.chat("Write the file.", "A.java");
        gateway.chat("Write the file.", "B.java");

        // the first asks for the whole room (90% of 1000 a minute), the second for what is left of the same minute
        assertThat(otpmAsked).containsExactly(900, 300);
    }

    @Test
    void aStoredPerAnswerCapFromTheOldRulesIsClearedWhenRead() {
        String baseUrl = "http://127.0.0.1:" + server.getAddress().getPort() + "/opm/v1";
        MemoryLimits store = new MemoryLimits();
        store.save(baseUrl, "qwen", new ModelLimitsStore.Stored(0, 3.5, 900, 0, 0));

        OpenAiCompatibleModelGateway[] holder = new OpenAiCompatibleModelGateway[1];
        List<String> log = logged(() -> holder[0] = new OpenAiCompatibleModelGateway(
                new ModelProperties(baseUrl, "test-key", "qwen", "nomic-embed-text", Duration.ofSeconds(5), null, null, 16384, 8192, null), store));

        assertThat(log).anyMatch(l -> l.startsWith("Cleared a stored output cap of 900 for qwen"));
        assertThat(store.rows.get(baseUrl + "|qwen").output()).isZero();
        assertThat(holder[0].outputLimit()).isZero();
        holder[0].chat("Write the file.", "A.java");
        assertThat(otpmAsked).containsExactly(8192);
    }

    @Test
    void aLargerAnswerThanTheLearnedLimitClearsIt() {
        String baseUrl = "http://127.0.0.1:" + server.getAddress().getPort() + "/big/v1";
        MemoryLimits store = new MemoryLimits();
        store.save(baseUrl, "qwen", new ModelLimitsStore.Stored(0, 3.5, 0, 0, 900));
        OpenAiCompatibleModelGateway gateway = new OpenAiCompatibleModelGateway(
                new ModelProperties(baseUrl, "test-key", "qwen", "nomic-embed-text", Duration.ofSeconds(5), null, null, 16384, 8192, null), store);
        assertThat(gateway.outputLimit()).isEqualTo(900);

        List<String> log = logged(() -> gateway.chat("Write the file.", "A.java"));

        assertThat(gateway.outputLimit()).isZero();
        assertThat(store.rows.get(baseUrl + "|qwen").outputPerMinute()).isZero();
        assertThat(log).contains("Chat model 'qwen' wrote 3600 tokens in one answer, more than its learned output limit of 900 a minute: "
                + "the limit is cleared");
    }

    private OpenAiCompatibleModelGateway gatewayAt(String path, String model, int maxOutput, ModelLimitsStore store) {
        String baseUrl = "http://127.0.0.1:" + server.getAddress().getPort() + path;
        return new OpenAiCompatibleModelGateway(new ModelProperties(baseUrl, "test-key", model, "nomic-embed-text", Duration.ofSeconds(5), null,
                null, 16384, maxOutput, null), store);
    }

    @Test
    void aLargePlansHeadersNeverMakeAHugeMaxTokens() {
        for (String total : List.of("30000000", "300000")) {
            otpmAsked.clear();
            MemoryLimits store = new MemoryLimits();
            OpenAiCompatibleModelGateway configured = gatewayAt("/hdr" + total + "/v1", "qwen", 8192, store);
            configured.chat("Write the file.", "A.java");
            configured.chat("Write the file.", "B.java");
            // the total is learned, but only a small one sizes the answer: still FACTORY_MODEL_MAX_OUTPUT_TOKENS
            assertThat(configured.tokensPerMinute()).isEqualTo(Integer.parseInt(total));
            assertThat(otpmAsked).as(total).containsExactly(8192, 8192);

            // and with nothing configured, the server decides, as before
            otpmAsked.clear();
            OpenAiCompatibleModelGateway unset = gatewayAt("/hdr" + total + "/v1", "qwen", 0, new MemoryLimits());
            unset.chat("Write the file.", "A.java");
            unset.chat("Write the file.", "B.java");
            assertThat(otpmAsked).as(total).containsExactly(-1, -1);
        }
    }

    @Test
    void aMaxTokensRefusalIsLearnedAndAModelThatTakesMaxCompletionTokensGetsThem() {
        MemoryLimits store = new MemoryLimits();
        OpenAiCompatibleModelGateway gateway = gatewayAt("/answermax/v1", "qwen", 50_000, store);

        gateway.chat("Write the file.", "A.java");
        gateway.chat("Write the file.", "B.java");

        assertThat(otpmAsked).containsExactly(50_000, 32_768, 32_768);
        assertThat(store.rows.values()).singleElement().satisfies(s -> assertThat(s.answerMax()).isEqualTo(32_768));
        assertThat(OpenAiCompatibleModelGateway.answerMaxRefused("max_tokens is too large: 50000. This model supports at most 16384 completion "
                + "tokens, whereas you provided 50000.")).isEqualTo(16_384);

        OpenAiCompatibleModelGateway o4 = gatewayAt("/completiontokens/v1", "o4-mini", 4096, new MemoryLimits());
        assertThat(o4.chat("Write the file.", "A.java").reply()).isEqualTo("ok");
        assertThat(thinkRequests).hasSize(2);
        assertThat(thinkRequests.getLast()).contains("\"max_completion_tokens\"").doesNotContain("\"max_tokens\"");
        o4.chat("Write the file.", "B.java");
        assertThat(thinkRequests).hasSize(3);
    }

    @Test
    void anImageCallIsLimitedLikeEveryOtherCall() {
        ModelGateway gateway = gatewayFor("/limited/v1");

        assertThat(gateway.chatJsonWithImage("Answer in JSON.", "Plan the change", new byte[] {1, 2, 3}, "image/png").reply())
                .isEqualTo("{\"ok\": true}");
        // waited out and asked again, as a text call is
        assertThat(limitedCalls.get()).isEqualTo(2);
    }

    @Test
    void aReasoningEffortRefusalDoesNotTurnOffStreamingForJson() {
        OpenAiCompatibleModelGateway gateway = gatewayAt("/strict/v1", "qwen3-coder", 0, new MemoryLimits());

        try {
            gateway.chatJson("Answer in JSON.", "A plan");
        } catch (RuntimeException e) {
            // the stub answers a stream in one piece; only the requests matter here
        }
        assertThat(thinkRequests.getFirst()).containsPattern("\"stream\"\\s*:\\s*true").contains("reasoning_effort");
        // asked again without reasoning_effort, still streamed
        assertThat(thinkRequests.get(1)).containsPattern("\"stream\"\\s*:\\s*true").doesNotContain("reasoning_effort");
    }

    @Test
    void textFromAServerIsReadInLinearTime() {
        long start = System.nanoTime();
        assertThat(OpenAiCompatibleModelGateway.withoutThinking("<think>".repeat(16_000))).isEmpty();
        assertThat(OpenAiCompatibleModelGateway.withoutThinking("<think>a</think>\n x<think>b</think> y")).isEqualTo("xy");
        assertThat(OpenAiCompatibleModelGateway.serverMessage(" ".repeat(100_000) + "x")).isNotNull();
        assertThat(OpenAiCompatibleModelGateway.tooLarge("maximum context length is 8192 tokens" + " ".repeat(100_000))).isNull();
        assertThat(OpenAiCompatibleModelGateway.rateLimitWait("rate limit reached, try again in .s")).isNotNull();
        assertThat(Duration.ofNanos(System.nanoTime() - start)).isLessThan(Duration.ofSeconds(2));
        assertThat(OpenAiCompatibleModelGateway.messages(new RuntimeException("x".repeat(100_000))))
                .hasSize(OpenAiCompatibleModelGateway.MAX_ERROR_TEXT);
    }

    @Test
    void oddLearnedValuesAreUnknownAndAnAdminCanForgetWhatWasLearned() {
        String baseUrl = "http://127.0.0.1:" + server.getAddress().getPort() + "/opm/v1";
        MemoryLimits store = new MemoryLimits();
        // below the floors: no server's limit is that small
        store.save(baseUrl, "qwen", new ModelLimitsStore.Stored(500, 3.5, 0, 1000, 1000));
        OpenAiCompatibleModelGateway gateway = gatewayAt("/opm/v1", "qwen", 8192, store);
        assertThat(gateway.inputLimit()).isZero();
        assertThat(gateway.tokensPerMinute()).isZero();
        assertThat(gateway.outputLimit()).isEqualTo(1000);

        gateway.forgetLimits();

        assertThat(gateway.outputLimit()).isZero();
        assertThat(store.cleared).containsExactly(baseUrl + "|qwen");
        // a refusal that is no refusal of size teaches nothing
        assertThat(OpenAiCompatibleModelGateway.sizeRefusal(new RuntimeException("x"), "Invalid value for temperature")).isFalse();
        assertThat(OpenAiCompatibleModelGateway.sizeRefusal(new RuntimeException("x"), "Request too large: Limit 7000, Requested 7663 tokens"))
                .isTrue();
    }

    @Test
    void aJobWaitsOnRateLimitsOnlySoLongInAll() {
        WaitBudget.start(Duration.ofMillis(100));
        try {
            WaitBudget.spend(Duration.ofMillis(60), "qwen");
            org.assertj.core.api.Assertions.assertThatThrownBy(() -> WaitBudget.spend(Duration.ofMillis(60), "qwen"))
                    .isInstanceOf(ModelLimitReachedException.class)
                    .hasMessageContaining("The model's server kept rate-limiting; try again later or use a plan with higher limits.");
        } finally {
            WaitBudget.end();
        }
        // outside a job nothing is counted
        WaitBudget.spend(Duration.ofHours(1), "qwen");
    }

    @Test
    void aModelServerAddressCarriesNoSecrets() {
        for (String url : List.of("http://user:pass@host:11434/v1", "https://api.example.com/v1?key=secret", "https://api.example.com/v1#x")) {
            org.assertj.core.api.Assertions.assertThatThrownBy(() -> ModelSettings.plainServerUrl(url))
                    .isInstanceOf(com.obdx.factory.common.BadRequestException.class).hasMessageContaining("without a user name");
        }
        ModelSettings.plainServerUrl("https://api.groq.com/openai/v1");
        assertThat(ModelSettings.origin("https://api.groq.com/openai/v1")).isEqualTo("https://api.groq.com");
        assertThat(ModelSettings.origin("http://localhost:11434/v1")).isEqualTo("http://localhost:11434");
    }

    @Test
    void saysWaitsAsPeopleDo() {
        assertThat(OpenAiCompatibleModelGateway.roughly(Duration.ofSeconds(45))).isEqualTo("45 seconds");
        assertThat(OpenAiCompatibleModelGateway.roughly(Duration.ofSeconds(106))).isEqualTo("about 2 minutes");
        assertThat(OpenAiCompatibleModelGateway.roughly(Duration.ofMinutes(14).plusSeconds(30))).isEqualTo("about 15 minutes");
        assertThat(OpenAiCompatibleModelGateway.roughly(Duration.ofHours(5))).isEqualTo("about 5 hours");
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
                new ModelProperties(baseUrl, "test-key", "qwen2.5-coder:7b", "nomic-embed-text", timeout, null, null, 16384, 0, null));
    }

    private static void ndjson(com.sun.net.httpserver.HttpExchange exchange, String lines) throws IOException {
        byte[] bytes = lines.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().add("Content-Type", "application/x-ndjson");
        exchange.sendResponseHeaders(200, bytes.length);
        try (OutputStream out = exchange.getResponseBody()) {
            out.write(bytes);
        }
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
