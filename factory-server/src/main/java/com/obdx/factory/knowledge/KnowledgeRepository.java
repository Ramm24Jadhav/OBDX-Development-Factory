package com.obdx.factory.knowledge;

import com.obdx.factory.indexing.CodeIndexRepository;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
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

    /**
     * status: QUEUED, READING, EMBEDDING, READY, FAILED, or SUPERSEDED (a newer revision replaced it: kept as history,
     * without sections). patchset: the patchset or patch the document is for; null: the release itself.
     */
    public record Document(UUID id, UUID workspaceId, String obdxVersion, String versionLine, String title, String fileName,
                           String sha256, int pages, int sections, int embedded, String status, String message,
                           String importedBy, Instant createdAt, Instant updatedAt, String patchset, UUID supersededBy,
                           Instant supersededAt, UUID sourceId) {
    }

    public record Note(UUID id, UUID workspaceId, String versionLine, String topic, String title, String body, String status,
                       String origin, String sources, String createdBy, String reviewedBy, Instant reviewedAt,
                       Instant createdAt, Instant updatedAt, String needsReview) {
    }

    /** A folder whose documents are imported again when they change. */
    public record Source(UUID id, UUID workspaceId, String folder, String obdxVersion, String patchset, Instant lastScanAt,
                         String lastResult, String createdBy, Instant createdAt) {
    }

    public record PendingEmbedding(UUID id, String text) {
    }

    // --- documents ---

    private static final String DOCUMENT_COLUMNS = "id, workspace_id, obdx_version, version_line, title, file_name, sha256, pages, "
            + "sections, embedded, status, message, imported_by, created_at, updated_at, patchset, superseded_by, superseded_at, source_id";

    private static final RowMapper<Document> DOCUMENT = (rs, row) -> new Document(rs.getObject("id", UUID.class),
            rs.getObject("workspace_id", UUID.class), rs.getString("obdx_version"), rs.getString("version_line"),
            rs.getString("title"), rs.getString("file_name"), rs.getString("sha256"), rs.getInt("pages"), rs.getInt("sections"),
            rs.getInt("embedded"), rs.getString("status"), rs.getString("message"), rs.getString("imported_by"),
            instant(rs.getTimestamp("created_at")), instant(rs.getTimestamp("updated_at")),
            rs.getString("patchset"), rs.getObject("superseded_by", UUID.class), instant(rs.getTimestamp("superseded_at")),
            rs.getObject("source_id", UUID.class));

    public void insertDocument(Document d) {
        jdbc.update("INSERT INTO knowledge_document (" + DOCUMENT_COLUMNS + ") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, now(), now(), ?, NULL, NULL, ?)",
                d.id(), d.workspaceId(), d.obdxVersion(), d.versionLine(), d.title(), d.fileName(), d.sha256(), d.pages(),
                d.sections(), d.embedded(), d.status(), d.message(), d.importedBy(), d.patchset(), d.sourceId());
    }

    /**
     * The current documents a newer import replaces: the same file name (any case) for the same OBDX version and
     * owner, not failed, not yet superseded, imported before it.
     */
    public List<Document> earlierRevisions(Document newer) {
        return jdbc.query("SELECT " + DOCUMENT_COLUMNS + " FROM knowledge_document WHERE obdx_version = ? AND workspace_id IS NOT DISTINCT FROM ? "
                        + "AND lower(file_name) = lower(?) AND id <> ? AND superseded_by IS NULL AND status <> 'FAILED' AND created_at <= ?",
                DOCUMENT, newer.obdxVersion(), newer.workspaceId(), newer.fileName(), newer.id(), Timestamp.from(newer.createdAt()));
    }

    /** The older revision is kept as history; its sections go, so only the newer one is searched. */
    public void supersede(UUID olderId, UUID newerId) {
        jdbc.update("DELETE FROM knowledge_chunk WHERE document_id = ?", olderId);
        jdbc.update("UPDATE knowledge_document SET status = 'SUPERSEDED', superseded_by = ?, superseded_at = now(), embedded = 0, "
                + "message = NULL, updated_at = now() WHERE id = ?", newerId, olderId);
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
                + "ORDER BY version_line DESC, obdx_version DESC, title, (superseded_by IS NOT NULL), created_at DESC", DOCUMENT, (Object) workspaceIds.toArray(new UUID[0]));
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

    /** Current documents, ready or failed, read by an earlier version of the reading. */
    public List<UUID> readBefore(int readerVersion) {
        return jdbc.query("SELECT id FROM knowledge_document WHERE reader_version < ? AND status IN ('READY', 'FAILED') "
                + "AND superseded_by IS NULL ORDER BY created_at", (rs, row) -> rs.getObject(1, UUID.class), readerVersion);
    }

    public void readWith(UUID id, int readerVersion) {
        jdbc.update("UPDATE knowledge_document SET reader_version = ? WHERE id = ?", readerVersion, id);
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

    /** Each heading's text in reading order (the parts of a long section joined), to see what a revision changed. */
    public Map<String, String> sectionTexts(UUID documentId) {
        Map<String, StringBuilder> texts = new LinkedHashMap<>();
        jdbc.query("SELECT heading, content FROM knowledge_chunk WHERE document_id = ? ORDER BY position", rs -> {
            texts.computeIfAbsent(baseHeading(rs.getString("heading")), k -> new StringBuilder()).append(rs.getString("content")).append(' ');
        }, documentId);
        Map<String, String> out = new LinkedHashMap<>();
        texts.forEach((k, v) -> out.put(k, v.toString()));
        return out;
    }

    /** The first page of each heading, to move a note's citation to its page in a newer revision. */
    public Map<String, Integer> sectionPages(UUID documentId) {
        Map<String, Integer> pages = new HashMap<>();
        jdbc.query("SELECT heading, page_from FROM knowledge_chunk WHERE document_id = ? ORDER BY position",
                rs -> { pages.putIfAbsent(baseHeading(rs.getString("heading")), rs.getInt("page_from")); }, documentId);
        return pages;
    }

    /** A long section is stored in parts headed "... (continued)": they are one section. */
    static String baseHeading(String heading) {
        return heading == null ? "" : heading.replaceAll("(\\s*\\(continued\\))+$", "").strip();
    }

    public int embeddedSections(UUID documentId) {
        Integer n = jdbc.queryForObject("SELECT count(*) FROM knowledge_chunk WHERE document_id = ? AND embedding IS NOT NULL", Integer.class, documentId);
        return n == null ? 0 : n;
    }

    // --- notes ---

    private static final String NOTE_COLUMNS = "id, workspace_id, version_line, topic, title, body, status, origin, sources, created_by, "
            + "reviewed_by, reviewed_at, created_at, updated_at, needs_review";

    private static final RowMapper<Note> NOTE = (rs, row) -> new Note(rs.getObject("id", UUID.class), rs.getObject("workspace_id", UUID.class),
            rs.getString("version_line"), rs.getString("topic"), rs.getString("title"), rs.getString("body"), rs.getString("status"),
            rs.getString("origin"), rs.getString("sources"), rs.getString("created_by"), rs.getString("reviewed_by"),
            instant(rs.getTimestamp("reviewed_at")), instant(rs.getTimestamp("created_at")), instant(rs.getTimestamp("updated_at")),
            rs.getString("needs_review"));

    public void insertNote(Note n) {
        jdbc.update("INSERT INTO knowledge_note (" + NOTE_COLUMNS + ") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, now(), now(), ?)",
                n.id(), n.workspaceId(), n.versionLine(), n.topic(), n.title(), n.body(), n.status(), n.origin(), n.sources(),
                n.createdBy(), n.reviewedBy(), n.reviewedAt() == null ? null : Timestamp.from(n.reviewedAt()), n.needsReview());
    }

    /** Notes whose sources cite the document. */
    public List<Note> notesCiting(UUID documentId) {
        return jdbc.query("SELECT " + NOTE_COLUMNS + " FROM knowledge_note WHERE sources LIKE ?", NOTE, "%" + documentId + "%");
    }

    /**
     * The note's citations moved to a newer revision. With a reason, what it cites changed: it must be checked again,
     * and an approved note goes back to suggested, so code generation does not follow it until someone approves it.
     */
    public void reviseNoteSources(UUID id, String sources, String reason) {
        if (reason == null) {
            jdbc.update("UPDATE knowledge_note SET sources = ?, updated_at = now() WHERE id = ?", sources, id);
        } else {
            jdbc.update("UPDATE knowledge_note SET sources = ?, needs_review = ?, status = CASE status WHEN 'TRUSTED' THEN 'SUGGESTED' ELSE status END, "
                    + "updated_at = now() WHERE id = ?", sources, reason, id);
        }
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
        jdbc.update("UPDATE knowledge_note SET status = ?, reviewed_by = ?, reviewed_at = now(), needs_review = NULL, updated_at = now() WHERE id = ?",
                status, reviewer, id);
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

    // --- watched folders ---

    private static final String SOURCE_COLUMNS = "id, workspace_id, folder, obdx_version, patchset, last_scan_at, last_result, created_by, created_at";

    private static final RowMapper<Source> SOURCE = (rs, row) -> new Source(rs.getObject("id", UUID.class), rs.getObject("workspace_id", UUID.class),
            rs.getString("folder"), rs.getString("obdx_version"), rs.getString("patchset"), instant(rs.getTimestamp("last_scan_at")),
            rs.getString("last_result"), rs.getString("created_by"), instant(rs.getTimestamp("created_at")));

    /** The folder for this version and owner, added the first time it is imported. */
    public Source saveSource(String folder, String obdxVersion, UUID workspaceId, String patchset, String user) {
        jdbc.update("INSERT INTO knowledge_source (id, workspace_id, folder, obdx_version, patchset, created_by) VALUES (?, ?, ?, ?, ?, ?) "
                        + "ON CONFLICT (folder, obdx_version, COALESCE(workspace_id, '00000000-0000-0000-0000-000000000000')) DO UPDATE SET patchset = EXCLUDED.patchset",
                UUID.randomUUID(), workspaceId, folder, obdxVersion, patchset, user);
        return jdbc.query("SELECT " + SOURCE_COLUMNS + " FROM knowledge_source WHERE folder = ? AND obdx_version = ? AND workspace_id IS NOT DISTINCT FROM ?",
                SOURCE, folder, obdxVersion, workspaceId).getFirst();
    }

    public Optional<Source> findSource(UUID id) {
        return jdbc.query("SELECT " + SOURCE_COLUMNS + " FROM knowledge_source WHERE id = ?", SOURCE, id).stream().findFirst();
    }

    /** Every watched folder (null), or the shared ones and those of the given workspaces. */
    public List<Source> sources(List<UUID> workspaceIds) {
        return workspaceIds == null
                ? jdbc.query("SELECT " + SOURCE_COLUMNS + " FROM knowledge_source ORDER BY created_at", SOURCE)
                : jdbc.query("SELECT " + SOURCE_COLUMNS + " FROM knowledge_source WHERE workspace_id IS NULL OR workspace_id = ANY (?) ORDER BY created_at",
                        SOURCE, (Object) workspaceIds.toArray(new UUID[0]));
    }

    public void sourceScanned(UUID id, String result) {
        jdbc.update("UPDATE knowledge_source SET last_scan_at = now(), last_result = ? WHERE id = ?", result, id);
    }

    public void deleteSource(UUID id) {
        jdbc.update("DELETE FROM knowledge_source WHERE id = ?", id);
    }

    // --- feedback ---

    public void insertFeedback(UUID workspaceId, String question, String answer, boolean helpful, String comment, String sources, String user) {
        jdbc.update("INSERT INTO knowledge_feedback (id, workspace_id, question, answer, helpful, comment, sources, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                UUID.randomUUID(), workspaceId, question, answer, helpful, comment, sources, user);
    }

    /** notesToCheck: notes whose cited sections changed in a newer revision; revised: older revisions kept as history. */
    public record Stats(long documents, long ready, long sections, long embedded, long trustedNotes, long suggestedNotes,
                        long helpful, long notHelpful, long notesToCheck, long revised) {
    }

    public Stats stats(List<UUID> workspaceIds) {
        Object ids = workspaceIds.toArray(new UUID[0]);
        String scope = "(workspace_id IS NULL OR workspace_id = ANY (?))";
        return new Stats(
                count("SELECT count(*) FROM knowledge_document WHERE superseded_by IS NULL AND " + scope, ids),
                count("SELECT count(*) FROM knowledge_document WHERE status = 'READY' AND " + scope, ids),
                count("SELECT count(*) FROM knowledge_chunk WHERE " + scope, ids),
                count("SELECT count(*) FROM knowledge_chunk WHERE embedding IS NOT NULL AND " + scope, ids),
                count("SELECT count(*) FROM knowledge_note WHERE status = 'TRUSTED' AND " + scope, ids),
                count("SELECT count(*) FROM knowledge_note WHERE status = 'SUGGESTED' AND " + scope, ids),
                count("SELECT count(*) FROM knowledge_feedback WHERE helpful AND " + scope, ids),
                count("SELECT count(*) FROM knowledge_feedback WHERE NOT helpful AND " + scope, ids),
                count("SELECT count(*) FROM knowledge_note WHERE needs_review IS NOT NULL AND status <> 'REJECTED' AND " + scope, ids),
                count("SELECT count(*) FROM knowledge_document WHERE superseded_by IS NOT NULL AND " + scope, ids));
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
