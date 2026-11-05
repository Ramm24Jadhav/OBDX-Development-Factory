package com.obdx.factory.modernization;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** The modernization records of a workspace (V35): the path choice, the plans, the runs and the technology settings. */
@Repository
public class ModernizationStore {

    /**
     * The chosen path. path: ui or migration; scope: all or some (then modules); mode: agent (the factory does it end to
     * end) or plan (plan only); analysis: latest or new; technology: the migration's target pack; state: draft or started.
     */
    public record Choice(String path, String scope, List<String> modules, String mode, String analysis, String technology, String state,
                         String savedBy, OffsetDateTime savedAt, OffsetDateTime startedAt) {
    }

    /** A saved plan (its shape belongs to the path) and who saved it when. */
    public record SavedPlan(JsonNode plan, String savedBy, OffsetDateTime savedAt) {
    }

    /** One wave or module being built as a change. */
    public record Run(UUID id, UUID workspaceId, String path, String subject, List<String> screens, String technology, UUID requirementId,
                      UUID changeId, boolean rejected, String reason, String startedBy, OffsetDateTime startedAt, OffsetDateTime finishedAt,
                      String securityBy, OffsetDateTime securityAt) {
    }

    private static final TypeReference<List<String>> STRINGS = new TypeReference<>() {
    };

    private final JdbcTemplate jdbc;
    private final ObjectMapper json;

    public ModernizationStore(JdbcTemplate jdbc, ObjectMapper json) {
        this.jdbc = jdbc;
        this.json = json;
    }

    // --- path choice ---

    public Optional<Choice> choice(UUID workspaceId) {
        return jdbc.query("SELECT path, scope, modules::text AS modules, mode, analysis, technology, state, saved_by, saved_at, started_at "
                + "FROM modernization_choice WHERE workspace_id = ?", (rs, n) -> new Choice(rs.getString("path"), rs.getString("scope"),
                json.readValue(rs.getString("modules"), STRINGS), rs.getString("mode"), rs.getString("analysis"), rs.getString("technology"),
                rs.getString("state"), rs.getString("saved_by"), time(rs, "saved_at"), time(rs, "started_at")), workspaceId).stream().findFirst();
    }

    public Choice saveChoice(UUID workspaceId, Choice c) {
        jdbc.update("INSERT INTO modernization_choice (workspace_id, path, scope, modules, mode, analysis, technology, state, saved_by, saved_at, "
                + "started_at) VALUES (?, ?, ?, ?::jsonb, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (workspace_id) DO UPDATE SET path = EXCLUDED.path, "
                + "scope = EXCLUDED.scope, modules = EXCLUDED.modules, mode = EXCLUDED.mode, analysis = EXCLUDED.analysis, "
                + "technology = EXCLUDED.technology, state = EXCLUDED.state, saved_by = EXCLUDED.saved_by, saved_at = EXCLUDED.saved_at, "
                + "started_at = EXCLUDED.started_at", workspaceId, c.path(), c.scope(), json.writeValueAsString(c.modules()), c.mode(), c.analysis(),
                c.technology(), c.state(), c.savedBy(), stamp(c.savedAt()), stamp(c.startedAt()));
        return c;
    }

    // --- plans ---

    public Optional<SavedPlan> plan(UUID workspaceId, String path) {
        return jdbc.query("SELECT plan::text AS plan, saved_by, saved_at FROM modernization_plan WHERE workspace_id = ? AND path = ?",
                (rs, n) -> new SavedPlan(json.readTree(rs.getString("plan")), rs.getString("saved_by"), time(rs, "saved_at")),
                workspaceId, path).stream().findFirst();
    }

    public SavedPlan savePlan(UUID workspaceId, String path, JsonNode plan, String by) {
        Instant now = Instant.now();
        jdbc.update("INSERT INTO modernization_plan (workspace_id, path, plan, saved_by, saved_at) VALUES (?, ?, ?::jsonb, ?, ?) "
                + "ON CONFLICT (workspace_id, path) DO UPDATE SET plan = EXCLUDED.plan, saved_by = EXCLUDED.saved_by, saved_at = EXCLUDED.saved_at",
                workspaceId, path, json.writeValueAsString(plan), by, Timestamp.from(now));
        return new SavedPlan(plan, by, now.atOffset(ZoneOffset.UTC));
    }

