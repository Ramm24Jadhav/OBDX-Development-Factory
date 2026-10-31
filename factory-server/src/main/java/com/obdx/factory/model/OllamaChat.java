package com.obdx.factory.model;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Iterator;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Consumer;
import java.util.function.LongConsumer;

/**
 * Chat with an Ollama server through its own API rather than its OpenAI-compatible one. Ollama runs a model with a
 * 4,096-token context unless a request asks for more, and only its own API can ask: through the OpenAI-compatible API a
 * BRD section, a Library question with its manual excerpts or a file to write is cut to fit, silently, and the answer
 * with it. Here each call gets a context that fits its prompt and the answer, up to what the model supports and
 * {@code maxContext}; it only grows, so the model is not reloaded for every call.
 */
final class OllamaChat {

    /** Room kept for the answer. */
    private static final int ANSWER_TOKENS = 4096;
    private static final int DEFAULT_CONTEXT = 4096;

    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();
    private final ObjectMapper json = JsonMapper.builder().build();
    private final int maxContext;
    private final Duration askAgain;
    private final Map<String, Detection> ollama = new ConcurrentHashMap<>();
    private final Map<String, Integer> modelLimit = new ConcurrentHashMap<>();
    private final Map<String, Integer> contextInUse = new ConcurrentHashMap<>();

    /** Whether a server answered as Ollama, and when it was asked (System.nanoTime). */
    private record Detection(boolean ollama, long at) {
    }

    /** A complete answer; doneReason "length" when the model stopped at the end of the context. */
    record Answer(String text, String doneReason) {

        boolean cutOff() {
            return "length".equals(doneReason);
        }
    }

    OllamaChat(int maxContext) {
        this(maxContext, Duration.ofMinutes(1));
    }

    OllamaChat(int maxContext, Duration askAgain) {
        this.maxContext = Math.max(DEFAULT_CONTEXT, maxContext);
        this.askAgain = askAgain;
    }

    /** http://localhost:11434/v1 → http://localhost:11434 */
    static String root(String baseUrl) {
        String root = baseUrl == null ? "" : baseUrl.strip().replaceAll("/+$", "");
        return root.endsWith("/v1") ? root.substring(0, root.length() - 3) : root;
    }

    /**
     * Whether the server is Ollama: it answers /api/version. A server found to be Ollama is not asked again; one that
     * did not answer is asked again after {@code askAgain}, since Ollama may have been started after the factory.
     */
    boolean isOllama(String baseUrl) {
        String root = root(baseUrl);
        Detection known = ollama.get(root);
        if (known != null && (known.ollama() || System.nanoTime() - known.at() < askAgain.toNanos())) {
            return known.ollama();
        }
        boolean found = askVersion(root);
        ollama.put(root, new Detection(found, System.nanoTime()));
        return found;
    }

    /** Forgets which servers are Ollama (the model settings changed). */
    void forget() {
        ollama.clear();
    }

    private boolean askVersion(String root) {
        try {
            HttpResponse<String> r = http.send(HttpRequest.newBuilder(URI.create(root + "/api/version")).timeout(Duration.ofSeconds(3)).GET().build(),
                    HttpResponse.BodyHandlers.ofString());
            return r.statusCode() == 200 && json.readTree(r.body()).has("version");
        } catch (IOException | RuntimeException e) {
            return false;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return false;
        }
    }

    /**
     * The context for a prompt of this many characters: the prompt (about three characters a token, on the safe side)
     * and the answer, in steps of 2,048 tokens, at least what is in use already, at most the model's own limit and
     * maxContext.
     */
    int contextFor(String baseUrl, String model, int promptChars) {
        int needed = promptChars / 3 + ANSWER_TOKENS;
        int stepped = (int) Math.ceil(needed / 2048.0) * 2048;
        int limit = Math.min(maxContext, limitOf(baseUrl, model));
        String key = root(baseUrl) + "|" + model;
        int context = Math.max(DEFAULT_CONTEXT, Math.min(limit, Math.max(stepped, contextInUse.getOrDefault(key, DEFAULT_CONTEXT))));
        contextInUse.put(key, context);
        return context;
    }

