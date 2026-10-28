package com.obdx.factory.importing;

import com.obdx.factory.common.NotFoundException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

/**
 * The indexed files of a workspace and their content, for browsing the code. Only files in the index are served, read
 * from the workspace's working copy.
 */
@Component
public class CodeFiles {

    /** Larger files are cut to this size. */
    static final int MAX_BYTES = 512 * 1024;

    private static final RowMapper<FileEntry> ENTRY = (rs, n) ->
            new FileEntry(rs.getString("path"), rs.getString("language"), rs.getInt("size_bytes"), rs.getLong("revision"));

    private final JdbcTemplate jdbc;
    private final StorageProperties storage;

    public CodeFiles(JdbcTemplate jdbc, StorageProperties storage) {
        this.jdbc = jdbc;
        this.storage = storage;
    }

    public record FileEntry(String path, String language, int sizeBytes, long revision) {
    }

    public record FileContent(String path, String language, int sizeBytes, long revision, int lines, String content,
                              boolean truncated) {
    }

    /** The indexed files whose path contains text (all when it is empty), sorted by path. */
    public List<FileEntry> list(UUID workspaceId, String text, int limit) {
        String like = "%" + text.toLowerCase(Locale.ROOT).replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%";
        return jdbc.query("SELECT path, language, size_bytes, revision FROM code_file "
                        + "WHERE workspace_id = ? AND lower(path) LIKE ? ORDER BY path LIMIT ?",
                ENTRY, workspaceId, like, Math.clamp(limit, 1, 20000));
    }

    /** One indexed file's content from the working copy, cut at MAX_BYTES. */
    public FileContent content(UUID workspaceId, String path) throws IOException {
        List<FileEntry> found = jdbc.query("SELECT path, language, size_bytes, revision FROM code_file WHERE workspace_id = ? AND path = ?",
                ENTRY, workspaceId, path);
        if (found.isEmpty()) {
            throw new NotFoundException("The file " + path + " is not in the code index");
        }
        Path root = storage.workingCopy(workspaceId).normalize();
        Path file = root.resolve(path).normalize();
        if (!file.startsWith(root) || !Files.isRegularFile(file)) {
            throw new NotFoundException("The file " + path + " is not in the working copy; import the code again");
        }
        byte[] bytes;
        try (InputStream in = Files.newInputStream(file)) {
            bytes = in.readNBytes(MAX_BYTES + 1);
        }
        boolean truncated = bytes.length > MAX_BYTES;
        String content = new String(bytes, 0, Math.min(bytes.length, MAX_BYTES), StandardCharsets.UTF_8);
        FileEntry entry = found.getFirst();
        int lines = content.isEmpty() ? 0 : (int) content.lines().count();
        return new FileContent(entry.path(), entry.language(), entry.sizeBytes(), entry.revision(), lines, content, truncated);
    }
}
