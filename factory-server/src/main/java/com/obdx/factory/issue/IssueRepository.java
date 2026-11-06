package com.obdx.factory.issue;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;
import tools.jackson.databind.ObjectMapper;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** Issues, their files and shared knowledge, in plain SQL (evidence and diagnosis are JSONB). */
@Repository
public class IssueRepository {

    public enum Status { NEW, ANALYZING, DIAGNOSED, FAILED, RESOLVED, NOT_RESOLVED, ESCALATED }

    public record Issue(UUID id, UUID workspaceId, String title, String description, String environment, String logText,
                        Status status, String message, Evidence evidence, Diagnosis diagnosis, String signature,
                        String resolution, String srDraft, String createdBy, OffsetDateTime createdAt, OffsetDateTime updatedAt) {
    }

    /** @param kind LOG or SCREENSHOT */
    public record IssueFile(int position, String name, String kind, String mimeType, String extractedText) {
    }

    public record Knowledge(UUID id, UUID sourceIssueId, UUID sourceWorkspaceId, String obdxVersion, String component,
                            String category, String signature, String title, String rootCause, String resolution,
                            String sharedBy, OffsetDateTime sharedAt) {
    }

    private static final String ISSUE_COLUMNS = "id, workspace_id, title, description, environment, log_text, status, message, "
            + "evidence, diagnosis, signature, resolution, sr_draft, created_by, created_at, updated_at";
    private static final String KNOWLEDGE_COLUMNS = "id, source_issue_id, source_workspace_id, obdx_version, component, category, "
            + "signature, title, root_cause, resolution, shared_by, shared_at";

    private final JdbcTemplate jdbc;
    private final ObjectMapper json;

    public IssueRepository(JdbcTemplate jdbc, ObjectMapper json) {
        this.jdbc = jdbc;
        this.json = json;
    }

