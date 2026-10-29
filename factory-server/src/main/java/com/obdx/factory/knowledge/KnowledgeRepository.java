package com.obdx.factory.knowledge;

import com.obdx.factory.indexing.CodeIndexRepository;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Storage for the knowledge base: documents, their sections, notes and answer feedback. Plain SQL because of the
 * PostgreSQL-specific columns (tsvector, vector), as the code index.
 */
@Repository
public class KnowledgeRepository {

    private final JdbcTemplate jdbc;

    public KnowledgeRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public record Document(UUID id, UUID workspaceId, String obdxVersion, String versionLine, String title, String fileName,
                           String sha256, int pages, int sections, int embedded, String status, String message,
                           String importedBy, Instant createdAt, Instant updatedAt) {
    }

    public record Note(UUID id, UUID workspaceId, String versionLine, String topic, String title, String body, String status,
                       String origin, String sources, String createdBy, String reviewedBy, Instant reviewedAt,
                       Instant createdAt, Instant updatedAt) {
    }

    public record PendingEmbedding(UUID id, String text) {
    }

    // --- documents ---

    private static final String DOCUMENT_COLUMNS = "id, workspace_id, obdx_version, version_line, title, file_name, sha256, pages, "
            + "sections, embedded, status, message, imported_by, created_at, updated_at";

    private static final RowMapper<Document> DOCUMENT = (rs, row) -> new Document(rs.getObject("id", UUID.class),
            rs.getObject("workspace_id", UUID.class), rs.getString("obdx_version"), rs.getString("version_line"),
            rs.getString("title"), rs.getString("file_name"), rs.getString("sha256"), rs.getInt("pages"), rs.getInt("sections"),
            rs.getInt("embedded"), rs.getString("status"), rs.getString("message"), rs.getString("imported_by"),
            instant(rs.getTimestamp("created_at")), instant(rs.getTimestamp("updated_at")));

    public void insertDocument(Document d) {
        jdbc.update("INSERT INTO knowledge_document (" + DOCUMENT_COLUMNS + ") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, now(), now())",
                d.id(), d.workspaceId(), d.obdxVersion(), d.versionLine(), d.title(), d.fileName(), d.sha256(), d.pages(),
                d.sections(), d.embedded(), d.status(), d.message(), d.importedBy());
    }

    public Optional<Document> findDocument(UUID id) {
        return jdbc.query("SELECT " + DOCUMENT_COLUMNS + " FROM knowledge_document WHERE id = ?", DOCUMENT, id).stream().findFirst();
    }

    public Optional<Document> findDocument(String obdxVersion, String sha256, UUID workspaceId) {
        return jdbc.query("SELECT " + DOCUMENT_COLUMNS + " FROM knowledge_document WHERE obdx_version = ? AND sha256 = ? "
                + "AND workspace_id IS NOT DISTINCT FROM ?", DOCUMENT, obdxVersion, sha256, workspaceId).stream().findFirst();
    }

    /** Every Oracle manual, and the documents of the given workspaces (the bank's own). */
    public List<Document> documents(List<UUID> workspaceIds) {
        return jdbc.query("SELECT " + DOCUMENT_COLUMNS + " FROM knowledge_document WHERE workspace_id IS NULL OR workspace_id = ANY (?) "
                + "ORDER BY version_line DESC, obdx_version DESC, title", DOCUMENT, (Object) workspaceIds.toArray(new UUID[0]));
    }

    public void updateDocument(UUID id, String status, String message, Integer pages, Integer sections, Integer embedded) {
        jdbc.update("UPDATE knowledge_document SET status = ?, message = ?, pages = COALESCE(?, pages), sections = COALESCE(?, sections), "
                + "embedded = COALESCE(?, embedded), updated_at = now() WHERE id = ?", status, message, pages, sections, embedded, id);
    }

    public void deleteDocument(UUID id) {
        jdbc.update("DELETE FROM knowledge_document WHERE id = ?", id);
    }

