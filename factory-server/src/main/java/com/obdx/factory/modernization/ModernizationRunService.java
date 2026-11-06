package com.obdx.factory.modernization;

import com.obdx.factory.change.ChangeBranchService;
import com.obdx.factory.change.ChangeRequest;
import com.obdx.factory.change.ChangeService;
import com.obdx.factory.common.BadRequestException;
import com.obdx.factory.common.NotFoundException;
import com.obdx.factory.componentpack.ComponentPackService;
import com.obdx.factory.componentpack.ComponentRegistry;
import com.obdx.factory.componentpack.ComponentStyleStore;
import com.obdx.factory.componentpack.PackFiles;
import com.obdx.factory.modernization.ModernizationStore.Run;
import com.obdx.factory.requirements.RequirementService;
import com.obdx.factory.target.TargetService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.OffsetDateTime;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

/**
 * Starts and follows the runs of both paths (docs/MODERNIZATION.md). A run writes its brief from the code analysis,
 * records it as an approved requirement and starts an ordinary change from it; Workspace, Validation and Review show that
 * change, and Approve and deliver delivers it. A rejected run keeps its reason; its change is left as it is.
 */
@Service
public class ModernizationRunService {

    private static final Logger log = LoggerFactory.getLogger(ModernizationRunService.class);

    private final ModernizationService modernization;
    private final ModernizationStore store;
    private final ComponentRegistry registry;
    private final RequirementService requirements;
    private final ChangeService changes;
    private final TargetService targets;
    private final ChangeBranchService branches;
    private final ComponentPackService packs;
    private final ComponentStyleStore styles;

    public ModernizationRunService(ModernizationService modernization, ModernizationStore store, ComponentRegistry registry,
                                   RequirementService requirements, ChangeService changes, TargetService targets, ChangeBranchService branches,
                                   ComponentPackService packs, ComponentStyleStore styles) {
        this.branches = branches;
        this.packs = packs;
        this.styles = styles;
        this.modernization = modernization;
        this.store = store;
        this.registry = registry;
        this.requirements = requirements;
        this.changes = changes;
        this.targets = targets;
    }

    /**
     * What starts a run. UI path: components (JET elements), optionally only on screens (a wave's), with the wave's name.
     * Migration path: the module.
     */
    public record RunRequest(String path, List<String> components, List<String> screens, String wave, String module) {
    }

    public ModernizationService.RunView start(UUID workspaceId, RunRequest r, String by) {
        if (r == null || !ModernizationService.PATHS.contains(r.path())) {
            throw new BadRequestException("Say which path the run is for: ui or migration.");
        }
        Inventory inventory = modernization.inventory(workspaceId);
        RunBriefs.Brief brief;
        String technology = null;
        String subject;
        if ("ui".equals(r.path())) {
            List<String> components = r.components() == null ? List.of() : List.copyOf(new LinkedHashSet<>(r.components()));
            if (components.isEmpty()) {
                throw new BadRequestException("Choose at least one component to upgrade.");
            }
            Set<String> used = new LinkedHashSet<>();
            inventory.screens().forEach(s -> { if (s.elements() != null) { used.addAll(s.elements().keySet()); } });
            for (String c : components) {
                if (!used.contains(c)) {
                    throw new BadRequestException(c + " is not used on any screen of the analysis. Analyze again or choose another component.");
                }
                ComponentRegistry.JetMapping m = registry.jetMapping(c);
                if (m == null || m.target() == null) {
                    throw new BadRequestException(c + " has no premium element yet, so there is nothing to upgrade it to.");
                }
            }
            brief = RunBriefs.ui(inventory, registry, components, r.screens(), r.wave());
            if (brief.screens().isEmpty()) {
                throw new BadRequestException("None of the chosen screens uses these components.");
            }
            subject = r.wave() == null || r.wave().isBlank() ? String.join(", ", components) : r.wave().strip();
        } else {
            String module = r.module() == null ? "" : r.module().strip();
            if (inventory.modules().stream().noneMatch(m -> m.name().equals(module))) {
                throw new NotFoundException("There is no module " + module + " in the analysis.");
            }
            TargetService.WorkspaceTarget target = targets.get(workspaceId);
            if (target == null || target.target() == null || "jet".equals(target.target()) || target.appFolder() == null) {
                throw new BadRequestException("Choose the technology first: pick React, React Native or Angular in the Technology catalogue, with the app's folder.");
            }
            technology = target.target();
            brief = RunBriefs.migration(inventory, module, target.title() == null ? target.target() : target.title(), target.appFolder());
            subject = module;
        }
        return begin(workspaceId, r.path(), subject, brief, technology, by);
    }

