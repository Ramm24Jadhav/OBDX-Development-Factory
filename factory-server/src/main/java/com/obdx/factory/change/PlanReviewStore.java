package com.obdx.factory.change;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import tools.jackson.databind.ObjectMapper;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;

/**
 * The revisions of a change's plan and the reviewers' comments and decisions on them. A plan is never approved here:
 * approval stays on the change (ChangeService.approvePlan), which is what lets code generation start; this only keeps
 * the record of it.
 */
@Repository
public class PlanReviewStore {

    /** ANALYZED: made by the impact analysis. EDITED: changed by a person before approval. */
    public enum Origin { ANALYZED, EDITED }

    /** COMMENT: a remark. CHANGES_REQUESTED: the plan is not approved as it is, with the reason. APPROVED: the approval. */
    public enum Kind { COMMENT, CHANGES_REQUESTED, APPROVED }

    public record Revision(int revision, Origin origin, String createdBy, OffsetDateTime createdAt, ChangePlan plan) {
    }

    public record Comment(UUID id, Integer revision, Kind kind, String author, String text, OffsetDateTime createdAt) {
    }

    public record Review(List<Revision> revisions, List<Comment> comments) {
    }

    private final JdbcTemplate jdbc;
    private final ObjectMapper json;

    public PlanReviewStore(JdbcTemplate jdbc, ObjectMapper json) {
        this.jdbc = jdbc;
        this.json = json;
    }

    /** Keeps a plan as the next revision, unless it is the same as the latest one; returns the latest revision. */
    public int record(UUID changeId, String planJson, Origin origin, String by) {
        Integer latest = latest(changeId);
        if (latest != null) {
            Boolean same = jdbc.queryForObject("SELECT plan = ?::jsonb FROM change_plan_revision WHERE change_id = ? AND revision = ?",
                    Boolean.class, planJson, changeId, latest);
            if (Boolean.TRUE.equals(same)) {
                return latest;
            }
        }
        int next = latest == null ? 1 : latest + 1;
        jdbc.update("INSERT INTO change_plan_revision (change_id, revision, plan, origin, created_by, created_at) VALUES (?, ?, ?::jsonb, ?, ?, ?)",
                changeId, next, planJson, origin.name(), by, Timestamp.from(Instant.now()));
        return next;
    }

    /** The latest revision number, or null before the first plan. */
    public Integer latest(UUID changeId) {
        return jdbc.queryForObject("SELECT MAX(revision) FROM change_plan_revision WHERE change_id = ?", Integer.class, changeId);
    }

    /**
     * Whether a reviewer requested changes on this revision that no new analysis or saved edit has answered yet (the
     * plan then waits for one).
     */
    public boolean changesRequested(UUID changeId, int revision) {
        return Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS (SELECT 1 FROM change_plan_comment WHERE change_id = ? AND revision = ? "
                + "AND kind = ? AND answered_at IS NULL)", Boolean.class, changeId, revision, Kind.CHANGES_REQUESTED.name()));
    }

    /**
     * Marks the open requests for changes answered: the plan was analyzed again or an edit was saved, also when the plan
     * came out the same (and so kept its revision). Returns how many were open.
     */
    public int answerRequests(UUID changeId) {
        return jdbc.update("UPDATE change_plan_comment SET answered_at = ? WHERE change_id = ? AND kind = ? AND answered_at IS NULL",
                Timestamp.from(Instant.now()), changeId, Kind.CHANGES_REQUESTED.name());
    }

    public Comment comment(UUID changeId, Integer revision, Kind kind, String author, String text) {
        UUID id = UUID.randomUUID();
        Instant now = Instant.now();
        jdbc.update("INSERT INTO change_plan_comment (id, change_id, revision, kind, author, text, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                id, changeId, revision, kind.name(), author, text == null ? "" : text, Timestamp.from(now));
        return new Comment(id, revision, kind, author, text == null ? "" : text, now.atOffset(ZoneOffset.UTC));
    }

    /** The revisions (oldest first) and the comments (oldest first) of a change. */
    public Review review(UUID changeId) {
        List<Revision> revisions = jdbc.query(
                "SELECT revision, origin, created_by, created_at, plan::text AS plan FROM change_plan_revision WHERE change_id = ? ORDER BY revision",
                (rs, n) -> new Revision(rs.getInt("revision"), Origin.valueOf(rs.getString("origin")), rs.getString("created_by"),
                        rs.getTimestamp("created_at").toInstant().atOffset(ZoneOffset.UTC), json.readValue(rs.getString("plan"), ChangePlan.class)),
                changeId);
        List<Comment> comments = jdbc.query(
                "SELECT id, revision, kind, author, text, created_at FROM change_plan_comment WHERE change_id = ? ORDER BY seq",
                (rs, n) -> new Comment(rs.getObject("id", UUID.class), (Integer) rs.getObject("revision"), Kind.valueOf(rs.getString("kind")),
                        rs.getString("author"), rs.getString("text"), rs.getTimestamp("created_at").toInstant().atOffset(ZoneOffset.UTC)),
                changeId);
        return new Review(revisions, comments);
    }
}