    /** Documents not finished when the factory stopped (queued, being read or being embedded). */
    public List<UUID> unfinished() {
        return jdbc.query("SELECT id FROM knowledge_document WHERE status IN ('QUEUED', 'READING', 'EMBEDDING') ORDER BY created_at",
                (rs, row) -> rs.getObject(1, UUID.class));
    }

    // --- sections ---

    public void replaceSections(UUID documentId, UUID workspaceId, String versionLine, List<ManualSplitter.Section> sections) {
        jdbc.update("DELETE FROM knowledge_chunk WHERE document_id = ?", documentId);
        int[] position = {0};
        jdbc.batchUpdate("INSERT INTO knowledge_chunk (id, document_id, workspace_id, version_line, heading, page_from, page_to, position, content) "
                        + "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                sections.stream().map(s -> new Object[]{UUID.randomUUID(), documentId, workspaceId, versionLine,
                        s.heading() == null ? null : truncate(s.heading(), 500), s.pageFrom(), s.pageTo(), position[0]++, s.content()}).toList());
    }

    public List<PendingEmbedding> sectionsWithoutEmbedding(UUID documentId, int limit) {
        return jdbc.query("SELECT c.id, d.title, c.heading, c.content FROM knowledge_chunk c JOIN knowledge_document d ON d.id = c.document_id "
                        + "WHERE c.document_id = ? AND c.embedding IS NULL ORDER BY c.position LIMIT ?",
                (rs, row) -> new PendingEmbedding(rs.getObject("id", UUID.class),
                        embeddingText(rs.getString("title"), rs.getString("heading"), rs.getString("content"))),
                documentId, limit);
    }

    public void saveSectionEmbedding(UUID id, float[] vector) {
        jdbc.update("UPDATE knowledge_chunk SET embedding = ?::vector WHERE id = ?", CodeIndexRepository.toVectorLiteral(vector), id);
    }

    public int embeddedSections(UUID documentId) {
        Integer n = jdbc.queryForObject("SELECT count(*) FROM knowledge_chunk WHERE document_id = ? AND embedding IS NOT NULL", Integer.class, documentId);
        return n == null ? 0 : n;
    }

    // --- notes ---

    private static final String NOTE_COLUMNS = "id, workspace_id, version_line, topic, title, body, status, origin, sources, created_by, "
            + "reviewed_by, reviewed_at, created_at, updated_at";

    private static final RowMapper<Note> NOTE = (rs, row) -> new Note(rs.getObject("id", UUID.class), rs.getObject("workspace_id", UUID.class),
            rs.getString("version_line"), rs.getString("topic"), rs.getString("title"), rs.getString("body"), rs.getString("status"),
            rs.getString("origin"), rs.getString("sources"), rs.getString("created_by"), rs.getString("reviewed_by"),
            instant(rs.getTimestamp("reviewed_at")), instant(rs.getTimestamp("created_at")), instant(rs.getTimestamp("updated_at")));

    public void insertNote(Note n) {
        jdbc.update("INSERT INTO knowledge_note (" + NOTE_COLUMNS + ") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, now(), now())",
                n.id(), n.workspaceId(), n.versionLine(), n.topic(), n.title(), n.body(), n.status(), n.origin(), n.sources(),
                n.createdBy(), n.reviewedBy(), n.reviewedAt() == null ? null : Timestamp.from(n.reviewedAt()));
    }

    public Optional<Note> findNote(UUID id) {
        return jdbc.query("SELECT " + NOTE_COLUMNS + " FROM knowledge_note WHERE id = ?", NOTE, id).stream().findFirst();
    }

    /** Notes for every workspace and the given ones; status null: all of them. */
    public List<Note> notes(List<UUID> workspaceIds, String status) {
        return jdbc.query("SELECT " + NOTE_COLUMNS + " FROM knowledge_note WHERE (workspace_id IS NULL OR workspace_id = ANY (?)) "
                        + "AND (?::text IS NULL OR status = ?) ORDER BY CASE status WHEN 'SUGGESTED' THEN 0 WHEN 'TRUSTED' THEN 1 ELSE 2 END, updated_at DESC",
                NOTE, workspaceIds.toArray(new UUID[0]), status, status);
    }

    public void updateNote(UUID id, String topic, String title, String body, String versionLine) {
        jdbc.update("UPDATE knowledge_note SET topic = ?, title = ?, body = ?, version_line = ?, embedding = NULL, updated_at = now() WHERE id = ?",
                topic, title, body, versionLine, id);
    }

    public void reviewNote(UUID id, String status, String reviewer) {
        jdbc.update("UPDATE knowledge_note SET status = ?, reviewed_by = ?, reviewed_at = now(), updated_at = now() WHERE id = ?", status, reviewer, id);
    }

    public void deleteNote(UUID id) {
        jdbc.update("DELETE FROM knowledge_note WHERE id = ?", id);
    }

    public List<PendingEmbedding> notesWithoutEmbedding(int limit) {
        return jdbc.query("SELECT id, topic, title, body FROM knowledge_note WHERE embedding IS NULL AND status <> 'REJECTED' LIMIT ?",
                (rs, row) -> new PendingEmbedding(rs.getObject("id", UUID.class),
                        embeddingText(rs.getString("topic"), rs.getString("title"), rs.getString("body"))), limit);
    }

    public void saveNoteEmbedding(UUID id, float[] vector) {
        jdbc.update("UPDATE knowledge_note SET embedding = ?::vector WHERE id = ?", CodeIndexRepository.toVectorLiteral(vector), id);
    }

    // --- feedback ---

    public void insertFeedback(UUID workspaceId, String question, String answer, boolean helpful, String comment, String sources, String user) {
        jdbc.update("INSERT INTO knowledge_feedback (id, workspace_id, question, answer, helpful, comment, sources, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                UUID.randomUUID(), workspaceId, question, answer, helpful, comment, sources, user);
    }

    public record Stats(long documents, long ready, long sections, long embedded, long trustedNotes, long suggestedNotes,
                        long helpful, long notHelpful) {
    }

    public Stats stats(List<UUID> workspaceIds) {
        Object ids = workspaceIds.toArray(new UUID[0]);
        String scope = "(workspace_id IS NULL OR workspace_id = ANY (?))";
        return new Stats(
                count("SELECT count(*) FROM knowledge_document WHERE " + scope, ids),
                count("SELECT count(*) FROM knowledge_document WHERE status = 'READY' AND " + scope, ids),
                count("SELECT count(*) FROM knowledge_chunk WHERE " + scope, ids),
                count("SELECT count(*) FROM knowledge_chunk WHERE embedding IS NOT NULL AND " + scope, ids),
                count("SELECT count(*) FROM knowledge_note WHERE status = 'TRUSTED' AND " + scope, ids),
                count("SELECT count(*) FROM knowledge_note WHERE status = 'SUGGESTED' AND " + scope, ids),
                count("SELECT count(*) FROM knowledge_feedback WHERE helpful AND " + scope, ids),
                count("SELECT count(*) FROM knowledge_feedback WHERE NOT helpful AND " + scope, ids));
    }

    private long count(String sql, Object ids) {
        Long n = jdbc.queryForObject(sql, Long.class, ids);
        return n == null ? 0 : n;
    }

    /** What the embedding model reads for a section or note: where it comes from, then the text, capped in length. */
    static String embeddingText(String source, String heading, String content) {
        String text = (source == null ? "" : source + "\n") + (heading == null ? "" : heading + "\n") + "\n" + content;
        return text.length() > 4000 ? text.substring(0, 4000) : text;
    }

    private static String truncate(String value, int max) {
        return value.length() <= max ? value : value.substring(0, max);
    }

    private static Instant instant(Timestamp t) {
        return t == null ? null : t.toInstant();
    }
}
