package com.obdx.factory.profile;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.ObjectMapper;

import java.sql.Timestamp;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

@Repository
public class ProjectProfileRepository {

    private static final TypeReference<List<ProfileFact>> FACT_LIST = new TypeReference<>() {
    };

    private final JdbcTemplate jdbc;
    private final ObjectMapper json;

    public ProjectProfileRepository(JdbcTemplate jdbc, ObjectMapper json) {
        this.jdbc = jdbc;
        this.json = json;
    }

    public record StoredProfile(Long revision, OffsetDateTime detectedAt, List<ProfileFact> facts) {
    }

    public record Override(String value, OffsetDateTime updatedAt) {
    }

    public void save(UUID workspaceId, Long revision, List<ProfileFact> facts) {
        jdbc.update("INSERT INTO project_profile (workspace_id, revision, detected_at, facts) VALUES (?, ?, ?, ?::jsonb) "
                        + "ON CONFLICT (workspace_id) DO UPDATE SET revision = EXCLUDED.revision, "
                        + "detected_at = EXCLUDED.detected_at, facts = EXCLUDED.facts",
                workspaceId, revision, Timestamp.from(java.time.Instant.now()), json.writeValueAsString(facts));
    }

    public Optional<StoredProfile> find(UUID workspaceId) {
        return jdbc.query("SELECT revision, detected_at, facts FROM project_profile WHERE workspace_id = ?",
                (rs, row) -> new StoredProfile(
                        (Long) rs.getObject("revision"),
                        rs.getTimestamp("detected_at").toInstant().atOffset(ZoneOffset.UTC),
                        json.readValue(rs.getString("facts"), FACT_LIST)),
                workspaceId).stream().findFirst();
    }

    public Map<String, Override> findOverrides(UUID workspaceId) {
        Map<String, Override> overrides = new LinkedHashMap<>();
        jdbc.query("SELECT fact_key, value, updated_at FROM project_profile_override WHERE workspace_id = ?",
                rs -> {
                    overrides.put(rs.getString("fact_key"), new Override(rs.getString("value"),
                            rs.getTimestamp("updated_at").toInstant().atOffset(ZoneOffset.UTC)));
                },
                workspaceId);
        return overrides;
    }

    public void saveOverride(UUID workspaceId, String key, String value) {
        jdbc.update("INSERT INTO project_profile_override (workspace_id, fact_key, value, updated_at) VALUES (?, ?, ?, ?) "
                        + "ON CONFLICT (workspace_id, fact_key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at",
                workspaceId, key, value, Timestamp.from(java.time.Instant.now()));
    }

    public void deleteOverride(UUID workspaceId, String key) {
        jdbc.update("DELETE FROM project_profile_override WHERE workspace_id = ? AND fact_key = ?", workspaceId, key);
    }
}
