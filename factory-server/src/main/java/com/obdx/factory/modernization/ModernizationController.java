package com.obdx.factory.modernization;

import com.obdx.factory.auth.AccessGuard;
import com.obdx.factory.auth.AppUser;
import com.obdx.factory.auth.AuditLog;
import com.obdx.factory.auth.WorkspaceRole.Permission;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.UUID;

/** The Modernization screens' data (docs/MODERNIZATION.md). Reading needs View; saving needs Manage code. */
@RestController
public class ModernizationController {

    private final ModernizationService service;
    private final ModernizationRunService runs;
    private final TechnologyCatalogue catalogue;
    private final TechnologySettings settings;
    private final AccessGuard guard;
    private final AuditLog audit;
    private final com.obdx.factory.profile.ProjectProfileService profiles;
    private final org.springframework.jdbc.core.JdbcTemplate jdbc;
    private final RunValidation validation;

    public ModernizationController(ModernizationService service, ModernizationRunService runs, TechnologyCatalogue catalogue, TechnologySettings settings,
                                   AccessGuard guard, AuditLog audit, com.obdx.factory.profile.ProjectProfileService profiles,
                                   org.springframework.jdbc.core.JdbcTemplate jdbc, RunValidation validation) {
        this.validation = validation;
        this.profiles = profiles;
        this.jdbc = jdbc;
        this.settings = settings;
        this.service = service;
        this.runs = runs;
        this.catalogue = catalogue;
        this.guard = guard;
        this.audit = audit;
    }

    /** The Technology catalogue (signed-in users): technologies with their target packs and readiness. */
    @GetMapping("/api/modernization/catalogue")
    public TechnologyCatalogue.Catalogue catalogue() {
        return catalogue.catalogue();
    }

    @GetMapping("/api/workspaces/{workspaceId}/modernization/overview")
    public ModernizationService.Overview overview(@PathVariable UUID workspaceId) {
        guard.require(workspaceId, Permission.VIEW);
        return service.overview(workspaceId);
    }

    /** The saved path choice, or 204 when none is saved. */
    @GetMapping("/api/workspaces/{workspaceId}/modernization/path")
    public ResponseEntity<ModernizationStore.Choice> choice(@PathVariable UUID workspaceId) {
        guard.require(workspaceId, Permission.VIEW);
        ModernizationStore.Choice choice = service.choice(workspaceId);
        return choice == null ? ResponseEntity.noContent().build() : ResponseEntity.ok(choice);
    }

    @PutMapping("/api/workspaces/{workspaceId}/modernization/path")
    public ModernizationStore.Choice saveChoice(@PathVariable UUID workspaceId, @RequestBody ModernizationService.ChoiceRequest request) {
        AppUser user = guard.require(workspaceId, Permission.MANAGE_CODE);
        return service.saveChoice(workspaceId, request, user.getUsername());
    }

    @GetMapping("/api/workspaces/{workspaceId}/modernization/components")
    public ComponentInventory.View components(@PathVariable UUID workspaceId) {
        guard.require(workspaceId, Permission.VIEW);
        return service.components(workspaceId);
    }

    @GetMapping("/api/workspaces/{workspaceId}/modernization/components.csv")
    public ResponseEntity<byte[]> componentsCsv(@PathVariable UUID workspaceId, @RequestParam(required = false) String compatibility,
                                                @RequestParam(required = false) String category) {
        guard.require(workspaceId, Permission.VIEW);
        return csv("component-inventory.csv", service.componentsCsv(workspaceId, compatibility, category));
    }

    /** One element's mapping; without element, the most used one. */
    @GetMapping("/api/workspaces/{workspaceId}/modernization/mapping")
    public ModernizationService.MappingDetail mapping(@PathVariable UUID workspaceId, @RequestParam(required = false) String element) {
        guard.require(workspaceId, Permission.VIEW);
        return service.mapping(workspaceId, element);
    }

    @GetMapping("/api/workspaces/{workspaceId}/modernization/runs")
    public List<ModernizationService.RunView> runs(@PathVariable UUID workspaceId) {
        guard.require(workspaceId, Permission.VIEW);
        return service.runs(workspaceId);
    }

