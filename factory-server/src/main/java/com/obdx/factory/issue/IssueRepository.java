package com.obdx.factory.issue;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;
import tools.jackson.databind.ObjectMapper;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** Issues, their files, checks, questions, links and shared knowledge, in plain SQL (evidence and diagnosis are JSONB). */
@Repository
public class IssueRepository {

    public enum Status { NEW, ANALYZING, DIAGNOSED, FAILED, RESOLVED, NOT_RESOLVED, ESCALATED }

    /**
     * @param source     FACTORY (a signed-in user) or BANK (through an issue link)
     * @param releasedAt when an engineer released the diagnosis to the bank; null while not released
     * @param groupId    the first issue of a group with the same error; null when alone
     */
    public record Issue(UUID id, UUID workspaceId, String title, String description, String environment, String logText,
                        Status status, String message, Evidence evidence, Diagnosis diagnosis, String signature,
                        String resolution, String srDraft, String createdBy, OffsetDateTime createdAt, OffsetDateTime updatedAt,
                        String source, String reporterEmail, OffsetDateTime releasedAt, UUID groupId) {
    }

    /**
     * @param kind        LOG or SCREENSHOT; checkId: the fix check it came with, null for the first report
     * @param hiddenAreas areas with customer data blacked out in a screenshot; null when not checked
     */
    public record IssueFile(int position, String name, String kind, String mimeType, String extractedText, UUID checkId,
                            Integer hiddenAreas) {
    }

    /** What happened to an issue, for the bell menu. */
    public record Event(UUID id, UUID issueId, String issueTitle, String kind, String text, boolean failed, OffsetDateTime createdAt) {
    }

    public record Knowledge(UUID id, UUID sourceIssueId, UUID sourceWorkspaceId, String obdxVersion, String component,
                            String category, String signature, String title, String rootCause, String resolution,
                            String sharedBy, OffsetDateTime sharedAt) {
    }

    /**
     * @param result CHECKING, ERROR_GONE, STILL_FAILING, DIFFERENT_ERROR, NOT_COMPARABLE, FAILED, BANK_WORKS (the bank
     *               said it works now), BANK_STILL_FAILING (said so without new files)
     */
    public record Check(UUID id, UUID issueId, String result, String summary, Evidence evidence, String createdBy, OffsetDateTime createdAt) {
    }

    /** @param status ANSWERING, ANSWERED, FAILED */
    public record Question(UUID id, UUID issueId, String question, String answer, String status, String model, String askedBy,
                           OffsetDateTime createdAt, OffsetDateTime answeredAt) {
    }

    public record Link(UUID id, UUID workspaceId, String label, OffsetDateTime expiresAt, OffsetDateTime revokedAt,
                       String createdBy, OffsetDateTime createdAt) {
    }

    private static final String ISSUE_COLUMNS = "id, workspace_id, title, description, environment, log_text, status, message, "
            + "evidence, diagnosis, signature, resolution, sr_draft, created_by, created_at, updated_at, source, reporter_email, "
            + "released_at, group_id";
    private static final String KNOWLEDGE_COLUMNS = "id, source_issue_id, source_workspace_id, obdx_version, component, category, "
            + "signature, title, root_cause, resolution, shared_by, shared_at";
    private static final String LINK_COLUMNS = "id, workspace_id, label, expires_at, revoked_at, created_by, created_at";

    private final JdbcTemplate jdbc;
    private final ObjectMapper json;

    public IssueRepository(JdbcTemplate jdbc, ObjectMapper json) {
        this.jdbc = jdbc;
        this.json = json;
    }