    /** Records the brief as an approved requirement, starts its change and the run that follows it. */
    private ModernizationService.RunView begin(UUID workspaceId, String path, String subject, RunBriefs.Brief brief, String technology, String by) {
        RequirementService.RequirementDetail requirement = requirements.fromModernization(workspaceId, brief.title(), brief.text(), brief.spec(), by);
        ChangeService.ChangeDetail change;
        try {
            change = changes.create(requirement.id(), by);
        } catch (RuntimeException e) {
            // The change could not start (the workspace is busy, or its code is not imported): the requirement goes too
            try {
                requirements.delete(requirement.id());
            } catch (RuntimeException cleanup) {
                log.warn("Could not remove the requirement {} of a run that did not start", requirement.id(), cleanup);
            }
            throw e;
        }
        Run run = store.insertRun(new Run(UUID.randomUUID(), workspaceId, path, subject, brief.screens(), technology, requirement.id(), change.id(),
                false, null, by, OffsetDateTime.now(), null, null, null));
        return modernization.view(run);
    }

    // --- premium packs in the code ---

    /**
     * A pack in a workspace's code. installed: the version whose change was delivered (null: never). pending: a version
     * on its way, with its run's change and state (null: none).
     */
    public record PackState(String pack, String installed, String pending, UUID pendingRun, UUID pendingChange, String pendingState,
                            String startedBy, OffsetDateTime startedAt) {
    }

    public List<PackState> packStates(UUID workspaceId) {
        List<ModernizationStore.PackInstall> installs = store.installs(workspaceId);
        return registry.packs().stream().map(p -> {
            String installed = null;
            ModernizationStore.PackInstall pending = null;
            String pendingState = null;
            UUID pendingChange = null;
            for (ModernizationStore.PackInstall i : installs) {
                if (!i.pack().equals(p.id())) {
                    continue;
                }
                Run run = store.run(i.runId()).orElse(null);
                ModernizationService.RunView view = run == null ? null : modernization.view(run);
                if (view != null && "delivered".equals(view.state())) {
                    if (installed == null) {
                        installed = i.version();
                    }
                } else if (view != null && view.open() && pending == null && installed == null) {
                    pending = i;
                    pendingState = view.state();
                    pendingChange = view.changeId();
                }
            }
            return new PackState(p.id(), installed, pending == null ? null : pending.version(), pending == null ? null : pending.runId(), pendingChange,
                    pendingState, pending == null ? null : pending.startedBy(), pending == null ? null : pending.startedAt());
        }).toList();
    }

    /** One line of a pack's compatibility check: ok, warn or info, and what it found. */
    public record CompatibilityLine(String state, String text) {
    }

    /** Component libraries that would fight the premium pack for the same screens, by the name their code uses. */
    private static final List<String[]> OTHER_LIBRARIES = List.of(new String[]{"@angular/material", "Angular Material"},
            new String[]{"primeng", "PrimeNG"}, new String[]{"@mui/material", "MUI"}, new String[]{"antd", "Ant Design"},
            new String[]{"react-native-paper", "React Native Paper"}, new String[]{"@oracle/oraclejet-core-pack", "the JET Core Pack"},
            new String[]{"bootstrap.min.css", "Bootstrap"});

