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
    public enum Origin { GENERATED, EDITED, AI, BLANK, IMPORTED, RESTORED }

    public record VersionInfo(int version, Origin origin, String note, OffsetDateTime createdAt) {
    }

    /** COMMENT: feedback. APPROVAL: a reviewer's approval through a review link (a decision, not feedback). */
    public enum Kind { COMMENT, APPROVAL }

    /**
     * @param componentId the field, section or button the comment is about; null for the whole screen
     * @param resolvedBy  who on the team marked the comment resolved; null while it is open
     */
    public record Comment(UUID id, int version, String componentId, String author, boolean fromReview, String text,
                          OffsetDateTime createdAt, Kind kind, String resolvedBy, OffsetDateTime resolvedAt) {

        public Comment(UUID id, int version, String componentId, String author, boolean fromReview, String text,
                       OffsetDateTime createdAt) {
            this(id, version, componentId, author, fromReview, text, createdAt, Kind.COMMENT, null, null);
        }
    }

    private static final String COMMENT_COLUMNS = "id, version, component_id, author, from_review, text, created_at, kind, resolved_by, resolved_at";

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
        return addComment(designId, version, componentId, author, fromReview, text, Kind.COMMENT);
    }

    public Comment addComment(UUID designId, int version, String componentId, String author, boolean fromReview, String text, Kind kind) {
        Comment comment = new Comment(UUID.randomUUID(), version, componentId, author, fromReview, text, OffsetDateTime.now(ZoneOffset.UTC),
                kind, null, null);
        jdbc.update("INSERT INTO screen_design_comment (id, design_id, version, component_id, author, from_review, text, created_at, kind) "
                        + "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                comment.id(), designId, version, componentId, author, fromReview, text, Timestamp.from(comment.createdAt().toInstant()),
                kind.name());
        return comment;
    }

    public List<Comment> comments(UUID designId) {
        return jdbc.query("SELECT " + COMMENT_COLUMNS + " FROM screen_design_comment WHERE design_id = ? ORDER BY created_at",
                (rs, row) -> {
                    Timestamp resolvedAt = rs.getTimestamp("resolved_at");
                    return new Comment(rs.getObject("id", UUID.class), rs.getInt("version"), rs.getString("component_id"),
                            rs.getString("author"), rs.getBoolean("from_review"), rs.getString("text"),
                            rs.getTimestamp("created_at").toInstant().atOffset(ZoneOffset.UTC), Kind.valueOf(rs.getString("kind")),
                            rs.getString("resolved_by"), resolvedAt == null ? null : resolvedAt.toInstant().atOffset(ZoneOffset.UTC));
                },
                designId);
    }

    /**
     * Marks a comment of the design resolved (by: who did it) or open again (by null). Approvals cannot be resolved.
     * False when the design has no such comment.
     */
    public boolean setResolved(UUID designId, UUID commentId, String by) {
        return jdbc.update("UPDATE screen_design_comment SET resolved_by = ?, resolved_at = ? WHERE design_id = ? AND id = ? AND kind = 'COMMENT'",
                by, by == null ? null : Timestamp.from(Instant.now()), designId, commentId) == 1;
    }
}