    /** Starts a run: its brief becomes an approved requirement and a change (Manage code). */
    @PostMapping("/api/workspaces/{workspaceId}/modernization/runs")
    public ModernizationService.RunView startRun(@PathVariable UUID workspaceId, @RequestBody ModernizationRunService.RunRequest request) {
        AppUser user = guard.require(workspaceId, Permission.MANAGE_CODE);
        ModernizationService.RunView run = runs.start(workspaceId, request, user.getDisplayName());
        audit.record("MODERNIZATION_RUN_STARTED", workspaceId, run.subject(), run.changeId() == null ? null : run.changeId().toString());
        return run;
    }

    /** The premium packs in the workspace's code: the version installed and one on its way (its change). */
    @GetMapping("/api/workspaces/{workspaceId}/modernization/packs")
    public List<ModernizationRunService.PackState> packs(@PathVariable UUID workspaceId) {
        guard.require(workspaceId, Permission.VIEW);
        return runs.packStates(workspaceId);
    }

    /** Installs (or upgrades) a premium pack in the code through a change for review (Manage code). */
    @PostMapping("/api/workspaces/{workspaceId}/modernization/packs/{packId}/install")
    public ModernizationService.RunView installPack(@PathVariable UUID workspaceId, @PathVariable String packId) {
        AppUser user = guard.require(workspaceId, Permission.MANAGE_CODE);
        ModernizationService.RunView run = runs.installPack(workspaceId, packId, user.getDisplayName());
        audit.record("COMPONENT_PACK_INSTALL_STARTED", workspaceId, run.subject(), run.changeId() == null ? null : run.changeId().toString());
        return run;
    }

    /** Checks a pack against the workspace: framework version, other component libraries, gates passed. */
    @GetMapping("/api/workspaces/{workspaceId}/modernization/packs/{packId}/compatibility")
    public List<ModernizationRunService.CompatibilityLine> compatibility(@PathVariable UUID workspaceId, @PathVariable String packId) {
        guard.require(workspaceId, Permission.VIEW);
        com.obdx.factory.componentpack.ComponentPackService.JetFact fact;
        try {
            var f = profiles.get(workspaceId).facts().stream().filter((x) -> "ui.jetVersion".equals(x.key())).findFirst().orElse(null);
            fact = f == null ? new com.obdx.factory.componentpack.ComponentPackService.JetFact(null, "missing", List.of())
                    : new com.obdx.factory.componentpack.ComponentPackService.JetFact(f.value(), f.status(), f.evidence());
        } catch (com.obdx.factory.common.NotFoundException e) {
            fact = new com.obdx.factory.componentpack.ComponentPackService.JetFact(null, "missing", List.of());
        }
        return runs.compatibility(workspaceId, packId, fact, jdbc);
    }

    /** Validation: the run's latest build, its tests by suite, coverage and gate, OBDX rules, service calls and screenshots. */
    @GetMapping("/api/workspaces/{workspaceId}/modernization/runs/{runId}/validation")
    public RunValidation.View validation(@PathVariable UUID workspaceId, @PathVariable UUID runId) {
        guard.require(workspaceId, Permission.VIEW);
        return validation.view(workspaceId, runId);
    }

    @GetMapping("/api/workspaces/{workspaceId}/modernization/runs/{runId}/validation/report.csv")
    public org.springframework.http.ResponseEntity<String> validationCsv(@PathVariable UUID workspaceId, @PathVariable UUID runId) {
        guard.require(workspaceId, Permission.VIEW);
        return org.springframework.http.ResponseEntity.ok().contentType(new org.springframework.http.MediaType("text", "csv", java.nio.charset.StandardCharsets.UTF_8))
                .header(org.springframework.http.HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"test-report.csv\"").body(validation.reportCsv(workspaceId, runId));
    }

    @GetMapping("/api/workspaces/{workspaceId}/modernization/runs/{runId}/validation/evidence.zip")
    public org.springframework.http.ResponseEntity<byte[]> evidence(@PathVariable UUID workspaceId, @PathVariable UUID runId) {
        guard.require(workspaceId, Permission.VIEW);
        return org.springframework.http.ResponseEntity.ok().contentType(org.springframework.http.MediaType.parseMediaType("application/zip"))
                .header(org.springframework.http.HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"test-evidence.zip\"").body(validation.evidenceZip(workspaceId, runId));
    }

