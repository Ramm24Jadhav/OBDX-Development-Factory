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
    private final ProviderChecks checks;
    private final ModelLimitsStore limits;

    public ModelController(ModelGateway gateway, ModelSettings settings, ModelServers servers, AccessGuard guard, AuditLog audit,
                           ProviderChecks checks, ModelLimitsStore limits) {
        this.gateway = gateway;
        this.settings = settings;
        this.servers = servers;
        this.guard = guard;
        this.audit = audit;
        this.checks = checks;
        this.limits = limits;
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

    /** Forgets the limits learned from the chat model's server (admins): they are learned again from its answers. */
    @PostMapping("/limits/forget")
    public void forgetLimits() {
        String username = guard.requireAdmin().getUsername();
        gateway.forgetLimits();
        ModelSettings.Current current = settings.current();
        audit.record("MODEL_LIMITS_FORGOTTEN", null, current.baseUrl(), current.chatModel() + " by " + username);
    }

    /** Model servers running on the computer the factory runs on. */
    @GetMapping("/servers/local")
    public List<ModelServers.Server> localServers() {
        guard.requireAdmin();
        long start = System.currentTimeMillis();
        List<ModelServers.Server> found = servers.local();
        // Finding a server lists its models, so it counts as a test that succeeded
        found.forEach(s -> checks.succeeded(s.baseUrl(), System.currentTimeMillis() - start, s.models().size()));
        return found;
    }

    /** The models of a server; without an API key, the stored one is used if it is the current server. */
    @PostMapping("/servers/models")
    public List<ModelServers.Model> models(@RequestBody ServerRequest request) {
        guard.requireAdmin();
        String apiKey = request.apiKey() == null || request.apiKey().isBlank() ? settings.storedKeyFor(request.baseUrl()) : request.apiKey();
        long start = System.currentTimeMillis();
        try {
            List<ModelServers.Model> found = servers.models(request.baseUrl(), apiKey);
            checks.succeeded(request.baseUrl(), System.currentTimeMillis() - start, found.size());
            return found;
        } catch (RuntimeException e) {
            checks.failed(request.baseUrl(), System.currentTimeMillis() - start, e.getMessage());
            throw e;
        }
    }

    /** The connection tests run since the factory started (administrators): last test, last success, last error. */
    @GetMapping("/checks")
    public List<ProviderChecks.Check> checks() {
        guard.requireAdmin();
        return checks.all();
    }

    /** The limits learned from model servers' refusals, still in force (signed-in users): shown, never changed here. */
    @GetMapping("/limits")
    public List<ModelLimitsStore.Learned> learnedLimits() {
        guard.current();
        return limits.all();
    }

    @PutMapping("/settings")
    public SaveResponse save(@RequestBody ModelSettings.Update request) {
        String username = guard.requireAdmin().getUsername();
        ModelSettings.Current before = settings.current();
        boolean embeddingsRemoved = settings.save(request, username);
        ModelSettings.Current current = settings.current();
        audit.record("MODEL_SETTINGS_CHANGED", null, current.baseUrl(), current.chatModel() + ", " + current.embeddingModel()
                + (current.embeddingBaseUrl() != null ? " at " + current.embeddingBaseUrl() : "")
                + keyChange("API key", before.apiKey(), current.apiKey())
                + keyChange("code search server API key", before.embeddingBaseUrl() == null ? null : before.embeddingApiKey(),
                current.embeddingBaseUrl() == null ? null : current.embeddingApiKey()));
        return new SaveResponse(status(), embeddingsRemoved, embeddingProblem(current));
    }

    /** "; API key changed" (set, removed) when the key is not the one before; the key itself is never written. */
    static String keyChange(String what, String before, String after) {
        boolean had = isSet(before);
        boolean has = isSet(after);
        if (!had && !has || had && has && before.equals(after)) {
            return "";
        }
        return "; " + what + (!had ? " set" : !has ? " removed" : " changed");
    }

    /**
     * Whether the embedding model embeds: a short fixed phrase (nothing of the bank's) is sent to it. Code search and
     * the OBDX Library search by meaning with it, and a chat model in its place fails there (or, on a server that
     * embeds with any model, matches poorly). Null when it embeds and looks like an embedding model.
     */
    String embeddingProblem(ModelSettings.Current current) {
        String model = current.embeddingModel();
        try {
            if (gateway.embed("OBDX Development Factory embedding check").length == 0) {
                return "The embedding model '" + model + "' returned no vector. Choose an embedding model, for example nomic-embed-text on Ollama.";
            }
        } catch (ModelGatewayException e) {
            return "The embedding model '" + model + "' at " + ModelSettings.shown(current.embeddingUrl()) + " cannot embed ("
                    + com.obdx.factory.common.Messages.redacted(e.getMessage()) + "). Choose an "
                    + "embedding model, for example nomic-embed-text on Ollama: chat models do not embed, and some servers (Groq) have "
                    + "no embedding models, so set a code search server (an Ollama on this computer) for embeddings.";
        }
        return looksLikeEmbeddingModel(model) ? null : "'" + model + "' embeds, but it does not look like an embedding model: a chat "
                + "model used for embeddings finds far less. Prefer an embedding model, for example nomic-embed-text, mxbai-embed-large "
                + "or bge-m3.";
    }

    /** The names of the common embedding models: nomic-embed-text, mxbai-embed-large, bge-m3, e5, gte, all-minilm ... */
    static boolean looksLikeEmbeddingModel(String model) {
        String m = model == null ? "" : model.toLowerCase(java.util.Locale.ROOT);
        return m.contains("embed") || m.contains("bge") || m.matches(".*(^|[/_-])e5([/_-]|$).*") || m.contains("gte-") || m.contains("minilm")
                || m.contains("mpnet") || m.contains("arctic") || m.contains("granite-embedding") || m.contains("jina");
    }

    /** The Models page's test prompt: administrators, who choose the models (it costs model time and, on a cloud plan, money). */
    @PostMapping("/chat")
    public ModelGateway.ChatResult chat(@Valid @RequestBody ChatRequest request) {
        guard.requireAdmin();
        return gateway.chat(SYSTEM_PROMPT, request.prompt());
    }

    @PostMapping("/embed")
    public EmbedResponse embed(@Valid @RequestBody EmbedRequest request) {
        guard.requireAdmin();
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

        public ServerRequest {
            com.obdx.factory.common.KnownSecrets.remember(apiKey);
        }
    }

    /**
     * @param embeddingsRemoved the embedding model changed: imports create the search embeddings again
     * @param embeddingProblem  why the embedding model cannot embed (or does not look like an embedding model); null: fine
     */
    public record SaveResponse(StatusResponse status, boolean embeddingsRemoved, String embeddingProblem) {
    }

    public record ChatRequest(@NotBlank @Size(max = 20_000) String prompt) {
    }

    public record EmbedRequest(@NotBlank @Size(max = 20_000) String text) {
    }

    public record EmbedResponse(String model, int dimensions) {
    }
}
