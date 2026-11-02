package com.obdx.factory.pack;

import com.obdx.factory.common.NotFoundException;
import com.obdx.factory.profile.ProjectProfileService;
import com.obdx.factory.workspace.Workspace;
import com.obdx.factory.workspace.WorkspaceRepository;
import com.obdx.factory.target.TargetPack;
import com.obdx.factory.target.TargetPacks;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

/**
 * A workspace's view of its version pack: which rules apply, which are turned off, and the scope the quick checks of
 * its changes run with.
 */
@Service
public class PackService {

    /**
     * appliesTo: "OBDX code" for version pack rules, or the new app (for example "React Native app in mobile/").
     * origin: VERSION_PACK (the factory's own pack files), BANK (a file of the bank's pack folder, factory.packs.dir) or
     * TARGET (the UI target pack); source: the file name; disabledBy and disabledAt: who turned the rule off for this
     * workspace, and when (null while it is on).
     */
    public record RuleView(String id, String title, PackRule.Severity severity, List<String> files, List<String> exclude,
                           String forbid, String require, String message, boolean enabled, boolean matchesProfile, String appliesTo,
                           String origin, String source, String disabledBy, OffsetDateTime disabledAt) {
    }

    private record Disabled(String by, OffsetDateTime at) {
    }

    public record WorkspaceChecks(String version, String description, int javaLevel, String javaLevelSource,
                                  List<RuleView> rules) {
    }

    private final VersionPacks packs;
    private final TargetPacks targets;
    private final LocalChecks checks;
    private final WorkspaceRepository workspaces;
    private final ProjectProfileService profiles;
    private final JdbcTemplate jdbc;

    public PackService(VersionPacks packs, TargetPacks targets, LocalChecks checks, WorkspaceRepository workspaces,
                       ProjectProfileService profiles, JdbcTemplate jdbc) {
        this.packs = packs;
        this.targets = targets;
        this.checks = checks;
        this.workspaces = workspaces;
        this.profiles = profiles;
        this.jdbc = jdbc;
    }

    /** What the quick checks of this workspace's changes run with. */
    public CheckScope scope(UUID workspaceId) {
        Workspace workspace = workspace(workspaceId);
        return new CheckScope(workspace.getObdxVersion(), facts(workspaceId), disabled(workspaceId), workspace.getTarget(),
                workspace.getAppFolder());
    }

    public WorkspaceChecks get(UUID workspaceId) {
        return get(workspaceId, null);
    }

    /**
     * The rules this workspace's code would be checked with on another OBDX version (null: its own), for example the
     * newer pack an upgrade moves to. The workspace's profile, target pack and disabled rules apply as they are.
     */
    public WorkspaceChecks get(UUID workspaceId, String version) {
        CheckScope own = scope(workspaceId);
        CheckScope scope = version == null || version.isBlank() ? own
                : new CheckScope(version.strip(), own.facts(), own.disabled(), own.target(), own.appFolder());
        VersionPack pack = packs.find(scope.version())
                .orElseThrow(() -> new NotFoundException("No version pack for OBDX " + scope.version()));
        Integer jet = scope.jetMajor();
        Map<String, Disabled> off = disabledDetails(workspaceId);
        List<RuleView> rules = new ArrayList<>(pack.rules().stream().map(r -> {
            String source = pack.sourceOf(r.id());
            Disabled d = off.get(r.id());
            return new RuleView(r.id(), r.title(), r.severity(), r.files(), r.exclude(), r.forbid(), r.require(), r.message(),
                    !scope.disabled().contains(r.id()), r.appliesToProfile(scope.facts(), jet), "OBDX code", origin(source), fileName(source),
                    d == null ? null : d.by(), d == null ? null : d.at());
        }).toList());
        targetPack(scope).ifPresent(target -> target.rules().forEach(r -> {
            Disabled d = off.get(r.id());
            rules.add(new RuleView(r.id(), r.title(), r.severity(), r.files(), r.exclude(), r.forbid(), r.require(), r.message(),
                    !scope.disabled().contains(r.id()), true, target.title() + " app in " + scope.appFolder() + "/", "TARGET",
                    target.title() + " target pack", d == null ? null : d.by(), d == null ? null : d.at()));
        }));
        return new WorkspaceChecks(pack.version(), pack.description(), checks.javaLevel(scope),
                scope.javaVersion() != null ? "Project Profile" : "version pack default", rules);
    }

    public WorkspaceChecks setEnabled(UUID workspaceId, String ruleId, boolean enabled, String by) {
        CheckScope scope = scope(workspaceId);
        boolean known = packs.find(scope.version()).stream().flatMap(p -> p.rules().stream()).anyMatch(r -> r.id().equals(ruleId))
                || targetPack(scope).stream().flatMap(t -> t.rules().stream()).anyMatch(r -> r.id().equals(ruleId));
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

    /** The workspace's React Native or React target pack, if it has one with an app folder. */
    private Optional<TargetPack> targetPack(CheckScope scope) {
        return scope.appFolder() == null ? Optional.empty() : targets.find(scope.target()).filter(t -> !t.isJet());
    }

    /** VERSION_PACK for the factory's own pack files (packs/...), BANK for a file of the bank's pack folder. */
    static String origin(String source) {
        return source == null || source.startsWith("packs/") ? "VERSION_PACK" : "BANK";
    }

    /** The file name only: the bank's pack folder is a path on the factory's server. */
    static String fileName(String source) {
        if (source == null) {
            return null;
        }
        String name = source.replace('\\', '/');
        return source.startsWith("packs/") ? name : name.substring(name.lastIndexOf('/') + 1);
    }

    private Map<String, Disabled> disabledDetails(UUID workspaceId) {
        Map<String, Disabled> map = new HashMap<>();
        jdbc.query("SELECT rule_id, disabled_by, disabled_at FROM workspace_disabled_rule WHERE workspace_id = ?",
                rs -> {
                    map.put(rs.getString("rule_id"), new Disabled(rs.getString("disabled_by"), rs.getObject("disabled_at", OffsetDateTime.class)));
                }, workspaceId);
        return map;
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