    /**
     * Checks a pack against a workspace: the framework version (for the premium JET pack, the JET release the scan found),
     * other component libraries in the code, and how many of the pack's built components passed every gate.
     */
    public List<CompatibilityLine> compatibility(UUID workspaceId, String packId, ComponentPackService.JetFact jet,
                                                 org.springframework.jdbc.core.JdbcTemplate jdbc) {
        ComponentRegistry.Pack pack = registry.pack(packId);
        if (pack == null) {
            throw new NotFoundException("There is no pack " + packId + ".");
        }
        List<CompatibilityLine> out = new java.util.ArrayList<>();
        if ("jet-premium".equals(packId)) {
            ComponentPackService.JetTarget t = packs.jetTarget(jet);
            boolean ok = t.major() != null && t.note().indexOf("older than") < 0;
            out.add(new CompatibilityLine(ok ? "ok" : "warn", t.note()));
        } else {
            TargetService.WorkspaceTarget target = targets.get(workspaceId);
            boolean same = target != null && packId.equals(target.target());
            out.add(new CompatibilityLine(same ? "ok" : "info", same ? "The workspace builds a " + pack.name() + " app (" + pack.frameworkRange()
                    + "): new screens use this pack." : "The workspace does not build a " + pack.name() + " app yet; choose it in the Technology catalogue to use this pack."));
        }
        List<String> found = new java.util.ArrayList<>();
        for (String[] lib : OTHER_LIBRARIES) {
            if (lib[0].equals("@oracle/oraclejet-core-pack") && "jet-premium".equals(packId)) {
                continue;
            }
            Integer n = jdbc.queryForObject("SELECT count(*) FROM code_chunk WHERE workspace_id = ? AND content LIKE ?", Integer.class, workspaceId,
                    "%" + lib[0] + "%");
            if (n != null && n > 0) {
                found.add(lib[1]);
            }
        }
        out.add(found.isEmpty() ? new CompatibilityLine("ok", "No other component library in the code index.")
                : new CompatibilityLine("warn", "The code also uses " + String.join(", ", found) + ": screens that use it keep it until a wave replaces them."));
        long built = pack.built().size();
        long passed = registry.categories().stream().flatMap(c -> c.components().stream())
                .filter(e -> "available".equals(packs.inPack(e, pack).readiness())).count();
        out.add(new CompatibilityLine(passed == built && built > 0 ? "ok" : "info", passed + " of " + built + " built components passed every gate."));
        return out;
    }

    /**
     * Installs the premium JET pack in the bank's UI, or upgrades it to the factory's version, through a change for
     * review: the change writes the pack's files as shipped and loads them once. Only a pack whose foundation set passed
     * every check can go in; the other packs come with their target pack's starter.
     */
    public ModernizationService.RunView installPack(UUID workspaceId, String packId, String by) {
        ComponentRegistry.Pack pack = registry.pack(packId);
        if (pack == null) {
            throw new NotFoundException("There is no pack " + packId + ".");
        }
        if (!"jet-premium".equals(packId)) {
            throw new BadRequestException(pack.name() + " comes with its target pack's starter: new " + pack.name() + " apps start with it, so there is nothing to install in the JET code.");
        }
        List<String> notReady = registry.categories().stream().flatMap(c -> c.components().stream()).filter(ComponentRegistry.Entry::foundation)
                .filter(e -> !"available".equals(packs.inPack(e, pack).readiness())).map(ComponentRegistry.Entry::name).toList();
        if (!notReady.isEmpty()) {
            throw new BadRequestException(pack.name() + " is a preview: it can be installed once its foundation set passes every check ("
                    + notReady.size() + " not yet: " + String.join(", ", notReady.subList(0, Math.min(3, notReady.size()))) + ").");
        }
        PackState state = packStates(workspaceId).stream().filter(s -> s.pack().equals(packId)).findFirst().orElseThrow();
        if (state.pending() != null) {
            throw new BadRequestException(pack.packageName() + " " + state.pending() + " is waiting for review already. Open its change to see it.");
        }
        if (pack.version().equals(state.installed())) {
            throw new BadRequestException(pack.packageName() + " " + pack.version() + " is installed already.");
        }
        ComponentPackService.Choice c = styles.get(workspaceId).style().defaults();
        String classes = "bx-theme bx-look-" + c.look() + (c.motion() == null ? "" : " bx-motion-hover-" + c.motion().hover() + " bx-motion-click-"
                + c.motion().click() + " bx-motion-scroll-" + c.motion().scroll()).replaceAll(" bx-motion-[a-z]+-none", "") + ("dark".equals(c.mode()) ? " bx-dark" : "");
        RunBriefs.Brief brief = RunBriefs.installPack(pack.packageName(), pack.version(), state.installed(), PackFiles.JET_PREMIUM, classes);
        ModernizationService.RunView run = begin(workspaceId, "ui", brief.title(), brief, null, by);
        store.insertInstall(workspaceId, new ModernizationStore.PackInstall(packId, pack.version(), state.installed(), run.id(), by, OffsetDateTime.now()));
        return run;
    }

