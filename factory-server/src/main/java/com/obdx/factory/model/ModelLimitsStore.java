package com.obdx.factory.model;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.Optional;

/**
 * The limits a chat model's server showed when it refused a request (input tokens per request, characters per token, tokens per minute in all,
 * output tokens per answer), kept per server and model so that a restart does not ask too much again: on a free plan
 * every refused request also counts against the day.
 */
@Component
public class ModelLimitsStore {

    /**
     * What was learned; 0 where nothing was.
     *
     * @param output          a per-answer output cap learned under earlier rules: cleared when read
     * @param outputPerMinute the output tokens a minute the server allows
     */
    public record Stored(int input, double charsPerToken, int output, int total, int outputPerMinute) {

        public Stored(int input, double charsPerToken, int output, int total) {
            this(input, charsPerToken, output, total, 0);
        }
    }

    private final JdbcTemplate jdbc;

    public ModelLimitsStore(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public Optional<Stored> find(String baseUrl, String model) {
        return jdbc.query("SELECT input_tokens, chars_per_token, output_tokens, total_tokens, output_per_minute FROM model_limits "
                        + "WHERE base_url = ? AND model = ?",
                (rs, row) -> new Stored(rs.getInt(1), rs.getDouble(2), rs.getInt(3), rs.getInt(4), rs.getInt(5)), key(baseUrl), key(model)).stream().findFirst();
    }

    public void save(String baseUrl, String model, Stored limits) {
        jdbc.update("INSERT INTO model_limits (base_url, model, input_tokens, chars_per_token, output_tokens, total_tokens, output_per_minute, "
                        + "updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, now()) ON CONFLICT (base_url, model) DO UPDATE SET input_tokens = EXCLUDED.input_tokens, "
                        + "chars_per_token = EXCLUDED.chars_per_token, output_tokens = EXCLUDED.output_tokens, "
                        + "total_tokens = EXCLUDED.total_tokens, output_per_minute = EXCLUDED.output_per_minute, updated_at = now()",
                key(baseUrl), key(model), limits.input(), limits.charsPerToken(), limits.output(), limits.total(), limits.outputPerMinute());
    }

    /** Forgets what one server and model showed (the settings moved to another, or its plan may have changed). */
    public void clear(String baseUrl, String model) {
        jdbc.update("DELETE FROM model_limits WHERE base_url = ? AND model = ?", key(baseUrl), key(model));
    }

    private static String key(String value) {
        return value == null ? "" : value.strip().replaceAll("/+$", "");
    }
}
