package com.obdx.factory.change;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.ObjectMapper;

import java.sql.Timestamp;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;

/**
 * Jenkins builds of changes.
 */
@Repository
public class ChangeBuildStore {

    private static final TypeReference<List<String>> STRINGS = new TypeReference<>() {
    };

    public record Build(UUID id, int round, String job, Integer buildNumber, String buildUrl, String result,
                        List<String> errors, String logExcerpt, List<String> fixedFiles, OffsetDateTime startedAt,
                        OffsetDateTime finishedAt) {
    }

    private final JdbcTemplate jdbc;
    private final ObjectMapper json;

    public ChangeBuildStore(JdbcTemplate jdbc, ObjectMapper json) {
        this.jdbc = jdbc;
        this.json = json;
    }

    public UUID start(UUID changeId, int round, String job) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO change_build (id, change_id, round, job, result, started_at) VALUES (?, ?, ?, ?, 'QUEUED', ?)",
                id, changeId, round, job, Timestamp.from(java.time.Instant.now()));
        return id;
    }

    public void running(UUID id, int number, String url) {
        jdbc.update("UPDATE change_build SET build_number = ?, build_url = ?, result = 'RUNNING' WHERE id = ?", number, url, id);
    }

    public void finish(UUID id, String result, List<String> errors, String logExcerpt) {
        jdbc.update("UPDATE change_build SET result = ?, errors = ?, log_excerpt = ?, finished_at = ? WHERE id = ?",
                result, json.writeValueAsString(errors), logExcerpt, Timestamp.from(java.time.Instant.now()), id);
    }

    public void fixed(UUID id, List<String> files) {
        jdbc.update("UPDATE change_build SET fixed_files = ? WHERE id = ?", json.writeValueAsString(files), id);
    }

    public List<Build> list(UUID changeId) {
        return jdbc.query("SELECT * FROM change_build WHERE change_id = ? ORDER BY started_at, job", (rs, row) -> new Build(
                rs.getObject("id", UUID.class), rs.getInt("round"), rs.getString("job"), (Integer) rs.getObject("build_number"),
                rs.getString("build_url"), rs.getString("result"), strings(rs.getString("errors")), rs.getString("log_excerpt"),
                strings(rs.getString("fixed_files")), rs.getTimestamp("started_at").toInstant().atOffset(ZoneOffset.UTC),
                rs.getTimestamp("finished_at") == null ? null : rs.getTimestamp("finished_at").toInstant().atOffset(ZoneOffset.UTC)), changeId);
    }

    private List<String> strings(String value) {
        return value == null ? List.of() : json.readValue(value, STRINGS);
    }
}