    /** Starts a wave of the saved upgrade plan as a run, once the wave before it is delivered. */
    public ModernizationService.RunView startWave(UUID workspaceId, String key, String by) {
        ModernizationService.UpgradePlanView plan = modernization.upgradePlan(workspaceId, List.of());
        ModernizationService.WaveView wave = plan.waves().stream().filter(w -> w.key().equals(key)).findFirst()
                .orElseThrow(() -> new NotFoundException("There is no wave " + key + " in the plan. Save the plan first."));
        if (!wave.canStart()) {
            throw new BadRequestException(wave.waitsFor() != null ? wave.waitsFor() + "." : "Wave " + wave.n() + " is " + wave.state() + " already.");
        }
        ModernizationService.RunView run = start(workspaceId, new RunRequest("ui", wave.components(),
                wave.screens().stream().map(UpgradePlans.ScreenUse::id).toList(), "Wave " + wave.n() + ": " + wave.name(), null), by);
        modernization.recordWaveRun(workspaceId, key, run.id(), by);
        return run;
    }

    /** Starts the next module of the saved migration plan: the first in the plan, in order, with no open or delivered run. */
    public ModernizationService.RunView startNextModule(UUID workspaceId, String module, String by) {
        ModernizationService.Planner planner = modernization.planner(workspaceId);
        ModernizationService.PlannerModule next = planner.modules().stream()
                .filter(m -> module == null || module.isBlank() ? m.inPlan() && !"delivered".equals(m.state()) && !"in-progress".equals(m.state()) : m.name().equals(module))
                .findFirst().orElseThrow(() -> new BadRequestException(module == null ? "Every module in the plan is started or delivered." : "There is no module " + module + " in the plan."));
        if ("in-progress".equals(next.state()) || "delivered".equals(next.state())) {
            throw new BadRequestException(next.name() + " is " + ("delivered".equals(next.state()) ? "delivered" : "being built") + " already.");
        }
        return start(workspaceId, new RunRequest("migration", null, null, null, next.name()), by);
    }

    /** A JET element used on the run's screens and what it becomes. */
    public record ComponentUse(String element, String premium, String compatibility, int uses) {
    }

    /** A module the run's module needs, and whether it is moved yet (migration path). */
    public record Dependency(String module, String state) {
    }

    /** One OBDX rule with the result of the factory's checks on the change's files: passed, failed or not-run. */
    public record RuleResult(String id, String text, String result, List<String> failing) {
    }

    public record RunDetail(ModernizationService.RunView run, String brief, List<ComponentUse> components, List<Dependency> dependencies,
                            List<RuleResult> rules, List<String> calls, List<String> screenNames) {
    }

