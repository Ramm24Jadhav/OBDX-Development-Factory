package com.obdx.factory.change;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * The files of a change, with their content before and after generation.
 */
@Repository
public class ChangeFileStore {

    /** PENDING: not written yet. GENERATED: written (possibly edited). UNCHANGED: nothing to change. FAILED: could not be written. */
    public enum Status { PENDING, GENERATED, UNCHANGED, FAILED }

    /**
     * @param rewrite a rewrite (Write again) the model's limit stopped part-way, kept beside generated (which stays the
     *                file's content) for the next Write again or Continue to go on from; null when there is none
     * @param rewriteComplete the rewrite is a whole answer whose fix was stopped (checked and fixed next time), not a part
     * @param fitDue   written by a generation the model's limit stopped, so its fix by the cross-check's findings was not
     *                 made: Continue makes it once (see ChangeService.toFit)
     */
    public record ChangeFile(int position, String path, String action, String layer, String purpose, Status status,
                             String original, String generated, boolean edited, FileChecks.Status checkStatus,
                             String checkMessage, int attempts, String rewrite, boolean rewriteComplete, boolean fitDue) {

        public ChangeFile(int position, String path, String action, String layer, String purpose, Status status, String original,
                          String generated, boolean edited, FileChecks.Status checkStatus, String checkMessage, int attempts, String rewrite,
                          boolean rewriteComplete) {
            this(position, path, action, layer, purpose, status, original, generated, edited, checkStatus, checkMessage, attempts, rewrite,
                    rewriteComplete, false);
        }

        public ChangeFile(int position, String path, String action, String layer, String purpose, Status status, String original,
                          String generated, boolean edited, FileChecks.Status checkStatus, String checkMessage, int attempts, String rewrite) {
            this(position, path, action, layer, purpose, status, original, generated, edited, checkStatus, checkMessage, attempts, rewrite, false);
        }

        public ChangeFile(int position, String path, String action, String layer, String purpose, Status status, String original,
                          String generated, boolean edited, FileChecks.Status checkStatus, String checkMessage, int attempts) {
            this(position, path, action, layer, purpose, status, original, generated, edited, checkStatus, checkMessage, attempts, null);
        }
    }

    private final JdbcTemplate jdbc;

    public ChangeFileStore(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public void replaceAll(UUID changeId, List<ChangePlan.Item> items) {
        jdbc.update("DELETE FROM change_file WHERE change_id = ?", changeId);
        for (int i = 0; i < items.size(); i++) {
            ChangePlan.Item item = items.get(i);
            jdbc.update("INSERT INTO change_file (change_id, position, path, action, layer, purpose, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
                    changeId, i, item.path(), item.action(), item.layer(), item.purpose(), Status.PENDING.name());
        }
    }

    public List<ChangeFile> files(UUID changeId) {
        return jdbc.query("SELECT * FROM change_file WHERE change_id = ? ORDER BY position", (rs, row) -> new ChangeFile(
                rs.getInt("position"), rs.getString("path"), rs.getString("action"), rs.getString("layer"), rs.getString("purpose"),
                Status.valueOf(rs.getString("status")), rs.getString("original"), rs.getString("generated"), rs.getBoolean("edited"),
                rs.getString("check_status") == null ? null : FileChecks.Status.valueOf(rs.getString("check_status")),
                rs.getString("check_message"), rs.getInt("attempts"), rs.getString("rewrite"), rs.getBoolean("rewrite_complete"),
                rs.getBoolean("fit_due")), changeId);
    }

    public Optional<ChangeFile> file(UUID changeId, String path) {
        return files(changeId).stream().filter(f -> f.path().equals(path)).findFirst();
    }

    public void saveResult(UUID changeId, String path, Status status, String original, String generated, boolean edited,
                           FileChecks.Result check, int attempts) {
        jdbc.update("UPDATE change_file SET status = ?, original = ?, generated = ?, edited = ?, check_status = ?, check_message = ?, "
                        + "attempts = ?, rewrite = NULL, rewrite_complete = FALSE, fit_due = FALSE WHERE change_id = ? AND path = ?",
                status.name(), original, generated, edited, check == null ? null : check.status().name(),
                check == null ? null : check.message(), attempts, changeId, path);
        if (generated != null) {
            keepRevision(changeId, path, generated, edited);
        }
    }

    /** One content a file had, in the order written (see V39). */
    public record Revision(long id, String path, boolean edited, java.time.OffsetDateTime writtenAt) {
    }

    /** Keeps the content as the file's next revision, unless it is the same as its last one. */
    void keepRevision(UUID changeId, String path, String content, boolean edited) {
        List<String> last = jdbc.queryForList("SELECT content FROM change_file_revision WHERE change_id = ? AND path = ? ORDER BY id DESC LIMIT 1",
                String.class, changeId, path);
        if (last.isEmpty() || !last.getFirst().equals(content)) {
            jdbc.update("INSERT INTO change_file_revision (change_id, path, content, edited) VALUES (?, ?, ?, ?)", changeId, path, content, edited);
        }
    }

    public List<Revision> revisions(UUID changeId) {
        return jdbc.query("SELECT id, path, edited, written_at FROM change_file_revision WHERE change_id = ? ORDER BY id",
                (rs, n) -> new Revision(rs.getLong("id"), rs.getString("path"), rs.getBoolean("edited"), rs.getObject("written_at", java.time.OffsetDateTime.class)),
                changeId);
    }

    /** Each file's content as it was after revision upTo (a file not written by then is left out). */
    public java.util.Map<String, String> contentAt(UUID changeId, long upTo) {
        java.util.Map<String, String> out = new java.util.LinkedHashMap<>();
        jdbc.query("SELECT DISTINCT ON (path) path, content FROM change_file_revision WHERE change_id = ? AND id <= ? ORDER BY path, id DESC",
                (org.springframework.jdbc.core.RowCallbackHandler) rs -> out.put(rs.getString("path"), rs.getString("content")), changeId, upTo);
        return out;
    }

    /**
     * Marks the written files of a generation the model's limit stopped: their fix by the cross-check is due, for the
     * next Continue. (A file written again or fixed loses the mark: see saveResult and fitTried.)
     */
    public void markFitDue(UUID changeId, java.util.Collection<String> paths) {
        for (String path : paths) {
            jdbc.update("UPDATE change_file SET fit_due = TRUE WHERE change_id = ? AND path = ? AND status = 'GENERATED' AND generated IS NOT NULL",
                    changeId, path);
        }
    }

    /** The fix by the cross-check was tried (kept or not): it is not due any more. */
    public void fitTried(UUID changeId, String path) {
        jdbc.update("UPDATE change_file SET fit_due = FALSE WHERE change_id = ? AND path = ?", changeId, path);
    }

    /** Keeps (or, with null, drops) the part of a rewrite the model's limit stopped; the file's content stays as it is. */
    public void saveRewrite(UUID changeId, String path, String rewrite) {
        saveRewrite(changeId, path, rewrite, false);
    }

    /** @param complete the rewrite is a whole answer whose fix was stopped, not a part cut off */
    public void saveRewrite(UUID changeId, String path, String rewrite, boolean complete) {
        jdbc.update("UPDATE change_file SET rewrite = ?, rewrite_complete = ? WHERE change_id = ? AND path = ?", rewrite, rewrite != null && complete,
                changeId, path);
    }

    public void saveCheck(UUID changeId, String path, FileChecks.Result check) {
        jdbc.update("UPDATE change_file SET check_status = ?, check_message = ? WHERE change_id = ? AND path = ?",
                check.status().name(), check.message(), changeId, path);
    }
}
