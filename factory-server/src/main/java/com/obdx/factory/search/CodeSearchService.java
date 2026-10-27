package com.obdx.factory.search;

import com.obdx.factory.common.BadRequestException;
import com.obdx.factory.common.NotFoundException;
import com.obdx.factory.indexing.CodeIndexRepository;
import com.obdx.factory.indexing.SearchText;
import com.obdx.factory.model.ModelGateway;
import com.obdx.factory.model.ModelGatewayException;
import com.obdx.factory.workspace.WorkspaceRepository;
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
 * Finds code in one workspace by combining keyword search (PostgreSQL full text) with semantic search
 * (pgvector embeddings). The two rankings are merged with reciprocal rank fusion, so code that both find ranks first.
 * Semantic search is skipped when the embedding model is unavailable.
 */
@Service
public class CodeSearchService {

    private static final int CANDIDATES = 50;
    private static final int RRF_K = 60;
    private static final int SNIPPET_LINES = 30;
    private static final Set<String> STOP_WORDS = Set.of(
            "a", "an", "the", "and", "or", "of", "to", "in", "on", "for", "is", "are", "was", "be", "it", "this", "that",
            "where", "what", "which", "how", "who", "when", "does", "do", "with", "from", "by", "as", "at", "find", "show",
            "me", "code", "implemented", "implementation", "defined", "handled", "done");

    private final JdbcTemplate jdbc;
    private final ModelGateway modelGateway;
    private final WorkspaceRepository workspaces;

    public CodeSearchService(JdbcTemplate jdbc, ModelGateway modelGateway, WorkspaceRepository workspaces) {
        this.jdbc = jdbc;
        this.modelGateway = modelGateway;
        this.workspaces = workspaces;
    }

    public record SearchResult(String path, String language, String kind, String symbol, int startLine, int endLine,
                               String snippet, double score, String matchedBy) {
    }

    public record SearchResponse(String query, boolean semanticUsed, String semanticNote, List<SearchResult> results) {
    }

    public SearchResponse search(UUID workspaceId, String query, int limit) {
        if (!workspaces.existsById(workspaceId)) {
            throw new NotFoundException("Workspace not found: " + workspaceId);
        }
        if (query == null || query.isBlank()) {
            throw new BadRequestException("Enter something to search for");
        }
        int max = Math.clamp(limit, 1, CANDIDATES);

        List<UUID> keywordHits = keywordSearch(workspaceId, query);
        List<UUID> semanticHits = List.of();
        String semanticNote = null;
        try {
            semanticHits = semanticSearch(workspaceId, query);
            if (semanticHits.isEmpty()) {
                semanticNote = "No embeddings yet; showing keyword matches only.";
            }
        } catch (ModelGatewayException e) {
            semanticNote = "Semantic search unavailable (" + e.getMessage() + "); showing keyword matches only.";
        }

        Map<UUID, Double> scores = new HashMap<>();
        Map<UUID, Set<String>> matchedBy = new HashMap<>();
        addRanking(keywordHits, "keyword", scores, matchedBy);
        addRanking(semanticHits, "semantic", scores, matchedBy);

        List<UUID> top = scores.entrySet().stream()
                .sorted(Map.Entry.<UUID, Double>comparingByValue().reversed())
                .limit(max)
                .map(Map.Entry::getKey)
                .toList();
        return new SearchResponse(query, !semanticHits.isEmpty(), semanticNote, load(top, scores, matchedBy));
    }

    private static void addRanking(List<UUID> ranking, String source, Map<UUID, Double> scores, Map<UUID, Set<String>> matchedBy) {
        for (int i = 0; i < ranking.size(); i++) {
            UUID id = ranking.get(i);
            scores.merge(id, 1.0 / (RRF_K + i + 1), Double::sum);
            matchedBy.computeIfAbsent(id, k -> new LinkedHashSet<>()).add(source);
        }
    }

    private List<UUID> keywordSearch(UUID workspaceId, String query) {
        String tsQuery = toTsQuery(query);
        if (tsQuery.isEmpty()) {
            return List.of();
        }
        return jdbc.query("SELECT id FROM code_chunk, to_tsquery('simple', ?) q "
                        + "WHERE workspace_id = ? AND search_vector @@ q "
                        + "ORDER BY ts_rank_cd(search_vector, q, 1) DESC, path LIMIT ?",
                (rs, row) -> rs.getObject("id", UUID.class),
                tsQuery, workspaceId, CANDIDATES);
    }

    private List<UUID> semanticSearch(UUID workspaceId, String query) {
        Boolean hasEmbeddings = jdbc.queryForObject(
                "SELECT EXISTS (SELECT 1 FROM code_chunk WHERE workspace_id = ? AND embedding IS NOT NULL)",
                Boolean.class, workspaceId);
        if (!Boolean.TRUE.equals(hasEmbeddings)) {
            return List.of();
        }
        String vector = CodeIndexRepository.toVectorLiteral(modelGateway.embed(query));
        return jdbc.query("SELECT id FROM code_chunk "
                        + "WHERE workspace_id = ? AND embedding IS NOT NULL AND vector_dims(embedding) = vector_dims(?::vector) "
                        + "ORDER BY embedding <=> ?::vector LIMIT ?",
                (rs, row) -> rs.getObject("id", UUID.class),
                workspaceId, vector, vector, CANDIDATES);
    }

    /**
     * Any of the meaningful words may match ("fund | transfer"); chunks matching more of them rank higher.
     * Longer words also match as prefixes so "transfer" finds "transfers".
     */
    static String toTsQuery(String query) {
        Set<String> words = new LinkedHashSet<>();
        for (String word : query.toLowerCase(Locale.ROOT).split("[^a-z0-9]+")) {
            words.add(word);
        }
        words.addAll(SearchText.splitIdentifiers(query));
        return words.stream()
                .filter(word -> word.length() > 1 && !STOP_WORDS.contains(word))
                .map(word -> word.length() >= 4 ? word + ":*" : word)
                .collect(Collectors.joining(" | "));
    }

    private List<SearchResult> load(List<UUID> ids, Map<UUID, Double> scores, Map<UUID, Set<String>> matchedBy) {
        if (ids.isEmpty()) {
            return List.of();
        }
        Map<UUID, SearchResult> byId = new HashMap<>();
        jdbc.query("SELECT id, path, language, kind, symbol, start_line, end_line, content FROM code_chunk WHERE id = ANY (?)",
                rs -> {
                    UUID id = rs.getObject("id", UUID.class);
                    byId.put(id, new SearchResult(rs.getString("path"), rs.getString("language"), rs.getString("kind"),
                            rs.getString("symbol"), rs.getInt("start_line"), rs.getInt("end_line"),
                            snippet(rs.getString("content")), Math.round(scores.get(id) * 10000) / 10000.0,
                            String.join(" + ", matchedBy.get(id))));
                },
                (Object) ids.toArray(new UUID[0]));
        List<SearchResult> results = new ArrayList<>();
        for (UUID id : ids) {
            if (byId.containsKey(id)) {
                results.add(byId.get(id));
            }
        }
        results.sort(Comparator.comparingDouble(SearchResult::score).reversed());
        return results;
    }

    private static String snippet(String content) {
        String[] lines = content.split("\n", -1);
        if (lines.length <= SNIPPET_LINES) {
            return content;
        }
        return String.join("\n", java.util.Arrays.copyOf(lines, SNIPPET_LINES)) + "\n...";
    }
}
