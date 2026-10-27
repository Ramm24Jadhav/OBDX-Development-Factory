package com.obdx.factory.requirements;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import tools.jackson.databind.ObjectMapper;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

/**
 * Versions of a requirement's spec, stored as JSON. Versions are never changed; each change adds one.
 */
@Repository
public class RequirementSpecRepository {

    /** How a version was made: drafted by the model, updated with answers, or edited by hand. */
    public enum Origin { DRAFTED, REFINED, EDITED, ANSWERED }

    private final JdbcTemplate jdbc;
    private final ObjectMapper json;

    public RequirementSpecRepository(JdbcTemplate jdbc, ObjectMapper json) {
        this.jdbc = jdbc;
        this.json = json;
    }

    /** Stores the spec as the next version and returns that version number. */
    public int add(UUID requirementId, Origin origin, RequirementSpec spec) {
        Integer last = jdbc.queryForObject("SELECT max(version) FROM requirement_spec WHERE requirement_id = ?",
                Integer.class, requirementId);
        int version = last == null ? 1 : last + 1;
        jdbc.update("INSERT INTO requirement_spec (requirement_id, version, origin, spec, created_at) VALUES (?, ?, ?, ?::jsonb, ?)",
                requirementId, version, origin.name(), json.writeValueAsString(spec), Timestamp.from(Instant.now()));
        return version;
    }

    public Optional<RequirementSpec> find(UUID requirementId, int version) {
        return jdbc.query("SELECT spec FROM requirement_spec WHERE requirement_id = ? AND version = ?",
                        (rs, row) -> json.readValue(rs.getString("spec"), RequirementSpec.class), requirementId, version)
                .stream().findFirst();
    }
}
