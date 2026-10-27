package com.obdx.factory.indexing;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Storage for indexed files and chunks. Uses plain SQL because of the PostgreSQL-specific columns (tsvector, vector).
 */
@Repository
public class CodeIndexRepository {

    private final JdbcTemplate jdbc;

    public CodeIndexRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public record StoredFile(UUID id, String contentHash) {
    }

    public record PendingEmbedding(UUID chunkId, String text) {
    }

    /** Path to stored file, for one workspace. */
    public Map<String, StoredFile> findFiles(UUID workspaceId) {
        Map<String, StoredFile> files = new HashMap<>();
        jdbc.query("SELECT id, path, content_hash FROM code_file WHERE workspace_id = ?",
                rs -> {
                    files.put(rs.getString("path"), new StoredFile(rs.getObject("id", UUID.class), rs.getString("content_hash")));
                },
                workspaceId);
        return files;
    }

    /** Replaces a file and its chunks. Call inside a transaction. */
    public void replaceFile(UUID workspaceId, String path, String language, int sizeBytes, String contentHash,
                            long revision, List<Chunk> chunks) {
        jdbc.update("DELETE FROM code_file WHERE workspace_id = ? AND path = ?", workspaceId, path);
        UUID fileId = UUID.randomUUID();
        jdbc.update("INSERT INTO code_file (id, workspace_id, path, language, size_bytes, content_hash, revision) "
                        + "VALUES (?, ?, ?, ?, ?, ?, ?)",
                fileId, workspaceId, path, language, sizeBytes, contentHash, revision);
        jdbc.batchUpdate("INSERT INTO code_chunk (id, workspace_id, file_id, path, language, kind, symbol, start_line, "
                        + "end_line, content, search_text) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                chunks.stream().map(chunk -> new Object[]{
                        UUID.randomUUID(), workspaceId, fileId, path, language, chunk.kind(), truncate(chunk.symbol(), 500),
                        chunk.startLine(), chunk.endLine(), chunk.content(),
                        SearchText.build(path, chunk.symbol(), chunk.content())}).toList());
    }

    public void deleteFile(UUID fileId) {
        jdbc.update("DELETE FROM code_file WHERE id = ?", fileId);
    }

    public List<PendingEmbedding> findChunksWithoutEmbedding(UUID workspaceId, int limit) {
        return jdbc.query("SELECT id, path, symbol, content FROM code_chunk "
                        + "WHERE workspace_id = ? AND embedding IS NULL ORDER BY path, start_line LIMIT ?",
                (rs, row) -> new PendingEmbedding(rs.getObject("id", UUID.class),
                        embeddingText(rs.getString("path"), rs.getString("symbol"), rs.getString("content"))),
                workspaceId, limit);
    }

    public void saveEmbedding(UUID chunkId, float[] vector) {
        jdbc.update("UPDATE code_chunk SET embedding = ?::vector WHERE id = ?", toVectorLiteral(vector), chunkId);
    }

    public record IndexStats(long files, long chunks, long chunksWithEmbedding, Map<String, Long> filesByLanguage) {
    }

    public IndexStats stats(UUID workspaceId) {
        Map<String, Long> byLanguage = new HashMap<>();
        jdbc.query("SELECT language, count(*) AS n FROM code_file WHERE workspace_id = ? GROUP BY language",
                rs -> {
                    byLanguage.put(rs.getString("language"), rs.getLong("n"));
                }, workspaceId);
        long files = byLanguage.values().stream().mapToLong(Long::longValue).sum();
        Long chunks = jdbc.queryForObject("SELECT count(*) FROM code_chunk WHERE workspace_id = ?", Long.class, workspaceId);
        Long embedded = jdbc.queryForObject(
                "SELECT count(*) FROM code_chunk WHERE workspace_id = ? AND embedding IS NOT NULL", Long.class, workspaceId);
        return new IndexStats(files, chunks == null ? 0 : chunks, embedded == null ? 0 : embedded, byLanguage);
    }

    /** The text sent to the embedding model: where the code lives plus the code itself, capped in length. */
    static String embeddingText(String path, String symbol, String content) {
        String text = "File: " + path + "\n" + (symbol == null ? "" : "Symbol: " + symbol + "\n") + "\n" + content;
        return text.length() > 4000 ? text.substring(0, 4000) : text;
    }

    public static String toVectorLiteral(float[] vector) {
        StringBuilder literal = new StringBuilder(vector.length * 10).append('[');
        for (int i = 0; i < vector.length; i++) {
            if (i > 0) {
                literal.append(',');
            }
            literal.append(vector[i]);
        }
        return literal.append(']').toString();
    }

    private static String truncate(String value, int max) {
        return value == null || value.length() <= max ? value : value.substring(0, max);
    }
}
