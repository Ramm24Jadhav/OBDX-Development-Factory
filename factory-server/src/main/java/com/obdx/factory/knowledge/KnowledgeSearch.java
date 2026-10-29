package com.obdx.factory.knowledge;

import com.obdx.factory.indexing.CodeIndexRepository;
import com.obdx.factory.model.ModelGateway;
import com.obdx.factory.model.ModelGatewayException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Finds what the knowledge base says about a question: manual sections and notes, ranked by keyword search
 * (PostgreSQL full text) and by meaning (pgvector embeddings), merged with reciprocal rank fusion as code search does.
 * Results are limited to one OBDX version line and to the Oracle manuals plus the given workspace's own knowledge.
 * Without the embedding model it falls back to keywords.
 */
@Service
public class KnowledgeSearch {

    private static final int CANDIDATES = 40;
    private static final int RRF_K = 60;
    private static final int PER_DOCUMENT = 2;
    private static final Set<String> STOP_WORDS = Set.of("a", "an", "the", "and", "or", "of", "to", "in", "on", "for", "is",
            "are", "was", "be", "it", "this", "that", "where", "what", "which", "how", "who", "when", "does", "do", "with",
            "from", "by", "as", "at", "can", "i", "we", "my", "our", "me", "you", "obdx", "oracle", "banking", "digital", "experience");

    private final JdbcTemplate jdbc;
    private final ModelGateway modelGateway;
    private final KnowledgeVectors vectors;
    private final KnowledgePolicy policy;

    public KnowledgeSearch(JdbcTemplate jdbc, ModelGateway modelGateway, KnowledgeVectors vectors, KnowledgePolicy policy) {
        this.jdbc = jdbc;
        this.policy = policy;
        this.modelGateway = modelGateway;
        this.vectors = vectors;
    }

    /**
     * One search result. kind: MANUAL (a section of a document) or NOTE; status is the note's (TRUSTED, SUGGESTED).
     */
    public record Hit(String kind, UUID id, UUID documentId, String title, String heading, String obdxVersion, int pageFrom,
                      int pageTo, String status, String text, double score) {
    }

    public record Result(List<Hit> hits, boolean semanticUsed, String note) {
    }

    /**
     * @param versionLine     22, 25, or null for every version
     * @param workspaceId     the workspace whose own documents and notes count too; null: only the shared knowledge
     * @param suggestedNotes  include notes nobody has approved yet (the AI chat shows them, marked; code generation does not)
     */
    public Result search(String query, String versionLine, UUID workspaceId, int limit, boolean suggestedNotes) {
        String tsQuery = toTsQuery(query);
        Map<String, Double> scores = new HashMap<>();
        String semanticNote = null;
        boolean semanticUsed = false;
        String scope = " AND (workspace_id IS NULL OR workspace_id = ?) AND (?::text IS NULL OR version_line IS NULL OR version_line = ?)";
        String noteStatus = suggestedNotes ? " AND status IN ('TRUSTED', 'SUGGESTED')" : " AND status = 'TRUSTED'";
        if (!tsQuery.isEmpty()) {
            rank(scores, "M", jdbc.query("SELECT id FROM knowledge_chunk, to_tsquery('english', ?) q WHERE search_vector @@ q" + scope
                    + " ORDER BY ts_rank_cd(search_vector, q, 1) DESC LIMIT ?", (rs, r) -> rs.getObject(1, UUID.class),
                    tsQuery, workspaceId, versionLine, versionLine, CANDIDATES));
            rank(scores, "N", jdbc.query("SELECT id FROM knowledge_note, to_tsquery('english', ?) q WHERE search_vector @@ q" + scope + noteStatus
                    + " ORDER BY ts_rank_cd(search_vector, q, 1) DESC LIMIT ?", (rs, r) -> rs.getObject(1, UUID.class),
                    tsQuery, workspaceId, versionLine, versionLine, CANDIDATES));
        }
        if (!policy.embeddingAllowed()) {
            // The question is not sent to an embedding model outside the bank
            semanticNote = policy.embeddingProblem() + " Matching by keywords only.";
        } else {
            try {
                float[] embedding = modelGateway.embed(query);
                String vector = CodeIndexRepository.toVectorLiteral(embedding);
                String near = " AND embedding IS NOT NULL AND vector_dims(embedding) = vector_dims(?::vector)";
                // On the trial database (no pgvector) the sections are compared in memory: the SQL search takes seconds there
                List<UUID> chunks = vectors.inUse() ? vectors.nearest(embedding, versionLine, workspaceId, CANDIDATES) : null;
                if (chunks == null) {
                    chunks = jdbc.query("SELECT id FROM knowledge_chunk WHERE true" + scope + near + " ORDER BY embedding <=> ?::vector LIMIT ?",
                            (rs, r) -> rs.getObject(1, UUID.class), workspaceId, versionLine, versionLine, vector, vector, CANDIDATES);
                }
                List<UUID> notes = jdbc.query("SELECT id FROM knowledge_note WHERE true" + scope + noteStatus + near + " ORDER BY embedding <=> ?::vector LIMIT ?",
                        (rs, r) -> rs.getObject(1, UUID.class), workspaceId, versionLine, versionLine, vector, vector, CANDIDATES);
                rank(scores, "M", chunks);
                rank(scores, "N", notes);
                semanticUsed = !chunks.isEmpty() || !notes.isEmpty();
                if (!semanticUsed) {
                    semanticNote = "Nothing is embedded yet; matching by keywords only.";
                }
            } catch (ModelGatewayException e) {
                semanticNote = "The embedding model is unavailable (" + e.getMessage() + "); matching by keywords only.";
            }
        }
        // Trusted notes are the distilled knowledge: they rank a little above a manual section with the same score
        int wanted = Math.clamp(limit, 1, CANDIDATES);
        List<Map.Entry<String, Double>> top = scores.entrySet().stream()
                .sorted(Map.Entry.<String, Double>comparingByValue().reversed())
                .limit(Math.min(wanted * 3L, CANDIDATES)).toList();
        return new Result(fewPerDocument(load(top), wanted), semanticUsed, semanticNote);
    }

