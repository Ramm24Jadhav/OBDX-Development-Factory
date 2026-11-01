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
     */
    public record ChangeFile(int position, String path, String action, String layer, String purpose, Status status,
                             String original, String generated, boolean edited, FileChecks.Status checkStatus,
                             String checkMessage, int attempts, String rewrite) {

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
                rs.getString("check_message"), rs.getInt("attempts"), rs.getString("rewrite")), changeId);
    }

    public Optional<ChangeFile> file(UUID changeId, String path) {
        return files(changeId).stream().filter(f -> f.path().equals(path)).findFirst();
    }

    public void saveResult(UUID changeId, String path, Status status, String original, String generated, boolean edited,
                           FileChecks.Result check, int attempts) {
        jdbc.update("UPDATE change_file SET status = ?, original = ?, generated = ?, edited = ?, check_status = ?, check_message = ?, "
                        + "attempts = ?, rewrite = NULL WHERE change_id = ? AND path = ?",
                status.name(), original, generated, edited, check == null ? null : check.status().name(),
                check == null ? null : check.message(), attempts, changeId, path);
    }

    /** Keeps (or, with null, drops) the part of a rewrite the model's limit stopped; the file's content stays as it is. */
    public void saveRewrite(UUID changeId, String path, String rewrite) {
        jdbc.update("UPDATE change_file SET rewrite = ? WHERE change_id = ? AND path = ?", rewrite, changeId, path);
    }

    public void saveCheck(UUID changeId, String path, FileChecks.Result check) {
        jdbc.update("UPDATE change_file SET check_status = ?, check_message = ? WHERE change_id = ? AND path = ?",
                check.status().name(), check.message(), changeId, path);
    }
}
