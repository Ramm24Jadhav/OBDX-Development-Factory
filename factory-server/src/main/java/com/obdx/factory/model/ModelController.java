package com.obdx.factory.model;

import com.obdx.factory.auth.AccessGuard;
import com.obdx.factory.auth.AuditLog;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.OffsetDateTime;
import java.util.List;

/**
 * Lets an admin check the model connection from the UI before any real work depends on it.
 */
@RestController
@RequestMapping("/api/model")
public class ModelController {

    private static final String SYSTEM_PROMPT =
            "You are the assistant of OBDX Development Factory, a tool for building Oracle Banking Digital Experience "
                    + "customizations. Answer briefly and precisely.";

    private final ModelGateway gateway;
    private final ModelSettings settings;
    private final ModelServers servers;
    private final AccessGuard guard;
    private final AuditLog audit;

    public ModelController(ModelGateway gateway, ModelSettings settings, ModelServers servers, AccessGuard guard, AuditLog audit) {
        this.gateway = gateway;
        this.settings = settings;
        this.servers = servers;
        this.guard = guard;
        this.audit = audit;
    }

    @GetMapping("/status")
    public StatusResponse status() {
        ModelSettings.Current current = settings.current();
        return new StatusResponse(current.baseUrl(), current.chatModel(), current.embeddingModel(), current.embeddingBaseUrl(),
                current.saved(), isSet(current.apiKey()), current.embeddingBaseUrl() != null && isSet(current.embeddingApiKey()),
                current.updatedAt(), current.updatedBy());
    }

    private static boolean isSet(String apiKey) {
        return apiKey != null && !apiKey.isBlank() && !apiKey.equals("not-needed");
    }

    /** Model servers running on the computer the factory runs on. */
    @GetMapping("/servers/local")
    public List<ModelServers.Server> localServers() {
        guard.requireAdmin();
        return servers.local();
    }

    /** The models of a server; without an API key, the stored one is used if it is the current server. */
    @PostMapping("/servers/models")
    public List<ModelServers.Model> models(@RequestBody ServerRequest request) {
        guard.requireAdmin();
        String apiKey = request.apiKey() == null || request.apiKey().isBlank() ? settings.storedKeyFor(request.baseUrl()) : request.apiKey();
        return servers.models(request.baseUrl(), apiKey);
    }

    @PutMapping("/settings")
    public SaveResponse save(@RequestBody ModelSettings.Update request) {
        String username = guard.requireAdmin().getUsername();
        boolean embeddingsRemoved = settings.save(request, username);
        ModelSettings.Current current = settings.current();
        audit.record("MODEL_SETTINGS_CHANGED", null, current.baseUrl(), current.chatModel() + ", " + current.embeddingModel()
                + (current.embeddingBaseUrl() != null ? " at " + current.embeddingBaseUrl() : ""));
        return new SaveResponse(status(), embeddingsRemoved);
    }

    @PostMapping("/chat")
    public ModelGateway.ChatResult chat(@Valid @RequestBody ChatRequest request) {
        return gateway.chat(SYSTEM_PROMPT, request.prompt());
    }

    @PostMapping("/embed")
    public EmbedResponse embed(@Valid @RequestBody EmbedRequest request) {
        return new EmbedResponse(settings.current().embeddingModel(), gateway.embed(request.text()).length);
    }

    /**
     * @param embeddingBaseUrl server of the embedding model when it is not baseUrl, else null
     * @param saved            false while the FACTORY_MODEL_* settings apply (nothing chosen on the Models page yet)
     */
    public record StatusResponse(String baseUrl, String chatModel, String embeddingModel, String embeddingBaseUrl, boolean saved,
                                 boolean apiKeySet, boolean embeddingApiKeySet, OffsetDateTime updatedAt, String updatedBy) {
    }

    public record ServerRequest(String baseUrl, String apiKey) {
    }

    /** @param embeddingsRemoved the embedding model changed: imports create the search embeddings again */
    public record SaveResponse(StatusResponse status, boolean embeddingsRemoved) {
    }

    public record ChatRequest(@NotBlank @Size(max = 20_000) String prompt) {
    }

    public record EmbedRequest(@NotBlank @Size(max = 20_000) String text) {
    }

    public record EmbedResponse(String model, int dimensions) {
    }
}