    public RunDetail detail(UUID workspaceId, UUID runId) {
        Run run = run(workspaceId, runId);
        ModernizationService.RunView view = modernization.view(run);
        String brief = null;
        if (run.requirementId() != null) {
            try {
                brief = requirements.get(run.requirementId()).documentText();
            } catch (RuntimeException e) {
                brief = null;
            }
        }
        Inventory inventory = modernization.inventory(workspaceId);
        java.util.Set<String> ids = java.util.Set.copyOf(run.screens());
        java.util.Map<String, Integer> uses = new java.util.TreeMap<>();
        inventory.screens().stream().filter(s -> ids.contains(s.id()) && s.elements() != null).forEach(s -> s.elements().forEach((k, v) -> {
            if (!ComponentInventory.KEPT.contains(k)) {
                uses.merge(k, v, Integer::sum);
            }
        }));
        List<ComponentUse> components = uses.entrySet().stream().map(e -> {
            ComponentRegistry.JetMapping m = registry.jetMapping(e.getKey());
            ComponentRegistry.Entry target = m == null || m.target() == null ? null : registry.component(m.target());
            String premium = target == null ? null : target.names().get("migration".equals(run.path()) && run.technology() != null
                    && target.names().containsKey(run.technology()) ? run.technology() : "jet-premium");
            return new ComponentUse(e.getKey(), premium, ComponentInventory.compatibility(m == null ? null : m.status()), e.getValue());
        }).sorted(java.util.Comparator.comparingInt(ComponentUse::uses).reversed()).toList();
        List<Dependency> dependencies = new java.util.ArrayList<>();
        if ("migration".equals(run.path())) {
            MigrationPlans.ModuleFacts facts = MigrationPlans.modules(inventory).get(run.subject());
            if (facts != null) {
                java.util.Map<String, String> states = new java.util.HashMap<>();
                modernization.planner(workspaceId).modules().forEach(m -> states.put(m.name(), m.state()));
                facts.needs().forEach(n -> dependencies.add(new Dependency(n, states.getOrDefault(n, "not-started"))));
            }
        }
        List<RuleResult> rules = new java.util.ArrayList<>();
        ChangeService.ChangeDetail change = null;
        if (run.changeId() != null) {
            try {
                change = changes.get(run.changeId());
            } catch (RuntimeException e) {
                change = null;
            }
        }
        List<String> failing = change == null ? List.of() : change.files().stream()
                .filter(f -> f.checkStatus() != null && "FAILED".equals(f.checkStatus().name())).map(ChangeService.FileView::path).toList();
        boolean checked = change != null && change.files().stream().anyMatch(f -> f.checkStatus() != null && !"NOT_CHECKED".equals(f.checkStatus().name()));
        for (String[] rule : RunBriefs.OBDX_RULES) {
            rules.add(new RuleResult(rule[0], rule[1], !checked ? "not-run" : failing.isEmpty() ? "passed" : "failed", failing));
        }
        java.util.Set<String> calls = new java.util.LinkedHashSet<>();
        List<String> names = new java.util.ArrayList<>();
        inventory.screens().stream().filter(s -> ids.contains(s.id())).forEach(s -> { calls.addAll(s.calls()); names.add(s.name()); });
        return new RunDetail(view, brief, components, dependencies, rules, List.copyOf(calls), names);
    }

    /** Every run as CSV for History's Download report (Excel-friendly, UTF-8 with BOM). */
    public String historyCsv(UUID workspaceId) {
        StringBuilder csv = new StringBuilder("\uFEFFStarted,Path,Subject,Technology,Change,State,Delivered revision,Started by,Reason\r\n");
        for (ModernizationService.RunView v : modernization.runs(workspaceId)) {
            csv.append(String.join(",", v.startedAt() == null ? "" : v.startedAt().toString(), v.path(), ModernizationService.cell(v.subject()),
                    ModernizationService.cell(v.technology()), ModernizationService.cell(v.changeTitle()), v.state(),
                    v.deliveredRevision() == null ? "" : "r" + v.deliveredRevision(), ModernizationService.cell(v.startedBy()),
                    ModernizationService.cell("rejected".equals(v.state()) ? v.message() : null))).append("\r\n");
        }
        return csv.toString();
    }

