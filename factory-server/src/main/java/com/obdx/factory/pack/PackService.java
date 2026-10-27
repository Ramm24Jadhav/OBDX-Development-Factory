package com.obdx.factory.pack;

import com.obdx.factory.common.NotFoundException;
import com.obdx.factory.profile.ProjectProfileService;
import com.obdx.factory.workspace.Workspace;
import com.obdx.factory.workspace.WorkspaceRepository;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.time.OffsetDateTime;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * A workspace's view of its version pack: which rules apply, which are turned off, and the scope the quick checks of
 * its changes run with.
 */
@Service
public class PackService {

    public record RuleView(String id, String title, PackRule.Severity severity, List<String> files, List<String> exclude,
                           String forbid, String require, String message, boolean enabled, boolean matchesProfile) {
    }

    public record WorkspaceChecks(String version, String description, int javaLevel, String javaLevelSource,
                                  List<RuleView> rules) {
    }

    private final VersionPacks packs;
    private final LocalChecks checks;
    private final WorkspaceRepository workspaces;
    private final ProjectProfileService profiles;
    private final JdbcTemplate jdbc;

    public PackService(VersionPacks packs, LocalChecks checks, WorkspaceRepository workspaces, ProjectProfileService profiles,
                       JdbcTemplate jdbc) {
        this.packs = packs;
        this.checks = checks;
        this.workspaces = workspaces;
        this.profiles = profiles;
        this.jdbc = jdbc;
    }

    /** What the quick checks of this workspace's changes run with. */
    public CheckScope scope(UUID workspaceId) {
        Workspace workspace = workspace(workspaceId);
        return new CheckScope(workspace.getObdxVersion(), facts(workspaceId), disabled(workspaceId));
    }

    public WorkspaceChecks get(UUID workspaceId) {
        CheckScope scope = scope(workspaceId);
        VersionPack pack = packs.find(scope.version())
                .orElseThrow(() -> new NotFoundException("No version pack for OBDX " + scope.version()));
        Integer jet = scope.jetMajor();
        List<RuleView> rules = pack.rules().stream().map(r -> new RuleView(r.id(), r.title(), r.severity(), r.files(), r.exclude(),
                r.forbid(), r.require(), r.message(), !scope.disabled().contains(r.id()), r.appliesToProfile(scope.facts(), jet))).toList();
        return new WorkspaceChecks(pack.version(), pack.description(), checks.javaLevel(scope),
                scope.javaVersion() != null ? "Project Profile" : "version pack default", rules);
    }

    public WorkspaceChecks setEnabled(UUID workspaceId, String ruleId, boolean enabled, String by) {
        CheckScope scope = scope(workspaceId);
        boolean known = packs.find(scope.version()).stream().flatMap(p -> p.rules().stream()).anyMatch(r -> r.id().equals(ruleId));
        if (!known) {
            throw new NotFoundException("No rule " + ruleId + " in the OBDX " + scope.version() + " pack");
        }
        if (enabled) {
            jdbc.update("DELETE FROM workspace_disabled_rule WHERE workspace_id = ? AND rule_id = ?", workspaceId, ruleId);
        } else {
            jdbc.update("INSERT INTO workspace_disabled_rule (workspace_id, rule_id, disabled_by, disabled_at) VALUES (?, ?, ?, ?) "
                    + "ON CONFLICT (workspace_id, rule_id) DO NOTHING", workspaceId, ruleId, by, OffsetDateTime.now());
        }
        return get(workspaceId);
    }

    private Set<String> disabled(UUID workspaceId) {
        return new HashSet<>(jdbc.queryForList("SELECT rule_id FROM workspace_disabled_rule WHERE workspace_id = ?", String.class, workspaceId));
    }

    /** The profile's facts, confirmed or corrected values first; empty when the workspace has not been scanned. */
    private Map<String, String> facts(UUID workspaceId) {
        Map<String, String> facts = new HashMap<>();
        try {
            profiles.get(workspaceId).facts().stream().filter(f -> f.value() != null).forEach(f -> facts.put(f.key(), f.value()));
        } catch (NotFoundException e) {
            // no profile yet
        }
        return facts;
    }

    private Workspace workspace(UUID id) {
        return workspaces.findById(id).orElseThrow(() -> new NotFoundException("Workspace not found: " + id));
    }
}