    /** One screenshot of the run's build, through the factory. */
    @GetMapping("/api/workspaces/{workspaceId}/modernization/runs/{runId}/validation/image")
    public org.springframework.http.ResponseEntity<byte[]> validationImage(@PathVariable UUID workspaceId, @PathVariable UUID runId,
                                                                         @org.springframework.web.bind.annotation.RequestParam String path) {
        guard.require(workspaceId, Permission.VIEW);
        String lower = path.toLowerCase(java.util.Locale.ROOT);
        String type = lower.endsWith(".png") ? "image/png" : lower.endsWith(".webp") ? "image/webp" : "image/jpeg";
        return org.springframework.http.ResponseEntity.ok().contentType(org.springframework.http.MediaType.parseMediaType(type))
                .header("Content-Security-Policy", "default-src 'none'").body(validation.image(workspaceId, runId, path));
    }

    @GetMapping("/api/workspaces/{workspaceId}/modernization/runs/{runId}")
    public ModernizationService.RunView run(@PathVariable UUID workspaceId, @PathVariable UUID runId) {
        guard.require(workspaceId, Permission.VIEW);
        return runs.get(workspaceId, runId);
    }

    @GetMapping("/api/workspaces/{workspaceId}/modernization/runs/{runId}/detail")
    public ModernizationRunService.RunDetail runDetail(@PathVariable UUID workspaceId, @PathVariable UUID runId) {
        guard.require(workspaceId, Permission.VIEW);
        return runs.detail(workspaceId, runId);
    }

    public record SecurityReview(boolean done) {
    }

    /** The security review of a run's change, signed off by a person with Approve. */
    @PostMapping("/api/workspaces/{workspaceId}/modernization/runs/{runId}/security-review")
    public ModernizationService.RunView securityReview(@PathVariable UUID workspaceId, @PathVariable UUID runId, @RequestBody SecurityReview request) {
        AppUser user = guard.require(workspaceId, Permission.APPROVE);
        ModernizationService.RunView run = runs.securityReview(workspaceId, runId, request != null && request.done(), user.getDisplayName());
        audit.record("MODERNIZATION_SECURITY_REVIEWED", workspaceId, run.subject(), request != null && request.done() ? "signed off" : "withdrawn");
        return run;
    }

    public record RejectRequest(String reason) {
    }

    @PostMapping("/api/workspaces/{workspaceId}/modernization/runs/{runId}/reject")
    public ModernizationService.RunView reject(@PathVariable UUID workspaceId, @PathVariable UUID runId, @RequestBody RejectRequest request) {
        AppUser user = guard.require(workspaceId, Permission.MANAGE_CODE);
        ModernizationService.RunView run = runs.reject(workspaceId, runId, request == null ? null : request.reason(), user.getDisplayName());
        audit.record("MODERNIZATION_RUN_REJECTED", workspaceId, run.subject(), run.message());
        return run;
    }

    /** The UI path's plan; add: components from the inventory to put in it (not saved until Save). */
    @GetMapping("/api/workspaces/{workspaceId}/modernization/upgrade-plan")
    public ModernizationService.UpgradePlanView upgradePlan(@PathVariable UUID workspaceId, @RequestParam(required = false) List<String> add,
                                                            @RequestParam(required = false) String grouping,
                                                            @RequestParam(required = false) List<String> components,
                                                            @RequestParam(required = false) List<String> off) {
        guard.require(workspaceId, Permission.VIEW);
        boolean draft = grouping != null || components != null || off != null;
        return service.upgradePlan(workspaceId, add, draft ? new ModernizationService.UpgradePlanRequest(grouping, components, off == null ? List.of() : off) : null);
    }

    @PutMapping("/api/workspaces/{workspaceId}/modernization/upgrade-plan")
    public ModernizationService.UpgradePlanView saveUpgradePlan(@PathVariable UUID workspaceId, @RequestBody ModernizationService.UpgradePlanRequest request) {
        AppUser user = guard.require(workspaceId, Permission.MANAGE_CODE);
        return service.saveUpgradePlan(workspaceId, request, user.getUsername());
    }

    @GetMapping("/api/workspaces/{workspaceId}/modernization/upgrade-plan.csv")
    public ResponseEntity<byte[]> upgradePlanCsv(@PathVariable UUID workspaceId) {
        guard.require(workspaceId, Permission.VIEW);
        return csv("upgrade-plan.csv", service.upgradePlanCsv(workspaceId));
    }

