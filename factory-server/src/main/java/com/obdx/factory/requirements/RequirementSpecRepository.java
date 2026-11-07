package com.obdx.factory.requirements;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import tools.jackson.databind.ObjectMapper;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Versions of a requirement's spec, stored as JSON. Versions are never changed; each change adds one.
 */
@Repository
public class RequirementSpecRepository {

    /** How a version was made: drafted by the model, updated with answers, or edited by hand. */
    /** MODERNIZATION: written by Modernization from the code analysis (a run’s brief), not drafted by a model. */
    public enum Origin { DRAFTED, REFINED, EDITED, ANSWERED, MODERNIZATION }

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

    /** A stored version: its number, how it was made and when. */
    public record Version(int version, Origin origin, OffsetDateTime createdAt) {
    }

    /** Every version of the requirement's spec, newest first. */
    public List<Version> versions(UUID requirementId) {
        return jdbc.query("SELECT version, origin, created_at FROM requirement_spec WHERE requirement_id = ? ORDER BY version DESC",
                (rs, row) -> new Version(rs.getInt("version"), Origin.valueOf(rs.getString("origin")),
                        rs.getTimestamp("created_at").toInstant().atOffset(ZoneOffset.UTC)), requirementId);
    }

    public Optional<RequirementSpec> find(UUID requirementId, int version) {
        return jdbc.query("SELECT spec FROM requirement_spec WHERE requirement_id = ? AND version = ?",
                        (rs, row) -> json.readValue(rs.getString("spec"), RequirementSpec.class), requirementId, version)
                .stream().findFirst();
    }
}