    /** The model's own context length (from /api/show), or maxContext when it cannot be read. */
    private int limitOf(String baseUrl, String model) {
        return modelLimit.computeIfAbsent(root(baseUrl) + "|" + model, key -> {
            try {
                ObjectNode body = json.createObjectNode().put("model", model);
                HttpResponse<String> r = http.send(HttpRequest.newBuilder(URI.create(root(baseUrl) + "/api/show")).timeout(Duration.ofSeconds(10))
                        .header("Content-Type", "application/json").POST(HttpRequest.BodyPublishers.ofString(json.writeValueAsString(body))).build(),
                        HttpResponse.BodyHandlers.ofString());
                Iterator<Map.Entry<String, JsonNode>> info = json.readTree(r.body()).path("model_info").properties().iterator();
                while (info.hasNext()) {
                    Map.Entry<String, JsonNode> e = info.next();
                    if (e.getKey().endsWith(".context_length") && e.getValue().asInt(0) > 0) {
                        return e.getValue().asInt();
                    }
                }
            } catch (IOException | RuntimeException e) {
                // the cap stands
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
            return maxContext;
        });
    }

    /**
     * Streams a chat answer from /api/chat. Each piece goes to {@code pieces}, and {@code alive} hears that the model
     * is still writing. Blocks until the answer is complete; the caller enforces its timeout by closing {@code body}.
     */
    Answer chat(String baseUrl, String model, String system, String user, boolean jsonFormat, Consumer<String> pieces,
                LongConsumer alive, Consumer<InputStream> body) throws IOException, InterruptedException {
        ObjectNode request = json.createObjectNode();
        request.put("model", model);
        request.put("stream", true);
        if (jsonFormat) {
            request.put("format", "json");
        }
        ArrayNode messages = request.putArray("messages");
        if (system != null && !system.isBlank()) {
            messages.addObject().put("role", "system").put("content", system);
        }
        messages.addObject().put("role", "user").put("content", user);
        int chars = (system == null ? 0 : system.length()) + user.length();
        int context = contextFor(baseUrl, model, chars);
        // The answer ends where the context does: Ollama otherwise shifts the context and a small model caught in a
        // loop writes on for hours
        request.putObject("options").put("num_ctx", context).put("num_predict", Math.max(1024, context - chars / 3));
        HttpResponse<InputStream> response = http.send(HttpRequest.newBuilder(URI.create(root(baseUrl) + "/api/chat"))
                        .header("Content-Type", "application/json").POST(HttpRequest.BodyPublishers.ofString(json.writeValueAsString(request))).build(),
                HttpResponse.BodyHandlers.ofInputStream());
        body.accept(response.body());
        StringBuilder reply = new StringBuilder();
        String doneReason = null;
        try (BufferedReader lines = new BufferedReader(new InputStreamReader(response.body(), StandardCharsets.UTF_8))) {
            if (response.statusCode() != 200) {
                StringBuilder error = new StringBuilder();
                lines.lines().forEach(error::append);
                String message = error.toString();
                try {
                    message = json.readTree(message).path("error").asString(message);
                } catch (RuntimeException e) {
                    // the body as it is
                }
                throw new IOException("HTTP " + response.statusCode() + ": " + message);
            }
            String line;
            while ((line = lines.readLine()) != null) {
                if (line.isBlank()) {
                    continue;
                }
                alive.accept(System.nanoTime());
                JsonNode chunk = json.readTree(line);
                if (chunk.has("error")) {
                    throw new IOException(chunk.path("error").asString());
                }
                String piece = chunk.path("message").path("content").asString("");
                if (!piece.isEmpty()) {
                    reply.append(piece);
                    pieces.accept(piece);
                }
                if (chunk.path("done").asBoolean(false)) {
                    doneReason = chunk.path("done_reason").asString(null);
                    break;
                }
            }
        }
        return new Answer(reply.toString(), doneReason);
    }
}
