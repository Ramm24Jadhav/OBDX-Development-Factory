package com.obdx.factory.design;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import tools.jackson.databind.ObjectMapper;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Versions and comments of screen designs.
 */
@Repository
public class DesignStore {

    /** How a version was made. */
    public enum Origin { GENERATED, EDITED, AI, BLANK, IMPORTED }

    public record VersionInfo(int version, Origin origin, String note, OffsetDateTime createdAt) {
    }

    public record Comment(UUID id, int version, String componentId, String author, boolean fromReview, String text,
                          OffsetDateTime createdAt) {
    }

    private final JdbcTemplate jdbc;
    private final ObjectMapper json;

    public DesignStore(JdbcTemplate jdbc, ObjectMapper json) {
        this.jdbc = jdbc;
        this.json = json;
    }

    public int addVersion(UUID designId, Origin origin, String note, ScreenModel model) {
        Integer last = jdbc.queryForObject("SELECT max(version) FROM screen_design_version WHERE design_id = ?", Integer.class, designId);
        int version = last == null ? 1 : last + 1;
        jdbc.update("INSERT INTO screen_design_version (design_id, version, origin, note, model, created_at) VALUES (?, ?, ?, ?, ?::jsonb, ?)",
                designId, version, origin.name(), note, json.writeValueAsString(model), Timestamp.from(Instant.now()));
        return version;
    }

    public Optional<ScreenModel> model(UUID designId, int version) {
        return jdbc.query("SELECT model FROM screen_design_version WHERE design_id = ? AND version = ?",
                (rs, row) -> json.readValue(rs.getString("model"), ScreenModel.class), designId, version).stream().findFirst();
    }

    public List<VersionInfo> versions(UUID designId) {
        return jdbc.query("SELECT version, origin, note, created_at FROM screen_design_version WHERE design_id = ? ORDER BY version DESC",
                (rs, row) -> new VersionInfo(rs.getInt("version"), Origin.valueOf(rs.getString("origin")), rs.getString("note"),
                        rs.getTimestamp("created_at").toInstant().atOffset(ZoneOffset.UTC)),
                designId);
    }

    public Comment addComment(UUID designId, int version, String componentId, String author, boolean fromReview, String text) {
        Comment comment = new Comment(UUID.randomUUID(), version, componentId, author, fromReview, text, OffsetDateTime.now(ZoneOffset.UTC));
        jdbc.update("INSERT INTO screen_design_comment (id, design_id, version, component_id, author, from_review, text, created_at) "
                        + "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                comment.id(), designId, version, componentId, author, fromReview, text, Timestamp.from(comment.createdAt().toInstant()));
        return comment;
    }

    public List<Comment> comments(UUID designId) {
        return jdbc.query("SELECT id, version, component_id, author, from_review, text, created_at FROM screen_design_comment "
                        + "WHERE design_id = ? ORDER BY created_at",
                (rs, row) -> new Comment(rs.getObject("id", UUID.class), rs.getInt("version"), rs.getString("component_id"),
                        rs.getString("author"), rs.getBoolean("from_review"), rs.getString("text"),
                        rs.getTimestamp("created_at").toInstant().atOffset(ZoneOffset.UTC)),
                designId);
    }
}