    // --- runs ---

    private static final String RUN_COLUMNS = "id, workspace_id, path, subject, screens::text AS screens, technology, requirement_id, change_id, "
            + "rejected, reason, started_by, started_at, finished_at, security_by, security_at";

    private Run mapRun(ResultSet rs, int n) throws SQLException {
        return new Run(rs.getObject("id", UUID.class), rs.getObject("workspace_id", UUID.class), rs.getString("path"), rs.getString("subject"),
                json.readValue(rs.getString("screens"), STRINGS), rs.getString("technology"), rs.getObject("requirement_id", UUID.class),
                rs.getObject("change_id", UUID.class), rs.getBoolean("rejected"), rs.getString("reason"), rs.getString("started_by"),
                time(rs, "started_at"), time(rs, "finished_at"), rs.getString("security_by"), time(rs, "security_at"));
    }

    public Run insertRun(Run r) {
        jdbc.update("INSERT INTO modernization_run (id, workspace_id, path, subject, screens, technology, requirement_id, change_id, rejected, "
                + "reason, started_by, started_at, finished_at) VALUES (?, ?, ?, ?, ?::jsonb, ?, ?, ?, ?, ?, ?, ?, ?)", r.id(), r.workspaceId(), r.path(),
                r.subject(), json.writeValueAsString(r.screens()), r.technology(), r.requirementId(), r.changeId(), r.rejected(), r.reason(),
                r.startedBy(), stamp(r.startedAt()), stamp(r.finishedAt()));
        return r;
    }

    public void linkChange(UUID runId, UUID requirementId, UUID changeId) {
        jdbc.update("UPDATE modernization_run SET requirement_id = ?, change_id = ? WHERE id = ?", requirementId, changeId, runId);
    }

    /** Records who signed off the security review of a run's change (null clears it). */
    public void securityReview(UUID runId, String by) {
        jdbc.update("UPDATE modernization_run SET security_by = ?, security_at = ? WHERE id = ?", by, by == null ? null : Timestamp.from(Instant.now()), runId);
    }

    public void finish(UUID runId, boolean rejected, String reason) {
        jdbc.update("UPDATE modernization_run SET rejected = ?, reason = ?, finished_at = ? WHERE id = ?", rejected, reason,
                Timestamp.from(Instant.now()), runId);
    }

    public Optional<Run> run(UUID id) {
        return jdbc.query("SELECT " + RUN_COLUMNS + " FROM modernization_run WHERE id = ?", this::mapRun, id).stream().findFirst();
    }

    public List<Run> runs(UUID workspaceId) {
        return jdbc.query("SELECT " + RUN_COLUMNS + " FROM modernization_run WHERE workspace_id = ? ORDER BY started_at DESC", this::mapRun, workspaceId);
    }

    // --- technology settings ---

    public Optional<SavedPlan> settings(UUID workspaceId, String technology) {
        return jdbc.query("SELECT settings::text AS settings, saved_by, saved_at FROM technology_setting WHERE workspace_id = ? AND technology = ?",
                (rs, n) -> new SavedPlan(json.readTree(rs.getString("settings")), rs.getString("saved_by"), time(rs, "saved_at")),
                workspaceId, technology).stream().findFirst();
    }

    public SavedPlan saveSettings(UUID workspaceId, String technology, JsonNode settings, String by) {
        Instant now = Instant.now();
        jdbc.update("INSERT INTO technology_setting (workspace_id, technology, settings, saved_by, saved_at) VALUES (?, ?, ?::jsonb, ?, ?) "
                + "ON CONFLICT (workspace_id, technology) DO UPDATE SET settings = EXCLUDED.settings, saved_by = EXCLUDED.saved_by, "
                + "saved_at = EXCLUDED.saved_at", workspaceId, technology, json.writeValueAsString(settings), by, Timestamp.from(now));
        return new SavedPlan(settings, by, now.atOffset(ZoneOffset.UTC));
    }

    private static OffsetDateTime time(ResultSet rs, String column) throws SQLException {
        Timestamp t = rs.getTimestamp(column);
        return t == null ? null : t.toInstant().atOffset(ZoneOffset.UTC);
    }

    private static Timestamp stamp(OffsetDateTime t) {
        return t == null ? null : Timestamp.from(t.toInstant());
    }
}
