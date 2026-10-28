package com.obdx.factory.model;

import com.obdx.factory.common.BadRequestException;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.regex.Pattern;

/**
 * Finds model servers and their models: on this computer (Ollama, vLLM, LM Studio on their usual ports) or at any
 * OpenAI-compatible URL, through its /models list.
 */
@Component
public class ModelServers {

    /** A model the server offers; embedding is a guess from the name, for preselecting it. */
    public record Model(String id, boolean embedding) {
    }

    public record Server(String name, String baseUrl, List<Model> models) {
    }

    static final List<Server> LOCAL_CANDIDATES = List.of(
            new Server("Ollama", "http://localhost:11434/v1", List.of()),
            new Server("vLLM", "http://localhost:8000/v1", List.of()),
            new Server("LM Studio", "http://localhost:1234/v1", List.of()));
    private static final Pattern EMBEDDING_NAME = Pattern.compile("(?i)embed|(^|[/_:-])(bge|gte|e5|minilm|mxbai)([/_:.-]|$)");

    private final ObjectMapper json;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();

    public ModelServers(ObjectMapper json) {
        this.json = json;
    }

    /** The models at an OpenAI-compatible base URL (for example http://gpu-host:11434/v1). */
    public List<Model> models(String baseUrl, String apiKey) {
        String url = ModelSettings.normalize(baseUrl);
        if (!url.matches("https?://.+")) {
            throw new BadRequestException("The model server URL must start with http:// or https://");
        }
        try {
            return fetch(url, apiKey, Duration.ofSeconds(15));
        } catch (IOException | IllegalArgumentException e) {
            String reason = describe(e);
            throw new BadRequestException("Could not get the models of " + url + ": " + reason
                    + (reason.contains("API key") ? "." : ". Check the address (it usually ends with /v1) and that the server is running."));
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new BadRequestException("Interrupted");
        }
    }

    /** Model servers answering on this computer, with their models. */
    public List<Server> local() {
        List<CompletableFuture<Server>> probes = LOCAL_CANDIDATES.stream().map(candidate -> CompletableFuture.supplyAsync(() -> {
            try {
                return new Server(candidate.name(), candidate.baseUrl(), fetch(candidate.baseUrl(), null, Duration.ofSeconds(3)));
            } catch (IOException | RuntimeException e) {
                return null;
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                return null;
            }
        })).toList();
        List<Server> found = new ArrayList<>();
        for (CompletableFuture<Server> probe : probes) {
            Server server = probe.join();
            if (server != null) {
                found.add(server);
            }
        }
        return found;
    }

    private List<Model> fetch(String baseUrl, String apiKey, Duration timeout) throws IOException, InterruptedException {
        HttpRequest.Builder request = HttpRequest.newBuilder(URI.create(baseUrl + "/models")).timeout(timeout).GET();
        if (apiKey != null && !apiKey.isBlank() && !apiKey.equals("not-needed")) {
            request.header("Authorization", "Bearer " + apiKey);
        }
        HttpResponse<String> response = http.send(request.build(), HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() == 401 || response.statusCode() == 403) {
            throw new IOException("the server needs a valid API key (HTTP " + response.statusCode() + ")");
        }
        if (response.statusCode() != 200) {
            throw new IOException("HTTP " + response.statusCode());
        }
        JsonNode data = json.readTree(response.body()).path("data");
        if (!data.isArray()) {
            throw new IOException("the answer is not an OpenAI-compatible model list");
        }
        List<Model> models = new ArrayList<>();
        for (JsonNode model : data) {
            String id = model.path("id").asString();
            if (!id.isBlank()) {
                models.add(new Model(id, EMBEDDING_NAME.matcher(id).find()));
            }
        }
        models.sort(Comparator.comparing(Model::id));
        return models;
    }

    private static String describe(Exception e) {
        String message = e.getMessage();
        return message == null || message.isBlank() ? e.getClass().getSimpleName() : message;
    }
}