    /**
     * At most {@link #PER_DOCUMENT} sections of one document, so one long user manual does not crowd out the guide
     * that answers the question (a developer question about adding a field matches many pages of a user manual).
     */
    static List<Hit> fewPerDocument(List<Hit> hits, int limit) {
        Map<UUID, Integer> perDocument = new HashMap<>();
        List<Hit> kept = new ArrayList<>();
        for (Hit h : hits) {
            if (kept.size() == limit) {
                break;
            }
            if (h.documentId() == null || perDocument.merge(h.documentId(), 1, Integer::sum) <= PER_DOCUMENT) {
                kept.add(h);
            }
        }
        return kept;
    }

    private static void rank(Map<String, Double> scores, String kind, List<UUID> ids) {
        for (int i = 0; i < ids.size(); i++) {
            scores.merge(kind + ids.get(i), 1.0 / (RRF_K + i + 1), Double::sum);
        }
    }

    private List<Hit> load(List<Map.Entry<String, Double>> top) {
        List<UUID> chunkIds = new ArrayList<>();
        List<UUID> noteIds = new ArrayList<>();
        for (Map.Entry<String, Double> e : top) {
            (e.getKey().charAt(0) == 'M' ? chunkIds : noteIds).add(UUID.fromString(e.getKey().substring(1)));
        }
        Map<String, Hit> byKey = new HashMap<>();
        if (!chunkIds.isEmpty()) {
            jdbc.query("SELECT c.id, c.document_id, d.title, d.obdx_version, c.heading, c.page_from, c.page_to, c.content "
                            + "FROM knowledge_chunk c JOIN knowledge_document d ON d.id = c.document_id WHERE c.id = ANY (?)",
                    rs -> {
                        UUID id = rs.getObject("id", UUID.class);
                        byKey.put("M" + id, new Hit("MANUAL", id, rs.getObject("document_id", UUID.class), rs.getString("title"),
                                rs.getString("heading"), rs.getString("obdx_version"), rs.getInt("page_from"), rs.getInt("page_to"),
                                null, rs.getString("content"), 0));
                    }, (Object) chunkIds.toArray(new UUID[0]));
        }
        if (!noteIds.isEmpty()) {
            jdbc.query("SELECT id, title, topic, version_line, status, body FROM knowledge_note WHERE id = ANY (?)",
                    rs -> {
                        UUID id = rs.getObject("id", UUID.class);
                        byKey.put("N" + id, new Hit("NOTE", id, null, rs.getString("title"), rs.getString("topic"),
                                rs.getString("version_line"), 0, 0, rs.getString("status"), rs.getString("body"), 0));
                    }, (Object) noteIds.toArray(new UUID[0]));
        }
        List<Hit> hits = new ArrayList<>();
        for (Map.Entry<String, Double> e : top) {
            Hit h = byKey.get(e.getKey());
            if (h != null) {
                double boost = "TRUSTED".equals(h.status()) ? 1.15 : 1.0;
                hits.add(new Hit(h.kind(), h.id(), h.documentId(), h.title(), h.heading(), h.obdxVersion(), h.pageFrom(), h.pageTo(),
                        h.status(), h.text(), Math.round(e.getValue() * boost * 100000) / 100000.0));
            }
        }
        hits.sort(Comparator.comparingDouble(Hit::score).reversed());
        return hits;
    }

    /**
     * Any meaningful word may match ("fund | transfer"); sections matching more of them rank higher. Words are
     * prefixes so "transfer" finds "transfers". The english configuration stems both sides.
     */
    static String toTsQuery(String query) {
        Set<String> words = new LinkedHashSet<>();
        for (String word : (query == null ? "" : query).toLowerCase(Locale.ROOT).split("[^a-z0-9]+")) {
            if (word.length() > 1 && !STOP_WORDS.contains(word)) {
                words.add(word);
            }
        }
        return words.stream().map(w -> w.length() >= 4 ? w + ":*" : w).collect(Collectors.joining(" | "));
    }
}
