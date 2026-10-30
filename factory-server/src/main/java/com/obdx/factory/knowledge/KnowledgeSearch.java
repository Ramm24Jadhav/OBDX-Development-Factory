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
    private static final int PER_SECTION = 2;
    private static final double BANK_BOOST = 1.2;
    private static final Set<String> STOP_WORDS = Set.of("a", "an", "the", "and", "or", "of", "to", "in", "on", "for", "is",
            "are", "was", "be", "it", "this", "that", "where", "what", "which", "how", "who", "when", "does", "do", "with",
            "from", "by", "as", "at", "can", "i", "we", "my", "our", "me", "you", "obdx", "oracle", "banking", "digital", "experience",
            // the words around a question, which say nothing about what is asked
            "give", "show", "tell", "explain", "list", "describe", "steps", "step", "procedure", "process", "way", "ways", "please",
            "need", "want", "should", "would", "could", "will", "shall", "new", "using", "via", "into", "about", "details", "detail",
            "help", "know", "get", "let", "us", "there", "any", "some", "all", "also", "then", "than", "so", "if", "not", "no", "yes",
            "possible", "able", "kindly", "regarding", "related", "flow", "guide", "information", "info");

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
     * bank: the bank's own document or note (of the workspace); patchset: the patchset a document is for (null: the
     * release). pageFrom 0: a document without pages (Word, text, HTML), cited by heading.
     */
    public record Hit(String kind, UUID id, UUID documentId, String title, String heading, String obdxVersion, int pageFrom,
                      int pageTo, String status, String text, double score, boolean bank, String patchset) {
    }

    public record Result(List<Hit> hits, boolean semanticUsed, String note) {
    }

    /**
     * @param versionLine     22, 25, or null for every version
     * @param workspaceId     the workspace whose own documents and notes count too; null: only the shared knowledge
     * @param suggestedNotes  include notes nobody has approved yet (the AI chat shows them, marked; code generation does not)
     */
    public Result search(String query, String versionLine, UUID workspaceId, int limit, boolean suggestedNotes) {
        return search(List.of(query), versionLine, workspaceId, limit, suggestedNotes);
    }

    /**
     * Searches for several wordings of one question (the user's own, and the same question in the manuals' words) and
     * merges the rankings: a section that several of them find ranks highest.
     */
    public Result search(List<String> wordings, String versionLine, UUID workspaceId, int limit, boolean suggestedNotes) {
        return search(wordings, versionLine, workspaceId, limit, suggestedNotes, false);
    }

    /**
     * A short list of sections for the chat model to choose from: spread over the manuals first, so the guide that
     * answers a developer's question is on it next to the user manual that matches the words best, then the best of the
     * rest wherever they are (the fourth section of one long manual can be the answer).
     */
    public Result shortList(String question, String versionLine, UUID workspaceId, int size, boolean suggestedNotes) {
        return search(List.of(question), versionLine, workspaceId, size, suggestedNotes, true);
    }

    private Result search(List<String> wordings, String versionLine, UUID workspaceId, int limit, boolean suggestedNotes, boolean shortList) {
        // The question in the manuals' own names for things is searched too (see ObdxGlossary)
        List<String> queries = new ArrayList<>(wordings);
        String glossary = wordings.isEmpty() ? null : ObdxGlossary.inManualWords(wordings.getFirst());
        if (glossary != null) {
            queries.add(glossary);
        }
        Map<String, Double> scores = new HashMap<>();
        String semanticNote = null;
        boolean semanticUsed = false;
        String scope = " AND (workspace_id IS NULL OR workspace_id = ?) AND (?::text IS NULL OR version_line IS NULL OR version_line = ?)";
        String noteStatus = suggestedNotes ? " AND status IN ('TRUSTED', 'SUGGESTED')" : " AND status = 'TRUSTED'";
        for (String query : queries) {
            String tsQuery = toTsQuery(query);
            if (!tsQuery.isEmpty()) {
                rank(scores, "M", keywordSections(tsQuery, scope, workspaceId, versionLine));
                rank(scores, "N", jdbc.query("SELECT id FROM knowledge_note, to_tsquery('english', ?) q WHERE search_vector @@ q" + scope + noteStatus
                        + " ORDER BY ts_rank_cd(search_vector, q, 1) DESC LIMIT ?", (rs, r) -> rs.getObject(1, UUID.class),
                        tsQuery, workspaceId, versionLine, versionLine, CANDIDATES));
            }
        }
        if (!policy.embeddingAllowed()) {
            // The question is not sent to an embedding model outside the bank
            semanticNote = policy.embeddingProblem() + " Matching by keywords only.";
        } else {
            try {
                for (String query : queries) {
                    float[] embedding = modelGateway.embedQuery(forMeaning(query));
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
                    semanticUsed |= !chunks.isEmpty() || !notes.isEmpty();
                }
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
                .limit(shortList ? CANDIDATES : Math.min(wanted * 3L, CANDIDATES)).toList();
        List<Hit> ranked = forSegment(load(top), wordings.isEmpty() ? "" : wordings.getFirst());
        return new Result(shortList ? spread(ranked, wanted) : fewPerDocument(ranked, wanted), semanticUsed, semanticNote);
    }

    /**
     * At most {@link #PER_DOCUMENT} sections of one document and {@link #PER_SECTION} parts of one of its sections, so
     * one long user manual does not crowd out the guide that answers the question (a developer question about adding a
     * field matches many pages of a user manual), and one long section does not crowd out the others of its manual.
     */
    static List<Hit> fewPerDocument(List<Hit> hits, int limit) {
        Map<UUID, Integer> perDocument = new HashMap<>();
        Map<String, Integer> perSection = new HashMap<>();
        List<Hit> kept = new ArrayList<>();
        for (Hit h : hits) {
            if (kept.size() == limit) {
                break;
            }
            if (h.documentId() == null) {
                kept.add(h);
                continue;
            }
            String section = h.documentId() + "/" + KnowledgeRepository.baseHeading(h.heading());
            if (perDocument.getOrDefault(h.documentId(), 0) < PER_DOCUMENT && perSection.getOrDefault(section, 0) < PER_SECTION) {
                perDocument.merge(h.documentId(), 1, Integer::sum);
                perSection.merge(section, 1, Integer::sum);
                kept.add(h);
            }
        }
        return kept;
    }

    /** First the best section of each manual (and the notes), in their order; then the best of the rest. */
    static List<Hit> spread(List<Hit> hits, int size) {
        List<Hit> list = new ArrayList<>();
        Set<UUID> manuals = new java.util.HashSet<>();
        for (Hit h : hits) {
            if (list.size() >= size) {
                break;
            }
            if (h.documentId() == null || manuals.add(h.documentId())) {
                list.add(h);
            }
        }
        Map<String, Integer> perSection = new HashMap<>();
        list.forEach(h -> perSection.merge(h.documentId() + "/" + KnowledgeRepository.baseHeading(h.heading()), 1, Integer::sum));
        for (Hit h : hits) {
            if (list.size() >= size) {
                break;
            }
            String section = h.documentId() + "/" + KnowledgeRepository.baseHeading(h.heading());
            if (!list.contains(h) && (h.documentId() == null || perSection.getOrDefault(section, 0) < PER_SECTION)) {
                perSection.merge(section, 1, Integer::sum);
                list.add(h);
            }
        }
        return list;
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
            jdbc.query("SELECT c.id, c.document_id, d.title, d.obdx_version, d.patchset, d.workspace_id, c.heading, c.page_from, c.page_to, c.content "
                            + "FROM knowledge_chunk c JOIN knowledge_document d ON d.id = c.document_id WHERE c.id = ANY (?)",
                    rs -> {
                        UUID id = rs.getObject("id", UUID.class);
                        byKey.put("M" + id, new Hit("MANUAL", id, rs.getObject("document_id", UUID.class), rs.getString("title"),
                                rs.getString("heading"), rs.getString("obdx_version"), rs.getInt("page_from"), rs.getInt("page_to"),
                                null, rs.getString("content"), 0, rs.getObject("workspace_id") != null, rs.getString("patchset")));
                    }, (Object) chunkIds.toArray(new UUID[0]));
        }
        if (!noteIds.isEmpty()) {
            jdbc.query("SELECT id, title, topic, version_line, status, body, workspace_id FROM knowledge_note WHERE id = ANY (?)",
                    rs -> {
                        UUID id = rs.getObject("id", UUID.class);
                        byKey.put("N" + id, new Hit("NOTE", id, null, rs.getString("title"), rs.getString("topic"),
                                rs.getString("version_line"), 0, 0, rs.getString("status"), rs.getString("body"), 0, rs.getObject("workspace_id") != null, null));
                    }, (Object) noteIds.toArray(new UUID[0]));
        }
        List<Hit> hits = new ArrayList<>();
        for (Map.Entry<String, Double> e : top) {
            Hit h = byKey.get(e.getKey());
            if (h != null) {
                // Approved notes are the distilled knowledge; the bank's own documents describe its customised system
                double boost = ("TRUSTED".equals(h.status()) ? 1.15 : 1.0) * (h.bank() ? BANK_BOOST : 1.0);
                hits.add(new Hit(h.kind(), h.id(), h.documentId(), h.title(), h.heading(), h.obdxVersion(), h.pageFrom(), h.pageTo(),
                        h.status(), h.text(), Math.round(e.getValue() * boost * 100000) / 100000.0, h.bank(), h.patchset()));
            }
        }
        hits.sort(Comparator.comparingDouble(Hit::score).reversed());
        return hits;
    }

    /**
     * Sections matching the question's words, the rare words counting most: in "how do I unlock a retail user" a
     * section about unlocking ranks above one that says "user" many times. PostgreSQL's own ranking counts every word
     * alike, so each word is weighted by how few of the searched sections contain it (its inverse document frequency,
     * counted with the full-text index), and that ranking only breaks ties.
     */
    private List<UUID> keywordSections(String tsQuery, String scope, UUID workspaceId, String versionLine) {
        Integer total = jdbc.queryForObject("SELECT count(*) FROM knowledge_chunk WHERE true" + scope, Integer.class,
                workspaceId, versionLine, versionLine);
        StringBuilder score = new StringBuilder("0.1 * ts_rank_cd(search_vector, q, 1)");
        // The weighted words come first in the statement, then the query, the scope and the limit
        List<Object> args = new ArrayList<>();
        Map<String, Double> weights = new java.util.LinkedHashMap<>();
        for (String term : tsQuery.split(" \\| ")) {
            Integer matching = jdbc.queryForObject("SELECT count(*) FROM knowledge_chunk WHERE search_vector @@ to_tsquery('english', ?)" + scope,
                    Integer.class, term, workspaceId, versionLine, versionLine);
            if (matching == null || matching == 0) {
                continue;
            }
            double weight = Math.log((total + 1.0) / (matching + 1.0));
            weights.put(term, weight);
            // A word in the section's heading ("4.1 User Management - Create") counts twice: it is what the section is about
            score.append(" + ").append(String.format(Locale.ROOT, "%.4f", weight)).append(" * ((search_vector @@ to_tsquery('english', ?))::int "
                    + "+ (to_tsvector('english', coalesce(heading, '')) @@ to_tsquery('english', ?))::int)");
            args.add(term);
            args.add(term);
        }
        // Two neighbouring words of the question together in a heading ("User Management - Create" for "user management
        // create") name what the section is about: their weights count again
        List<String> terms = new ArrayList<>(weights.keySet());
        for (int i = 0; i + 1 < terms.size(); i++) {
            double weight = weights.get(terms.get(i)) + weights.get(terms.get(i + 1));
            score.append(" + ").append(String.format(Locale.ROOT, "%.4f", weight))
                    .append(" * (to_tsvector('english', coalesce(heading, '')) @@ to_tsquery('english', ?))::int");
            args.add(terms.get(i) + " <-> " + terms.get(i + 1));
        }
        args.add(tsQuery);
        args.add(workspaceId);
        args.add(versionLine);
        args.add(versionLine);
        args.add(CANDIDATES);
        return jdbc.query("SELECT id, " + score + " AS score FROM knowledge_chunk, to_tsquery('english', ?) q WHERE search_vector @@ q" + scope
                + " ORDER BY score DESC LIMIT ?", (rs, r) -> rs.getObject(1, UUID.class), args.toArray());
    }

    /**
     * The question for the meaning search: its meaningful words in their order, without the product's name and the words
     * around a question ("How do I ... in OBDX?"). Every manual says "OBDX" many times, so left in, it pulls up the
     * sections that talk about OBDX in general (installation, configuration) instead of what is asked.
     */
    static String forMeaning(String query) {
        String q = query == null ? "" : query.replaceAll("(?i)oracle banking digital experience", " ");
        List<String> words = new ArrayList<>();
        for (String word : q.split("[^A-Za-z0-9_.-]+")) {
            String w = word.toLowerCase(Locale.ROOT).replaceAll("^[.-]+|[.-]+$", "");
            if (w.length() > 1 && !STOP_WORDS.contains(w)) {
                words.add(word.replaceAll("^[.-]+|[.-]+$", ""));
            }
        }
        return words.isEmpty() ? (query == null ? "" : query) : String.join(" ", words);
    }

    /**
     * OBDX has its retail and its corporate side, and many features exist for both: a question about one does not want
     * the sections only about the other ("Group Corporate Onboarding" for onboarding a retail user). Those count half.
     */
    static List<Hit> forSegment(List<Hit> hits, String question) {
        String q = question.toLowerCase(Locale.ROOT);
        boolean retail = q.matches(".*\\bretail\\b.*");
        boolean corporate = q.matches(".*\\b(corporate|business)\\b.*");
        if (retail == corporate) {
            return hits;
        }
        String other = retail ? "corporate" : "retail";
        String own = retail ? "retail" : "corporate";
        List<Hit> adjusted = new ArrayList<>();
        for (Hit h : hits) {
            String about = (h.title() + " " + (h.heading() == null ? "" : h.heading())).toLowerCase(Locale.ROOT);
            boolean otherOnly = about.contains(other) && !about.contains(own);
            adjusted.add(otherOnly ? new Hit(h.kind(), h.id(), h.documentId(), h.title(), h.heading(), h.obdxVersion(), h.pageFrom(), h.pageTo(),
                    h.status(), h.text(), h.score() / 2, h.bank(), h.patchset()) : h);
        }
        adjusted.sort(Comparator.comparingDouble(Hit::score).reversed());
        return adjusted;
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
