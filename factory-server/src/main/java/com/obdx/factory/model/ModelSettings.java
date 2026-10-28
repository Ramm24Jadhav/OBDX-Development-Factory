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

    /** The connection to use. */
    public record Current(String baseUrl, String apiKey, String chatModel, String embeddingModel, boolean saved,
                          OffsetDateTime updatedAt, String updatedBy) {
    }

    /** Published after the settings were saved. */
    public record Changed(Current settings) {
    }

    /**
     * @param apiKey null keeps the stored key (when the server stays the same), empty removes it
     */
    public record Update(String baseUrl, String apiKey, String chatModel, String embeddingModel) {
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
    }

    public Current current() {
        List<Current> saved = jdbc.query("SELECT base_url, api_key, chat_model, embedding_model, updated_at, updated_by FROM model_settings WHERE id = 1",
                (rs, i) -> new Current(rs.getString(1), rs.getString(2) == null ? null : cipher.decrypt(rs.getString(2)),
                        rs.getString(3), rs.getString(4), true, rs.getObject(5, OffsetDateTime.class), rs.getString(6)));
        return saved.isEmpty()
                ? new Current(defaults.baseUrl(), defaults.apiKey(), defaults.chatModel(), defaults.embeddingModel(), false, null, null)
                : saved.getFirst();
    }

    /** The API key stored for this server, for listing its models without typing the key again; null if none. */
    public String storedKeyFor(String baseUrl) {
        Current current = current();
        return normalize(baseUrl).equals(normalize(current.baseUrl())) ? current.apiKey() : null;
    }

    /**
     * Saves the choice. When the embedding model changes, existing embeddings no longer match new ones, so they are
     * removed; the next import of each workspace creates them again.
     *
     * @return whether embeddings were removed
     */
    @Transactional
    public boolean save(Update update, String username) {
        String baseUrl = normalize(update.baseUrl());
        if (!baseUrl.matches("https?://.+")) {
            throw new BadRequestException("The model server URL must start with http:// or https://");
        }
        if (blank(update.chatModel()) || blank(update.embeddingModel())) {
            throw new BadRequestException("Choose a chat model and an embedding model");
        }
        Current before = current();
        String apiKey = update.apiKey() == null ? storedKeyFor(baseUrl) : update.apiKey().isBlank() ? null : update.apiKey().strip();
        String encrypted;
        try {
            encrypted = apiKey == null || apiKey.equals("not-needed") ? null : cipher.encrypt(apiKey);
        } catch (SecretCipher.MissingSecretKeyException e) {
            throw new BadRequestException("Set FACTORY_SECRET_KEY before storing an API key");
        }
        jdbc.update("""
                INSERT INTO model_settings (id, base_url, api_key, chat_model, embedding_model, updated_at, updated_by)
                VALUES (1, ?, ?, ?, ?, ?, ?)
                ON CONFLICT (id) DO UPDATE SET base_url = excluded.base_url, api_key = excluded.api_key, chat_model = excluded.chat_model,
                    embedding_model = excluded.embedding_model, updated_at = excluded.updated_at, updated_by = excluded.updated_by
                """, baseUrl, encrypted, update.chatModel().strip(), update.embeddingModel().strip(), OffsetDateTime.now(), username);
        boolean embeddingChanged = !sameModel(before.embeddingModel(), update.embeddingModel());
        if (embeddingChanged) {
            jdbc.update("UPDATE code_chunk SET embedding = NULL WHERE embedding IS NOT NULL");
        }
        events.publishEvent(new Changed(current()));
        return embeddingChanged;
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