    /** The logs of the chosen runs (all when none is chosen) as a zip: one text file per run with its change's history and builds. */
    public byte[] logsZip(UUID workspaceId, List<UUID> runIds) {
        java.io.ByteArrayOutputStream bytes = new java.io.ByteArrayOutputStream();
        try (java.util.zip.ZipOutputStream zip = new java.util.zip.ZipOutputStream(bytes, java.nio.charset.StandardCharsets.UTF_8)) {
            for (ModernizationService.RunView v : modernization.runs(workspaceId)) {
                if (runIds != null && !runIds.isEmpty() && !runIds.contains(v.id())) {
                    continue;
                }
                StringBuilder log = new StringBuilder(v.subject()).append("\n").append(v.path()).append(" path, started ").append(v.startedAt())
                        .append(" by ").append(v.startedBy()).append(", ").append(v.state()).append("\n\n");
                if (v.changeId() != null) {
                    try {
                        ChangeService.ChangeDetail c = changes.get(v.changeId());
                        log.append("Change: ").append(c.title()).append(" (").append(c.status()).append(")\n");
                        c.events().forEach(e -> log.append(e.at()).append("  ").append(e.by() == null ? "" : e.by() + ": ").append(e.text()).append("\n"));
                        c.builds().forEach(b -> log.append("\nBuild round ").append(b.round()).append(" ").append(b.buildNumber() == null ? "" : "#" + b.buildNumber())
                                .append(": ").append(b.result()).append("\n").append(b.logExcerpt() == null ? "" : b.logExcerpt()).append("\n"));
                    } catch (RuntimeException e) {
                        log.append("The change is gone: ").append(e.getMessage()).append("\n");
                    }
                }
                String name = (v.startedAt() == null ? "run" : v.startedAt().toLocalDate().toString()) + "-" + v.subject().replaceAll("[^A-Za-z0-9._-]+", "-") + "-" + v.id().toString().substring(0, 8) + ".txt";
                zip.putNextEntry(new java.util.zip.ZipEntry(name));
                zip.write(log.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8));
                zip.closeEntry();
            }
        } catch (java.io.IOException e) {
            throw new java.io.UncheckedIOException(e);
        }
        return bytes.toByteArray();
    }

    public ModernizationService.RunView get(UUID workspaceId, UUID runId) {
        return modernization.view(run(workspaceId, runId));
    }

    /** Rejects a run: its change is closed as abandoned and not delivered; the reason is kept and shown in History. */
    public ModernizationService.RunView reject(UUID workspaceId, UUID runId, String reason, String by) {
        Run run = run(workspaceId, runId);
        if (reason == null || reason.isBlank()) {
            throw new BadRequestException("Say why the run is rejected; the reason is kept with it.");
        }
        ModernizationService.RunView view = modernization.view(run);
        if ("delivered".equals(view.state())) {
            throw new BadRequestException("This run is delivered to SVN already; it cannot be rejected.");
        }
        if (run.changeId() != null && view.changeStatus() != null && !"CLOSED".equals(view.changeStatus()) && !"ANALYZING".equals(view.changeStatus())
                && !"GENERATING".equals(view.changeStatus())) {
            branches.close(run.changeId(), ChangeRequest.CloseReason.ABANDONED, false, by);
        }
        store.finish(runId, true, reason.strip());
        return modernization.view(store.run(runId).orElseThrow());
    }

    /** Signs off (or withdraws) the security review of a run that is not delivered or rejected. */
    public ModernizationService.RunView securityReview(UUID workspaceId, UUID runId, boolean done, String by) {
        Run run = run(workspaceId, runId);
        ModernizationService.RunView view = modernization.view(run);
        if ("delivered".equals(view.state()) || "rejected".equals(view.state())) {
            throw new BadRequestException("This run is " + view.state() + "; its review is closed.");
        }
        store.securityReview(runId, done ? by : null);
        return modernization.view(store.run(runId).orElseThrow());
    }

    Run run(UUID workspaceId, UUID runId) {
        Run run = store.run(runId).orElseThrow(() -> new NotFoundException("Run not found: " + runId));
        if (!run.workspaceId().equals(workspaceId)) {
            throw new NotFoundException("Run not found: " + runId);
        }
        return run;
    }
}