    public void insert(UUID id, UUID workspaceId, String title, String description, String environment, String logText, String createdBy) {
        OffsetDateTime now = OffsetDateTime.now();
        jdbc.update("INSERT INTO issue (id, workspace_id, title, description, environment, log_text, status, created_by, created_at, updated_at) "
                        + "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                id, workspaceId, title, description, environment, logText, Status.NEW.name(), createdBy, now, now);
    }

    public void insertFile(UUID issueId, int position, String name, String kind, String mimeType, byte[] content) {
        jdbc.update("INSERT INTO issue_file (issue_id, position, name, kind, mime_type, content) VALUES (?, ?, ?, ?, ?, ?)",
                issueId, position, name, kind, mimeType, content);
    }

    public Optional<Issue> find(UUID id) {
        return jdbc.query("SELECT " + ISSUE_COLUMNS + " FROM issue WHERE id = ?", issueMapper(), id).stream().findFirst();
    }

    public List<Issue> list(UUID workspaceId) {
        return jdbc.query("SELECT " + ISSUE_COLUMNS + " FROM issue WHERE workspace_id = ? ORDER BY updated_at DESC", issueMapper(), workspaceId);
    }

    /** Resolved issues of a workspace that have a signature, newest first. */
    public List<Issue> resolved(UUID workspaceId, UUID except) {
        // shortcut: compares signatures in Java over the latest 300; move to a database text search if workspaces collect thousands
        return jdbc.query("SELECT " + ISSUE_COLUMNS + " FROM issue WHERE workspace_id = ? AND id <> ? AND status = 'RESOLVED' "
                + "AND signature <> '' ORDER BY updated_at DESC LIMIT 300", issueMapper(), workspaceId, except);
    }

    public void setStatus(UUID id, Status status, String message) {
        jdbc.update("UPDATE issue SET status = ?, message = ?, updated_at = ? WHERE id = ?", status.name(), message, OffsetDateTime.now(), id);
    }

    public void saveAnalysis(UUID id, Evidence evidence, Diagnosis diagnosis, Status status, String message) {
        jdbc.update("UPDATE issue SET evidence = ?::jsonb, diagnosis = ?::jsonb, signature = ?, status = ?, message = ?, updated_at = ? WHERE id = ?",
                json.writeValueAsString(evidence), diagnosis == null ? null : json.writeValueAsString(diagnosis), evidence.signature(),
                status.name(), message, OffsetDateTime.now(), id);
    }

    public void setOutcome(UUID id, Status status, String resolution) {
        jdbc.update("UPDATE issue SET status = ?, resolution = ?, message = NULL, updated_at = ? WHERE id = ?",
                status.name(), resolution, OffsetDateTime.now(), id);
    }

    public void setSrDraft(UUID id, String draft) {
        jdbc.update("UPDATE issue SET sr_draft = ?, updated_at = ? WHERE id = ?", draft, OffsetDateTime.now(), id);
    }

    public void delete(UUID id) {
        jdbc.update("DELETE FROM issue WHERE id = ?", id);
    }

    /** Analyzes that were running when the server stopped. */
    public int failAnalyzing(String message) {
        return jdbc.update("UPDATE issue SET status = 'FAILED', message = ?, updated_at = ? WHERE status = 'ANALYZING'", message, OffsetDateTime.now());
    }

    public List<IssueFile> files(UUID issueId) {
        return jdbc.query("SELECT position, name, kind, mime_type, extracted_text FROM issue_file WHERE issue_id = ? ORDER BY position",
                (rs, i) -> new IssueFile(rs.getInt(1), rs.getString(2), rs.getString(3), rs.getString(4), rs.getString(5)), issueId);
    }

    public Optional<byte[]> fileContent(UUID issueId, int position) {
        return jdbc.query("SELECT content FROM issue_file WHERE issue_id = ? AND position = ?", (rs, i) -> rs.getBytes(1), issueId, position)
                .stream().findFirst();
    }

    public boolean setExtractedText(UUID issueId, int position, String text) {
        return jdbc.update("UPDATE issue_file SET extracted_text = ? WHERE issue_id = ? AND position = ? AND kind = 'SCREENSHOT'",
                text, issueId, position) > 0;
    }

    public void insertKnowledge(Knowledge k) {
        jdbc.update("INSERT INTO issue_knowledge (" + KNOWLEDGE_COLUMNS + ") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                k.id(), k.sourceIssueId(), k.sourceWorkspaceId(), k.obdxVersion(), k.component(), k.category(), k.signature(),
                k.title(), k.rootCause(), k.resolution(), k.sharedBy(), k.sharedAt());
    }

    public List<Knowledge> knowledge() {
        // shortcut: all shared entries are loaded and compared in Java; fine for hundreds, add a text search index beyond that
        return jdbc.query("SELECT " + KNOWLEDGE_COLUMNS + " FROM issue_knowledge ORDER BY shared_at DESC LIMIT 1000", knowledgeMapper());
    }

    public Optional<Knowledge> findKnowledge(UUID id) {
        return jdbc.query("SELECT " + KNOWLEDGE_COLUMNS + " FROM issue_knowledge WHERE id = ?", knowledgeMapper(), id).stream().findFirst();
    }

    public Optional<Knowledge> knowledgeOf(UUID issueId) {
        return jdbc.query("SELECT " + KNOWLEDGE_COLUMNS + " FROM issue_knowledge WHERE source_issue_id = ?", knowledgeMapper(), issueId)
                .stream().findFirst();
    }

    public void deleteKnowledge(UUID id) {
        jdbc.update("DELETE FROM issue_knowledge WHERE id = ?", id);
    }

    private RowMapper<Issue> issueMapper() {
        return (rs, i) -> new Issue(rs.getObject(1, UUID.class), rs.getObject(2, UUID.class), rs.getString(3), rs.getString(4),
                rs.getString(5), rs.getString(6), Status.valueOf(rs.getString(7)), rs.getString(8),
                rs.getString(9) == null ? null : json.readValue(rs.getString(9), Evidence.class),
                rs.getString(10) == null ? null : json.readValue(rs.getString(10), Diagnosis.class),
                rs.getString(11), rs.getString(12), rs.getString(13), rs.getString(14),
                rs.getObject(15, OffsetDateTime.class), rs.getObject(16, OffsetDateTime.class));
    }

    private static RowMapper<Knowledge> knowledgeMapper() {
        return (rs, i) -> new Knowledge(rs.getObject(1, UUID.class), rs.getObject(2, UUID.class), rs.getObject(3, UUID.class),
                rs.getString(4), rs.getString(5), rs.getString(6), rs.getString(7), rs.getString(8), rs.getString(9),
                rs.getString(10), rs.getString(11), rs.getObject(12, OffsetDateTime.class));
    }
}