    @PostMapping("/api/workspaces/{workspaceId}/modernization/upgrade-plan/start")
    public ModernizationService.RunView startWave(@PathVariable UUID workspaceId, @RequestParam String wave) {
        AppUser user = guard.require(workspaceId, Permission.MANAGE_CODE);
        ModernizationService.RunView run = runs.startWave(workspaceId, wave, user.getDisplayName());
        audit.record("MODERNIZATION_RUN_STARTED", workspaceId, run.subject(), run.changeId() == null ? null : run.changeId().toString());
        return run;
    }

    @GetMapping("/api/workspaces/{workspaceId}/modernization/planner")
    public ModernizationService.Planner planner(@PathVariable UUID workspaceId) {
        guard.require(workspaceId, Permission.VIEW);
        return service.planner(workspaceId);
    }

    @PutMapping("/api/workspaces/{workspaceId}/modernization/planner")
    public ModernizationService.Planner savePlanner(@PathVariable UUID workspaceId, @RequestBody ModernizationService.PlannerRequest request) {
        AppUser user = guard.require(workspaceId, Permission.MANAGE_CODE);
        return service.savePlanner(workspaceId, request, user.getUsername());
    }

    @GetMapping("/api/workspaces/{workspaceId}/modernization/planner.csv")
    public ResponseEntity<byte[]> plannerCsv(@PathVariable UUID workspaceId) {
        guard.require(workspaceId, Permission.VIEW);
        return csv("migration-plan.csv", service.plannerCsv(workspaceId));
    }

    /** Starts a module (or the next one in the plan) as a run. */
    @PostMapping("/api/workspaces/{workspaceId}/modernization/planner/start")
    public ModernizationService.RunView startModule(@PathVariable UUID workspaceId, @RequestParam(required = false) String module) {
        AppUser user = guard.require(workspaceId, Permission.MANAGE_CODE);
        ModernizationService.RunView run = runs.startNextModule(workspaceId, module, user.getDisplayName());
        audit.record("MODERNIZATION_RUN_STARTED", workspaceId, run.subject(), run.changeId() == null ? null : run.changeId().toString());
        return run;
    }

    @GetMapping("/api/workspaces/{workspaceId}/modernization/settings")
    public TechnologySettings.Settings settings(@PathVariable UUID workspaceId, @RequestParam(required = false) String technology) {
        guard.require(workspaceId, Permission.VIEW);
        return settings.get(workspaceId, technology);
    }

    public record SettingsRequest(java.util.Map<String, String> values) {
    }

    @PutMapping("/api/workspaces/{workspaceId}/modernization/settings/{technology}")
    public TechnologySettings.Settings saveSettings(@PathVariable UUID workspaceId, @PathVariable String technology, @RequestBody SettingsRequest request) {
        AppUser user = guard.require(workspaceId, Permission.MANAGE_CODE);
        TechnologySettings.Settings saved = settings.save(workspaceId, technology, request == null ? null : request.values(), user.getUsername());
        audit.record("MODERNIZATION_SETTINGS_SAVED", workspaceId, saved.name(), null);
        return saved;
    }

    @GetMapping("/api/workspaces/{workspaceId}/modernization/history.csv")
    public ResponseEntity<byte[]> historyCsv(@PathVariable UUID workspaceId) {
        guard.require(workspaceId, Permission.VIEW);
        return csv("modernization-history.csv", runs.historyCsv(workspaceId));
    }

    @GetMapping("/api/workspaces/{workspaceId}/modernization/history/logs.zip")
    public ResponseEntity<byte[]> historyLogs(@PathVariable UUID workspaceId, @RequestParam(required = false) List<UUID> runs) {
        guard.require(workspaceId, Permission.VIEW);
        return ResponseEntity.ok().header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"modernization-logs.zip\"")
                .contentType(MediaType.parseMediaType("application/zip")).body(this.runs.logsZip(workspaceId, runs));
    }

    static ResponseEntity<byte[]> csv(String name, String body) {
        return ResponseEntity.ok().header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + name + "\"")
                .contentType(new MediaType("text", "csv", StandardCharsets.UTF_8)).body(body.getBytes(StandardCharsets.UTF_8));
    }
}