    public void insert(UUID id, UUID workspaceId, String title, String description, String environment, String logText, String createdBy,
                       String source, String reporterEmail) {
        OffsetDateTime now = OffsetDateTime.now();
        jdbc.update("INSERT INTO issue (id, workspace_id, title, description, environment, log_text, status, created_by, created_at, updated_at, "
                        + "source, reporter_email) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                id, workspaceId, title, description, environment, logText, Status.NEW.name(), createdBy, now, now, source, reporterEmail);
    }

    public void insertFile(UUID issueId, int position, String name, String kind, String mimeType, byte[] content, UUID checkId) {
        jdbc.update("INSERT INTO issue_file (issue_id, position, name, kind, mime_type, content, check_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
                issueId, position, name, kind, mimeType, content, checkId);
    }

    /** The next free file position of an issue (files of fix checks follow the first report's). */
    public int nextFilePosition(UUID issueId) {
        Integer max = jdbc.queryForObject("SELECT max(position) FROM issue_file WHERE issue_id = ?", Integer.class, issueId);
        return max == null ? 0 : max + 1;
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

    /** Other issues of a workspace with a signature, filed between from and to (for grouping repeated issues). */
    public List<Issue> filedBetween(UUID workspaceId, UUID except, OffsetDateTime from, OffsetDateTime to) {
        return jdbc.query("SELECT " + ISSUE_COLUMNS + " FROM issue WHERE workspace_id = ? AND id <> ? AND signature <> '' "
                + "AND created_at BETWEEN ? AND ? ORDER BY created_at LIMIT 500", issueMapper(), workspaceId, except, from, to);
    }

    public List<Issue> group(UUID groupId) {
        return jdbc.query("SELECT " + ISSUE_COLUMNS + " FROM issue WHERE group_id = ? ORDER BY created_at", issueMapper(), groupId);
    }

    public void setGroup(UUID id, UUID groupId) {
        jdbc.update("UPDATE issue SET group_id = ? WHERE id = ?", groupId, id);
    }

    public void setStatus(UUID id, Status status, String message) {
        jdbc.update("UPDATE issue SET status = ?, message = ?, updated_at = ? WHERE id = ?", status.name(), message, OffsetDateTime.now(), id);
    }

    /** Starts an analysis: a diagnosis released to the bank must be released again once it changes. */
    public void startAnalysis(UUID id, String message) {
        jdbc.update("UPDATE issue SET status = 'ANALYZING', message = ?, released_at = NULL, updated_at = ? WHERE id = ?",
                message, OffsetDateTime.now(), id);
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

    public void setReleased(UUID id, OffsetDateTime when, String by) {
        jdbc.update("UPDATE issue SET released_at = ?, released_by = ?, updated_at = ? WHERE id = ?", when, by, OffsetDateTime.now(), id);
    }

    /** Replaces a screenshot with its copy with customer data blacked out (the original is not kept). */
    public void replaceScreenshot(UUID issueId, int position, byte[] content, int hiddenAreas) {
        jdbc.update("UPDATE issue_file SET content = ?, hidden_areas = ? WHERE issue_id = ? AND position = ? AND kind = 'SCREENSHOT'",
                content, hiddenAreas, issueId, position);
    }

    public boolean deleteFile(UUID issueId, int position) {
        return jdbc.update("DELETE FROM issue_file WHERE issue_id = ? AND position = ?", issueId, position) > 0;
    }

    // --- events (bell menu) ---

    public void addEvent(UUID workspaceId, UUID issueId, String kind, String text, boolean failed) {
        jdbc.update("INSERT INTO issue_event (id, workspace_id, issue_id, kind, text, failed, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                UUID.randomUUID(), workspaceId, issueId, kind, text.length() > 500 ? text.substring(0, 497) + "..." : text, failed, OffsetDateTime.now());
    }

    /**
     * A workspace's events since a moment, newest first: all of them, or only those of issues the user filed or
     * released.
     */
    public List<Event> events(UUID workspaceId, OffsetDateTime since, String username, boolean all) {
        return jdbc.query("SELECT e.id, e.issue_id, i.title, e.kind, e.text, e.failed, e.created_at FROM issue_event e JOIN issue i ON i.id = e.issue_id "
                        + "WHERE e.workspace_id = ? AND e.created_at > ? AND (? OR i.created_by = ? OR i.released_by = ?) "
                        + "ORDER BY e.created_at DESC LIMIT 200",
                (rs, i) -> new Event(rs.getObject(1, UUID.class), rs.getObject(2, UUID.class), rs.getString(3), rs.getString(4), rs.getString(5),
                        rs.getBoolean(6), rs.getObject(7, OffsetDateTime.class)),
                workspaceId, since, all, username, username);
    }

    public void touch(UUID id) {
        jdbc.update("UPDATE issue SET updated_at = ? WHERE id = ?", OffsetDateTime.now(), id);
    }

    public void setSrDraft(UUID id, String draft) {
        jdbc.update("UPDATE issue SET sr_draft = ?, updated_at = ? WHERE id = ?", draft, OffsetDateTime.now(), id);
    }

    public void delete(UUID id) {
        jdbc.update("DELETE FROM issue WHERE id = ?", id);
    }

    /** Analyses, checks and answers that were running when the server stopped. */
    public int failRunning(String message) {
        OffsetDateTime now = OffsetDateTime.now();
        return jdbc.update("UPDATE issue SET status = 'FAILED', message = ?, updated_at = ? WHERE status = 'ANALYZING'", message, now)
                + jdbc.update("UPDATE issue_check SET result = 'FAILED', summary = ? WHERE result = 'CHECKING'", message.replace("Analyze", "Check"))
                + jdbc.update("UPDATE issue_question SET status = 'FAILED', answer = ? WHERE status = 'ANSWERING'", message.replace("Analyze again", "Ask again"));
    }

    /** The files of the first report. */
    public List<IssueFile> files(UUID issueId) {
        return jdbc.query("SELECT position, name, kind, mime_type, extracted_text, check_id, hidden_areas FROM issue_file WHERE issue_id = ? AND check_id IS NULL "
                + "ORDER BY position", fileMapper(), issueId);
    }

    /** Every file of an issue, the first report's and the fix checks'. */
    public List<IssueFile> allFiles(UUID issueId) {
        return jdbc.query("SELECT position, name, kind, mime_type, extracted_text, check_id, hidden_areas FROM issue_file WHERE issue_id = ? ORDER BY position",
                fileMapper(), issueId);
    }

    public Optional<byte[]> fileContent(UUID issueId, int position) {
        return jdbc.query("SELECT content FROM issue_file WHERE issue_id = ? AND position = ?", (rs, i) -> rs.getBytes(1), issueId, position)
                .stream().findFirst();
    }

    public boolean setExtractedText(UUID issueId, int position, String text) {
        return jdbc.update("UPDATE issue_file SET extracted_text = ? WHERE issue_id = ? AND position = ? AND kind = 'SCREENSHOT'",
                text, issueId, position) > 0;
    }

    // --- fix checks ---

    public void insertCheck(UUID id, UUID issueId, String result, String summary, Evidence evidence, String createdBy) {
        jdbc.update("INSERT INTO issue_check (id, issue_id, result, summary, evidence, created_by, created_at) VALUES (?, ?, ?, ?, ?::jsonb, ?, ?)",
                id, issueId, result, summary, json.writeValueAsString(evidence), createdBy, OffsetDateTime.now());
    }

    public void updateCheck(UUID id, String result, String summary, Evidence evidence) {
        jdbc.update("UPDATE issue_check SET result = ?, summary = ?, evidence = ?::jsonb WHERE id = ?",
                result, summary, json.writeValueAsString(evidence), id);
    }

    public List<Check> checks(UUID issueId) {
        return jdbc.query("SELECT id, issue_id, result, summary, evidence, created_by, created_at FROM issue_check WHERE issue_id = ? ORDER BY created_at",
                (rs, i) -> new Check(rs.getObject(1, UUID.class), rs.getObject(2, UUID.class), rs.getString(3), rs.getString(4),
                        json.readValue(rs.getString(5), Evidence.class), rs.getString(6), rs.getObject(7, OffsetDateTime.class)), issueId);
    }

    public List<IssueFile> checkFiles(UUID checkId) {
        return jdbc.query("SELECT position, name, kind, mime_type, extracted_text, check_id, hidden_areas FROM issue_file WHERE check_id = ? ORDER BY position",
                fileMapper(), checkId);
    }

    // --- questions ---

    public void insertQuestion(UUID id, UUID issueId, String question, String askedBy) {
        jdbc.update("INSERT INTO issue_question (id, issue_id, question, status, asked_by, created_at) VALUES (?, ?, ?, 'ANSWERING', ?, ?)",
                id, issueId, question, askedBy, OffsetDateTime.now());
    }

    public void setAnswer(UUID id, String status, String answer, String model) {
        jdbc.update("UPDATE issue_question SET status = ?, answer = ?, model = ?, answered_at = ? WHERE id = ?",
                status, answer, model, OffsetDateTime.now(), id);
    }

    public List<Question> questions(UUID issueId) {
        return jdbc.query("SELECT id, issue_id, question, answer, status, model, asked_by, created_at, answered_at FROM issue_question "
                        + "WHERE issue_id = ? ORDER BY created_at",
                (rs, i) -> new Question(rs.getObject(1, UUID.class), rs.getObject(2, UUID.class), rs.getString(3), rs.getString(4),
                        rs.getString(5), rs.getString(6), rs.getString(7), rs.getObject(8, OffsetDateTime.class),
                        rs.getObject(9, OffsetDateTime.class)), issueId);
    }

    // --- issue links and follow links ---

    public void insertLink(UUID id, UUID workspaceId, String label, String tokenHash, OffsetDateTime expiresAt, String createdBy) {
        jdbc.update("INSERT INTO issue_link (id, workspace_id, label, token_hash, expires_at, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                id, workspaceId, label, tokenHash, expiresAt, createdBy, OffsetDateTime.now());
    }

    public List<Link> links(UUID workspaceId) {
        return jdbc.query("SELECT " + LINK_COLUMNS + " FROM issue_link WHERE workspace_id = ? ORDER BY created_at DESC", linkMapper(), workspaceId);
    }

    public Optional<Link> findLink(UUID id) {
        return jdbc.query("SELECT " + LINK_COLUMNS + " FROM issue_link WHERE id = ?", linkMapper(), id).stream().findFirst();
    }

    public Optional<Link> findLinkByHash(String tokenHash) {
        return jdbc.query("SELECT " + LINK_COLUMNS + " FROM issue_link WHERE token_hash = ?", linkMapper(), tokenHash).stream().findFirst();
    }

    public void revokeLink(UUID id) {
        jdbc.update("UPDATE issue_link SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL", OffsetDateTime.now(), id);
    }

    /** Reports filed through a link since a moment. */
    public int reportsSince(UUID linkId, OffsetDateTime since) {
        Integer n = jdbc.queryForObject("SELECT count(*) FROM issue_follow WHERE link_id = ? AND created_at > ?", Integer.class, linkId, since);
        return n == null ? 0 : n;
    }

    public void insertFollow(UUID issueId, UUID linkId, String tokenHash) {
        jdbc.update("INSERT INTO issue_follow (issue_id, link_id, token_hash, created_at) VALUES (?, ?, ?, ?)",
                issueId, linkId, tokenHash, OffsetDateTime.now());
    }

    public Optional<UUID> issueByFollowHash(String tokenHash) {
        return jdbc.query("SELECT issue_id FROM issue_follow WHERE token_hash = ?", (rs, i) -> rs.getObject(1, UUID.class), tokenHash)
                .stream().findFirst();
    }

    // --- shared knowledge ---

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
                rs.getObject(15, OffsetDateTime.class), rs.getObject(16, OffsetDateTime.class), rs.getString(17), rs.getString(18),
                rs.getObject(19, OffsetDateTime.class), rs.getObject(20, UUID.class));
    }

    private static RowMapper<IssueFile> fileMapper() {
        return (rs, i) -> new IssueFile(rs.getInt(1), rs.getString(2), rs.getString(3), rs.getString(4), rs.getString(5), rs.getObject(6, UUID.class),
                rs.getObject(7, Integer.class));
    }

    private static RowMapper<Link> linkMapper() {
        return (rs, i) -> new Link(rs.getObject(1, UUID.class), rs.getObject(2, UUID.class), rs.getString(3), rs.getObject(4, OffsetDateTime.class),
                rs.getObject(5, OffsetDateTime.class), rs.getString(6), rs.getObject(7, OffsetDateTime.class));
    }

    private static RowMapper<Knowledge> knowledgeMapper() {
        return (rs, i) -> new Knowledge(rs.getObject(1, UUID.class), rs.getObject(2, UUID.class), rs.getObject(3, UUID.class),
                rs.getString(4), rs.getString(5), rs.getString(6), rs.getString(7), rs.getString(8), rs.getString(9),
                rs.getString(10), rs.getString(11), rs.getObject(12, OffsetDateTime.class));
    }
}
