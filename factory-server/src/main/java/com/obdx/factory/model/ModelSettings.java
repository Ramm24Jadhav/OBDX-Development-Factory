package com.obdx.factory.model;

import com.obdx.factory.common.BadRequestException;
import com.obdx.factory.security.SecretCipher;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.List;

/**
 * Which model server and models the factory uses: what an administrator chose on the Models page, or else the
 * FACTORY_MODEL_* settings. Saving takes effect at once (the gateway reconnects on {@link Changed}).
 */
@Service
public class ModelSettings {

    /**
     * The connection to use.
     *
     * @param embeddingBaseUrl server of the embedding model when it is not the chat model server, else null
     */
    public record Current(String baseUrl, String apiKey, String chatModel, String embeddingModel, String embeddingBaseUrl,
                          String embeddingApiKey, boolean saved, OffsetDateTime updatedAt, String updatedBy) {

        public Current {
            // a provider's error can echo the key, whatever it looks like: masked by its value
            com.obdx.factory.common.KnownSecrets.remember(apiKey);
            com.obdx.factory.common.KnownSecrets.remember(embeddingApiKey);
        }

        /** Where the embedding model runs. */
        public String embeddingUrl() {
            return embeddingBaseUrl == null ? baseUrl : embeddingBaseUrl;
        }

        public String embeddingKey() {
            return embeddingBaseUrl == null ? apiKey : embeddingApiKey;
        }
    }

    /** Published after the settings were saved. */
    public record Changed(Current settings) {
    }

    /**
     * @param apiKey           null keeps the stored key (when the server stays the same), empty removes it
     * @param embeddingBaseUrl null or empty: the embedding model is on the chat model server
     * @param embeddingApiKey  as apiKey, for the embedding server
     */
    public record Update(String baseUrl, String apiKey, String chatModel, String embeddingModel, String embeddingBaseUrl,
                         String embeddingApiKey) {

        public Update {
            com.obdx.factory.common.KnownSecrets.remember(apiKey);
            com.obdx.factory.common.KnownSecrets.remember(embeddingApiKey);
        }

        public Update(String baseUrl, String apiKey, String chatModel, String embeddingModel) {
            this(baseUrl, apiKey, chatModel, embeddingModel, null, null);
        }
    }

    private final JdbcTemplate jdbc;
    private final SecretCipher cipher;
    private final ModelProperties defaults;
    private final ApplicationEventPublisher events;

    public ModelSettings(JdbcTemplate jdbc, SecretCipher cipher, ModelProperties defaults, ApplicationEventPublisher events) {
        this.jdbc = jdbc;
        this.cipher = cipher;
        this.defaults = defaults;
        this.events = events;
        // The address from the settings file is not checked like one entered on the Models page: say so, and keep its
        // secrets out of messages (see shown)
        for (String url : new String[] {defaults.baseUrl(), defaults.embeddingBaseUrl()}) {
            if (!blank(url) && !plain(url)) {
                org.slf4j.LoggerFactory.getLogger(ModelSettings.class).warn("The model server URL in the settings ({}) has a user name, "
                        + "password or query; they are left out of messages. Put the API key in its own setting.", origin(url));
            }
        }
    }

    public Current current() {
        List<Current> saved = jdbc.query("""
                        SELECT base_url, api_key, chat_model, embedding_model, embedding_base_url, embedding_api_key, updated_at, updated_by
                        FROM model_settings WHERE id = 1""",
                (rs, i) -> new Current(rs.getString(1), decrypt(rs.getString(2)), rs.getString(3), rs.getString(4),
                        rs.getString(5), decrypt(rs.getString(6)), true, rs.getObject(7, OffsetDateTime.class), rs.getString(8)));
        return saved.isEmpty()
                ? new Current(defaults.baseUrl(), defaults.apiKey(), defaults.chatModel(), defaults.embeddingModel(),
                        blank(defaults.embeddingBaseUrl()) ? null : normalize(defaults.embeddingBaseUrl()),
                        blank(defaults.embeddingApiKey()) ? null : defaults.embeddingApiKey(),
                        false, null, null)
                : saved.getFirst();
    }

    /** The API key stored for this server (chat or embedding), for listing its models without typing the key again; null if none. */
    public String storedKeyFor(String baseUrl) {
        Current current = current();
        String url = normalize(baseUrl);
        if (url.equals(normalize(current.baseUrl()))) {
            return current.apiKey();
        }
        return current.embeddingBaseUrl() != null && url.equals(normalize(current.embeddingBaseUrl())) ? current.embeddingApiKey() : null;
    }

    /**
     * Saves the choice. When the embedding model changes, existing embeddings no longer match new ones, so they are
     * removed; the next import of each workspace creates them again. The same model on another server gives the same
     * embeddings, so they are kept.
     *
     * @return whether embeddings were removed
     */
    @Transactional
    /**
     * A model server address without a user and password or a query: those are where secrets end up (and would then be
     * written to the log and shown on the page); the API key has its own field.
     */
    static void plainServerUrl(String url) {
        java.net.URI uri;
        try {
            uri = java.net.URI.create(url);
        } catch (IllegalArgumentException e) {
            throw new BadRequestException("The model server URL is not a valid address. Enter it as http(s)://host:port/v1.");
        }
        // (an address with two @ is read as a registry name, without user info: its authority still holds it)
        if (uri.getRawUserInfo() != null || uri.getRawQuery() != null || uri.getRawFragment() != null
                || uri.getRawAuthority() != null && uri.getRawAuthority().contains("@")) {
            throw new BadRequestException("Enter the model server URL without a user name, password or query (http(s)://host:port/v1); "
                    + "put the API key in its own field.");
        }
    }

