package com.obdx.factory.componentpack;

import com.obdx.factory.componentpack.ComponentPackService.Style;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import tools.jackson.databind.ObjectMapper;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;

/** A workspace's saved component style (one row per workspace, replaced on every save). */
@Repository
public class ComponentStyleStore {

    /** The style and who saved it when; savedAt is null for a workspace that has not saved one (the default style). */
    public record SavedStyle(Style style, String savedBy, OffsetDateTime savedAt) {
    }

    private final JdbcTemplate jdbc;
    private final ObjectMapper json;

    public ComponentStyleStore(JdbcTemplate jdbc, ObjectMapper json) {
        this.jdbc = jdbc;
        this.json = json;
    }

    public SavedStyle get(UUID workspaceId) {
        List<SavedStyle> rows = jdbc.query("SELECT style::text AS style, saved_by, saved_at FROM component_style WHERE workspace_id = ?",
                (rs, n) -> new SavedStyle(json.readValue(rs.getString("style"), Style.class), rs.getString("saved_by"),
                        rs.getTimestamp("saved_at").toInstant().atOffset(ZoneOffset.UTC)), workspaceId);
        return rows.isEmpty() ? new SavedStyle(ComponentPackService.defaultStyle(), null, null) : rows.getFirst();
    }

    public SavedStyle save(UUID workspaceId, Style style, String username) {
        Instant now = Instant.now();
        String body = json.writeValueAsString(style);
        jdbc.update("INSERT INTO component_style (workspace_id, style, saved_by, saved_at) VALUES (?, ?::jsonb, ?, ?) "
                + "ON CONFLICT (workspace_id) DO UPDATE SET style = EXCLUDED.style, saved_by = EXCLUDED.saved_by, saved_at = EXCLUDED.saved_at",
                workspaceId, body, username, Timestamp.from(now));
        return new SavedStyle(style, username, now.atOffset(ZoneOffset.UTC));
    }
}