    /** Whether a server address has no user, password, query or fragment (see plainServerUrl). */
    static boolean plain(String url) {
        try {
            plainServerUrl(url);
            return true;
        } catch (BadRequestException e) {
            return false;
        }
    }

    /**
     * A server address as messages that people read show it: without a user and password, a query or a fragment (where
     * secrets end up). A plain address is shown as it is; one that cannot be read, as its origin.
     */
    public static String shown(String url) {
        if (url == null) {
            return "(the model server)";
        }
        try {
            java.net.URI uri = java.net.URI.create(url);
            String authority = uri.getRawAuthority() == null ? "" : uri.getRawAuthority();
            if (uri.getRawUserInfo() == null && uri.getRawQuery() == null && uri.getRawFragment() == null && !authority.contains("@")) {
                return url;
            }
            // the host and port after the last @ (user:p@ss@host is read as one registry name)
            return uri.getScheme() + "://" + authority.substring(authority.lastIndexOf('@') + 1) + (uri.getRawPath() == null ? "" : uri.getRawPath());
        } catch (IllegalArgumentException e) {
            return origin(url);
        }
    }

    /** scheme://host:port of a server address, for the log. */
    public static String origin(String url) {
        try {
            java.net.URI uri = java.net.URI.create(url);
            return uri.getScheme() + "://" + uri.getHost() + (uri.getPort() > 0 ? ":" + uri.getPort() : "");
        } catch (IllegalArgumentException | NullPointerException e) {
            return "(the model server)";
        }
    }

    public boolean save(Update update, String username) {
        String baseUrl = normalize(update.baseUrl());
        if (!baseUrl.matches("https?://.+")) {
            throw new BadRequestException("The model server URL must start with http:// or https://");
        }
        String embeddingBaseUrl = blank(update.embeddingBaseUrl()) ? null : normalize(update.embeddingBaseUrl());
        if (embeddingBaseUrl != null && embeddingBaseUrl.equals(baseUrl)) {
            embeddingBaseUrl = null;
        }
        if (embeddingBaseUrl != null && !embeddingBaseUrl.matches("https?://.+")) {
            throw new BadRequestException("The code search server URL must start with http:// or https://");
        }
        plainServerUrl(baseUrl);
        if (embeddingBaseUrl != null) {
            plainServerUrl(embeddingBaseUrl);
        }
        if (blank(update.chatModel()) || blank(update.embeddingModel())) {
            throw new BadRequestException("Choose a chat model and an embedding model");
        }
        Current before = current();
        String apiKey = keyToStore(update.apiKey(), baseUrl);
        String embeddingApiKey = embeddingBaseUrl == null ? null : keyToStore(update.embeddingApiKey(), embeddingBaseUrl);
        jdbc.update("""
                INSERT INTO model_settings (id, base_url, api_key, chat_model, embedding_model, embedding_base_url, embedding_api_key,
                    updated_at, updated_by)
                VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT (id) DO UPDATE SET base_url = excluded.base_url, api_key = excluded.api_key, chat_model = excluded.chat_model,
                    embedding_model = excluded.embedding_model, embedding_base_url = excluded.embedding_base_url,
                    embedding_api_key = excluded.embedding_api_key, updated_at = excluded.updated_at, updated_by = excluded.updated_by
                """, baseUrl, apiKey, update.chatModel().strip(), update.embeddingModel().strip(), embeddingBaseUrl, embeddingApiKey,
                OffsetDateTime.now(), username);
        boolean embeddingChanged = !sameModel(before.embeddingModel(), update.embeddingModel());
        if (embeddingChanged) {
            jdbc.update("UPDATE code_chunk SET embedding = NULL WHERE embedding IS NOT NULL");
        }
        events.publishEvent(new Changed(current()));
        return embeddingChanged;
    }

    /** The encrypted key to store: null in the update keeps the key stored for this server, empty removes it. */
    private String keyToStore(String requested, String url) {
        String apiKey = requested == null ? storedKeyFor(url) : requested.isBlank() ? null : requested.strip();
        try {
            return apiKey == null || apiKey.equals("not-needed") ? null : cipher.encrypt(apiKey);
        } catch (SecretCipher.MissingSecretKeyException e) {
            throw new BadRequestException("Set FACTORY_SECRET_KEY before storing an API key");
        }
    }

    private String decrypt(String value) {
        return value == null ? null : cipher.decrypt(value);
    }

    /** Ollama treats "name" and "name:latest" as the same model. */
    static boolean sameModel(String a, String b) {
        return a.strip().replaceAll(":latest$", "").equals(b.strip().replaceAll(":latest$", ""));
    }

    static String normalize(String url) {
        return url == null ? "" : url.strip().replaceAll("/+$", "");
    }

    private static boolean blank(String value) {
        return value == null || value.isBlank();
    }
}
