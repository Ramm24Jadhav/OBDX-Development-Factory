package com.obdx.factory.modernization;

import com.obdx.factory.auth.AuditLog;
import com.obdx.factory.change.ChangeRequest;
import com.obdx.factory.change.ChangeRequestRepository;
import com.obdx.factory.common.BadRequestException;
import com.obdx.factory.common.NotFoundException;
import com.obdx.factory.componentpack.ComponentRegistry;
import com.obdx.factory.componentpack.ComponentRegistry.JetMapping;
import com.obdx.factory.componentpack.ComponentRegistry.Part;
import com.obdx.factory.importing.StorageProperties;
import com.obdx.factory.modernization.ModernizationStore.Choice;
import com.obdx.factory.modernization.ModernizationStore.Run;
import com.obdx.factory.target.TargetService;
import com.obdx.factory.workspace.Workspace;
import com.obdx.factory.workspace.WorkspaceRepository;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.TreeMap;
import java.util.UUID;

/**
 * What the Modernization screens show and save (docs/MODERNIZATION.md): the Overview, the path choice, the UI path's
 * component inventory and mapping, and the state of the runs. Numbers come from the stored code analysis, the pack
 * registry and the runs' changes; nothing is estimated.
 */
@Service
public class ModernizationService {

    static final Set<String> PATHS = Set.of("ui", "migration");
    static final Set<String> SCOPES = Set.of("all", "some");
    static final Set<String> MODES = Set.of("agent", "plan");
    static final Set<String> ANALYSES = Set.of("latest", "new");
    static final List<String> ACTIVITY = List.of("INVENTORY_SCANNED", "MODERNIZATION_PATH_SAVED", "MODERNIZATION_PATH_STARTED",
            "MODERNIZATION_PLAN_SAVED", "MODERNIZATION_RUN_STARTED", "MODERNIZATION_RUN_REJECTED", "MODERNIZATION_SETTINGS_SAVED",
            "CHANGE_DELIVERED", "COMPONENT_STYLE_SAVED");

    private final InventoryService inventories;
    private final ComponentRegistry registry;
    private final ModernizationStore store;
    private final ChangeRequestRepository changes;
    private final WorkspaceRepository workspaces;
    private final StorageProperties storage;
    private final AuditLog audit;
    private final TargetService targets;

    public ModernizationService(InventoryService inventories, ComponentRegistry registry, ModernizationStore store, ChangeRequestRepository changes,
                                WorkspaceRepository workspaces, StorageProperties storage, AuditLog audit, TargetService targets) {
        this.targets = targets;
        this.inventories = inventories;
        this.registry = registry;
        this.store = store;
        this.changes = changes;
        this.workspaces = workspaces;
        this.storage = storage;
        this.audit = audit;
    }

    // --- Overview ---

    /** upToDate: the analysis was made at the workspace's imported revision. */
    public record Analysis(boolean done, Long revision, Long codeRevision, boolean upToDate, OffsetDateTime at, boolean counted) {
    }

    /** One number at the top of Overview; percent is of the components found (null for counts that are not shares). */
    public record Kpi(String id, String label, int value, Integer percent) {
    }

    /** A path card: whether it has begun, what is delivered of what, and the button. */
    public record PathCard(String id, boolean chosen, String state, int delivered, int of, String unit, int percent, String note) {
    }

    /** A finding of the analysis and the screen it is about (a route). */
    public record Insight(String text, String route, String tone) {
    }

    public record ModuleStates(int done, int inProgress, int planned, int notStarted, int total) {
    }

    public record Activity(String what, String by, OffsetDateTime at) {
    }

    /** A module of the analysis with its screens, for the scope of a path. */
    public record ModuleInfo(String name, int screens) {
    }

    /** The workspace the overview is for: its name, bank, OBDX version, SVN URL and target app (target and app folder). */
    public record WorkspaceInfo(String name, String bank, String obdxVersion, String svnUrl, String target, String appFolder) {
    }

    public record Overview(String workspace, WorkspaceInfo info, Analysis analysis, List<Kpi> kpis, List<PathCard> paths, List<Insight> insights,
                           ModuleStates modules, List<ModuleInfo> moduleList, List<Activity> activity, Choice choice) {
    }

    public Overview overview(UUID workspaceId) {
        Workspace workspace = workspace(workspaceId);
        Optional<Inventory> found = inventories.find(workspaceId);
        Optional<Choice> choice = store.choice(workspaceId);
        List<RunView> runs = runs(workspaceId);
        List<Activity> activity = audit.recent(workspaceId, ACTIVITY, 6).stream()
                .map(e -> new Activity(activityText(e.action(), e.target(), e.detail()), e.username(), e.at())).toList();
        WorkspaceInfo info = new WorkspaceInfo(workspace.getName(), workspace.getBankName(), workspace.getObdxVersion(), workspace.getSvnUrl(),
                workspace.getTarget(), workspace.getAppFolder());
        if (found.isEmpty()) {
            return new Overview(workspace.getName(), info, new Analysis(false, null, workspace.getIndexedRevision(), false, null, false), List.of(),
                    List.of(new PathCard("ui", isPath(choice, "ui"), state(choice, "ui"), 0, 0, "screens", 0, null),
                            new PathCard("migration", isPath(choice, "migration"), state(choice, "migration"), 0, 0, "modules", 0, null)),
                    List.of(), new ModuleStates(0, 0, 0, 0, 0), List.of(), activity, choice.orElse(null));
        }
        Inventory inventory = found.get();
        ComponentInventory.View components = ComponentInventory.of(inventory, registry);
        ComponentInventory.Totals t = components.totals();
        Analysis analysis = new Analysis(true, inventory.revision(), workspace.getIndexedRevision(),
                inventory.revision() != null && inventory.revision().equals(workspace.getIndexedRevision()), inventory.scannedAt(), components.counted());
        List<Kpi> kpis = List.of(new Kpi("modules", "Modules", inventory.summary().modules(), null),
                new Kpi("screens", "Screens analysed", inventory.summary().screens(), null),
                new Kpi("components", "Components found", t.uses(), null),
                new Kpi("direct", "Direct replacements", t.direct(), percent(t.direct(), t.uses())),
                new Kpi("mapping", "Need mapping", t.mapping(), percent(t.mapping(), t.uses())),
                new Kpi("custom", "Custom or not covered", t.custom(), percent(t.custom(), t.uses())));

        Set<String> deliveredScreens = new LinkedHashSet<>();
        Set<String> deliveredModules = new LinkedHashSet<>();
        Set<String> openModules = new LinkedHashSet<>();
        for (RunView r : runs) {
            if ("delivered".equals(r.state())) {
                if ("ui".equals(r.path())) {
                    deliveredScreens.addAll(r.screens());
                } else {
                    deliveredModules.add(r.subject());
                }
            } else if (r.open()) {
                openModules.addAll(modulesOf(inventory, r));
            }
        }
        int screens = inventory.summary().screens();
        int modules = inventory.summary().modules();
        int screensDone = (int) inventory.screens().stream().filter(s -> deliveredScreens.contains(s.id())).count();
        List<PathCard> paths = List.of(
                new PathCard("ui", isPath(choice, "ui"), state(choice, "ui"), screensDone, screens, "screens", percent0(screensDone, screens),
                        screensDone + " of " + screens + " screens upgraded and delivered."),
                new PathCard("migration", isPath(choice, "migration"), state(choice, "migration"), deliveredModules.size(), modules, "modules",
                        percent0(deliveredModules.size(), modules), deliveredModules.size() + " of " + modules + " modules moved and delivered."));

        // A module is done when every screen of it is delivered (UI path) or the module itself is (migration)
        Map<String, List<Inventory.Screen>> byModule = new TreeMap<>();
        inventory.screens().forEach(s -> byModule.computeIfAbsent(s.module(), k -> new ArrayList<>()).add(s));
        Set<String> planned = plannedModules(workspaceId);
        int done = 0;
        int inProgress = 0;
        int plannedCount = 0;
        for (Map.Entry<String, List<Inventory.Screen>> m : byModule.entrySet()) {
            boolean moduleDone = deliveredModules.contains(m.getKey()) || m.getValue().stream().allMatch(s -> deliveredScreens.contains(s.id()));
            if (moduleDone) {
                done++;
            } else if (openModules.contains(m.getKey())) {
                inProgress++;
            } else if (planned.contains(m.getKey())) {
                plannedCount++;
            }
        }
        ModuleStates states = new ModuleStates(done, inProgress, plannedCount, byModule.size() - done - inProgress - plannedCount, byModule.size());
        List<ModuleInfo> moduleList = inventory.modules().stream().map(m -> new ModuleInfo(m.name(), m.screens())).toList();
        return new Overview(workspace.getName(), info, analysis, kpis, paths, insights(inventory, components), states, moduleList, activity, choice.orElse(null));
    }

    static List<Insight> insights(Inventory inventory, ComponentInventory.View components) {
        List<Insight> out = new ArrayList<>();
        ComponentInventory.Totals t = components.totals();
        if (!components.counted()) {
            out.add(new Insight("Analyze again to count the JET components: this analysis was made before they were counted", null, "warning"));
            return out;
        }
        if (t.uses() > 0) {
            int direct = percent0(t.direct(), t.uses());
            out.add(direct >= 50 ? new Insight("Start with the component upgrade: " + direct + "% of the components have a direct premium replacement",
                    "modernization-path", "primary") : new Insight("Only " + direct + "% of the components have a direct premium replacement; "
                    + "look at the mapping before choosing a path", "modernization-components", "warning"));
        }
        long directTypes = components.rows().stream().filter(r -> r.compatibility().equals("direct")).count();
        long mappingTypes = components.rows().stream().filter(r -> r.compatibility().equals("mapping")).count();
        long customTypes = components.rows().stream().filter(r -> r.compatibility().equals("custom")).count();
        if (directTypes > 0) {
            out.add(new Insight(directTypes + (directTypes == 1 ? " component can" : " components can") + " be replaced directly with the premium pack's",
                    "modernization-components?compatibility=direct", "warning"));
        }
        if (mappingTypes > 0) {
            out.add(new Insight(mappingTypes + (mappingTypes == 1 ? " component needs its" : " components need their") + " properties or events mapped",
                    "modernization-mapping", "primary"));
        }
        if (customTypes > 0) {
            out.add(new Insight(customTypes + (customTypes == 1 ? " component needs" : " components need") + " a custom build or stays JET",
                    "modernization-components?compatibility=custom", "danger"));
        }
        // The modules with the most work: the sum of their screens' scores
        Map<String, Integer> score = new TreeMap<>();
        inventory.screens().forEach(s -> score.merge(s.module(), s.score(), Integer::sum));
        List<String> hardest = score.entrySet().stream().sorted(Map.Entry.<String, Integer>comparingByValue().reversed()).limit(2).map(Map.Entry::getKey).toList();
        if (hardest.size() == 2 && inventory.summary().modules() > 2) {
            out.add(new Insight(hardest.get(0) + " and " + hardest.get(1) + " are the largest modules to migrate", "modernization-planner", "info"));
        }
        return out;
    }

    private static String activityText(String action, String target, String detail) {
        return switch (action) {
            case "INVENTORY_SCANNED" -> "Code analysis finished at " + target + (detail == null ? "" : ": " + detail);
            case "MODERNIZATION_PATH_SAVED" -> "Path saved as a draft: " + detail;
            case "MODERNIZATION_PATH_STARTED" -> "Modernization started: " + detail;
            case "MODERNIZATION_PLAN_SAVED" -> "Plan saved: " + detail;
            case "MODERNIZATION_RUN_STARTED" -> "Started " + target;
            case "MODERNIZATION_RUN_REJECTED" -> "Rejected " + target;
            case "MODERNIZATION_SETTINGS_SAVED" -> "Technology settings saved for " + target;
            case "CHANGE_DELIVERED" -> "Change delivered to SVN" + (detail == null ? "" : ", " + detail);
            case "COMPONENT_STYLE_SAVED" -> "Component style saved: " + target;
            default -> action;
        };
    }

    private static boolean isPath(Optional<Choice> choice, String path) {
        return choice.isPresent() && choice.get().path().equals(path);
    }

    /** none, draft or started for a path card. */
    private static String state(Optional<Choice> choice, String path) {
        return isPath(choice, path) ? choice.get().state() : "none";
    }

    static Integer percent(int part, int whole) {
        return whole == 0 ? null : Math.round(100f * part / whole);
    }

    static int percent0(int part, int whole) {
        return whole == 0 ? 0 : Math.round(100f * part / whole);
    }

    private Set<String> plannedModules(UUID workspaceId) {
        Set<String> out = new LinkedHashSet<>();
        store.plan(workspaceId, "migration").ifPresent(p -> p.plan().path("modules").forEach(m -> {
            if (m.path("inPlan").asBoolean(true)) {
                out.add(m.path("name").asString());
            }
        }));
        store.plan(workspaceId, "ui").ifPresent(p -> {
            List<String> off = strings(p.plan().path("off"));
            List<String> included = strings(p.plan().path("components")).stream().filter(c -> !off.contains(c)).toList();
            inventories.find(workspaceId).ifPresent(inv -> UpgradePlans.waves(inv, included, "module").forEach(d -> out.addAll(d.modules())));
        });
        return out;
    }

    private static Set<String> modulesOf(Inventory inventory, RunView r) {
        if ("migration".equals(r.path())) {
            return Set.of(r.subject());
        }
        Set<String> ids = Set.copyOf(r.screens());
        Set<String> out = new LinkedHashSet<>();
        inventory.screens().stream().filter(s -> ids.contains(s.id())).forEach(s -> out.add(s.module()));
        return out;
    }

    // --- path choice ---

    /** What Choose a path sends: state draft (Save as draft) or started (Continue). */
    public record ChoiceRequest(String path, String scope, List<String> modules, String mode, String analysis, String technology, String state) {
    }

    public Choice choice(UUID workspaceId) {
        workspace(workspaceId);
        return store.choice(workspaceId).orElse(null);
    }

    public Choice saveChoice(UUID workspaceId, ChoiceRequest r, String by) {
        workspace(workspaceId);
        if (r == null || !PATHS.contains(r.path())) {
            throw new BadRequestException("Choose a path: modernize the OBDX UI (ui) or migrate to a modern technology (migration).");
        }
        one("scope", r.scope(), SCOPES);
        one("how it runs", r.mode(), MODES);
        one("analysis", r.analysis(), ANALYSES);
        if (!"draft".equals(r.state()) && !"started".equals(r.state())) {
            throw new BadRequestException("Send state draft (Save as draft) or started (Continue).");
        }
        List<String> modules = r.modules() == null ? List.of() : List.copyOf(new LinkedHashSet<>(r.modules()));
        if ("some".equals(r.scope())) {
            if (modules.isEmpty()) {
                throw new BadRequestException("Choose at least one module, or set the scope to the whole channel.");
            }
            Set<String> known = new LinkedHashSet<>();
            inventories.find(workspaceId).ifPresent(i -> i.modules().forEach(m -> known.add(m.name())));
            List<String> unknown = modules.stream().filter(m -> !known.contains(m)).toList();
            if (!known.isEmpty() && !unknown.isEmpty()) {
                throw new BadRequestException("These modules are not in the analysis: " + String.join(", ", unknown) + ". Analyze again or choose others.");
            }
        }
        Optional<Choice> before = store.choice(workspaceId);
        OffsetDateTime now = OffsetDateTime.now();
        OffsetDateTime started = "started".equals(r.state()) ? before.map(Choice::startedAt).filter(x -> before.get().path().equals(r.path())).orElse(now) : null;
        Choice saved = store.saveChoice(workspaceId, new Choice(r.path(), r.scope(), "some".equals(r.scope()) ? modules : List.of(), r.mode(), r.analysis(),
                r.technology() == null || r.technology().isBlank() ? null : r.technology().strip(), r.state(), by, now, started));
        audit.record("started".equals(r.state()) ? "MODERNIZATION_PATH_STARTED" : "MODERNIZATION_PATH_SAVED", workspaceId, r.path(),
                ("ui".equals(r.path()) ? "Modernize the OBDX UI" : "Migrate to a modern technology") + ("some".equals(r.scope()) ? ", " + modules.size()
                        + (modules.size() == 1 ? " module" : " modules") : ", whole channel"));
        return saved;
    }

    private static void one(String what, String value, Set<String> allowed) {
        if (value == null || !allowed.contains(value)) {
            throw new BadRequestException("Choose the " + what + ": one of " + allowed.stream().sorted().toList() + ".");
        }
    }

    // --- component inventory and mapping ---

    public ComponentInventory.View components(UUID workspaceId) {
        return ComponentInventory.of(inventory(workspaceId), registry);
    }

    /** The inventory's rows as CSV (Excel-friendly, UTF-8 with BOM): the current filter is applied by the page. */
    public String componentsCsv(UUID workspaceId, String compatibility, String category) {
        StringBuilder csv = new StringBuilder("﻿JET component,Category,Uses,Screens,Modules,Premium component,Mapping,Compatibility,Effort\r\n");
        for (ComponentInventory.Row r : components(workspaceId).rows()) {
            if (compatibility != null && !compatibility.isBlank() && !"all".equals(compatibility) && !compatibility.equals(r.compatibility())) {
                continue;
            }
            if (category != null && !category.isBlank() && !"all".equals(category) && !category.equals(r.category())) {
                continue;
            }
            csv.append(String.join(",", cell(r.element()), cell(r.category()), String.valueOf(r.uses()), String.valueOf(r.screens()),
                    cell(String.join("; ", r.modules())), cell(r.premium()), cell(r.status()), cell(r.compatibility()), cell(r.effort()))).append("\r\n");
        }
        return csv.toString();
    }

    static String cell(String value) {
        if (value == null) {
            return "";
        }
        String v = value.startsWith("=") || value.startsWith("+") || value.startsWith("-") || value.startsWith("@") ? "'" + value : value;
        return v.contains(",") || v.contains("\"") || v.contains("\n") ? "\"" + v.replace("\"", "\"\"") + "\"" : v;
    }

    /** kind: same, renamed, converted (same name, the value changes), dropped (optional, not carried over) or hand (a person). */
    public record PartView(String from, String to, String kind, String note) {
    }

    public record ScreenRef(String id, String name, int uses) {
    }

    public record ModuleScreens(String module, int uses, List<ScreenRef> screens) {
    }

    public record Journey(String name, int screens) {
    }

    /** same, renamed, needs a hand edit, not supported: the property legend. */
    public record Legend(int same, int renamed, int hand, int unsupported) {
    }

    public record MappingDetail(String element, String premium, String component, String componentName, String status, String compatibility,
                                String effort, int position, int count, String previous, String next, List<PartView> properties,
                                List<PartView> events, List<String> slots, String binding, String accessibility, String styling,
                                List<String> manual, String confidence, String evidence, int uses, int screens, List<ModuleScreens> modules,
                                List<Journey> journeys, List<String> tests, String codeFrom, String codeJet, String codePremium,
                                List<String> checks, Legend legend) {
    }

    public MappingDetail mapping(UUID workspaceId, String element) {
        Inventory inventory = inventory(workspaceId);
        ComponentInventory.View view = ComponentInventory.of(inventory, registry);
        List<ComponentInventory.Row> rows = view.rows();
        if (rows.isEmpty()) {
            throw new NotFoundException("The analysis found no JET components in this workspace's screens.");
        }
        int at = 0;
        if (element != null && !element.isBlank()) {
            at = -1;
            for (int i = 0; i < rows.size(); i++) {
                if (rows.get(i).element().equals(element)) {
                    at = i;
                }
            }
            if (at < 0) {
                throw new NotFoundException(element + " is not used in this workspace's screens.");
            }
        }
        ComponentInventory.Row row = rows.get(at);
        JetMapping m = registry.jetMapping(row.element());
        ComponentRegistry.Entry target = row.component() == null ? null : registry.component(row.component());
        String premiumTag = target == null ? null : target.names().get("jet-premium");

        List<PartView> props = m == null ? List.of() : m.properties().stream().map(p -> part(p, m)).toList();
        List<PartView> events = m == null ? List.of() : m.events().stream().map(p -> part(p, m)).toList();
        Legend legend = new Legend((int) props.stream().filter(p -> p.kind().equals("same")).count(),
                (int) props.stream().filter(p -> p.kind().equals("renamed") || p.kind().equals("converted")).count(),
                (int) props.stream().filter(p -> p.kind().equals("hand")).count(), (int) props.stream().filter(p -> p.kind().equals("dropped")).count());

        // Where it is used: screens by module, the journeys through them, the test files
        Map<String, List<ScreenRef>> byModule = new LinkedHashMap<>();
        Set<String> screenIds = new LinkedHashSet<>();
        inventory.screens().stream().filter(s -> s.elements() != null && s.elements().containsKey(row.element()))
                .sorted(Comparator.comparing(Inventory.Screen::module).thenComparing(Inventory.Screen::name)).forEach(s -> {
                    byModule.computeIfAbsent(s.module(), k -> new ArrayList<>()).add(new ScreenRef(s.id(), s.name(), s.elements().get(row.element())));
                    screenIds.add(s.id());
                });
        List<ModuleScreens> modules = byModule.entrySet().stream().map(e -> new ModuleScreens(e.getKey(), e.getValue().stream().mapToInt(ScreenRef::uses).sum(),
                e.getValue())).sorted(Comparator.comparingInt(ModuleScreens::uses).reversed()).toList();
        List<Journey> journeys = inventory.flows().stream().map(f -> new Journey(f.name(), (int) f.screens().stream().filter(screenIds::contains).count()))
                .filter(j -> j.screens() > 0).sorted(Comparator.comparingInt(Journey::screens).reversed()).limit(8).toList();
        List<String> tests = inventory.elementTests() == null ? List.of() : inventory.elementTests().getOrDefault(row.element(), List.of());

        // The code: the first use in the module that uses it most
        String codeFrom = null;
        String codeJet = null;
        for (ModuleScreens ms : modules) {
            for (ScreenRef s : ms.screens()) {
                Inventory.Screen screen = inventory.screens().stream().filter(x -> x.id().equals(s.id())).findFirst().orElse(null);
                if (screen == null || screen.files().isEmpty()) {
                    continue;
                }
                codeJet = MarkupConverter.snippet(read(workspaceId, screen.files().getFirst()), row.element());
                if (codeJet != null) {
                    codeFrom = screen.files().getFirst();
                    break;
                }
            }
            if (codeJet != null) {
                break;
            }
        }
        String codePremium = m == null ? null : MarkupConverter.convert(codeJet, m, premiumTag);

        List<String> checks = new ArrayList<>();
        if (m != null) {
            checks.add(legend.hand() == 0 && legend.unsupported() == 0 ? "Every property carries over" : (legend.hand() + legend.unsupported())
                    + " of " + props.size() + " properties need attention");
            checks.add(events.stream().allMatch(e -> e.kind().equals("same")) ? "Events keep their names; the Knockout bindings stay" : "Some events are renamed");
            checks.add("Business logic and services are not touched: only the element changes");
            if (m.accessibility() != null) {
                checks.add(m.accessibility());
            }
        } else {
            checks.add("The mapping registry does not list this element; it stays as it is");
        }
        return new MappingDetail(row.element(), premiumTag != null ? premiumTag : row.premium(), row.component(), target == null ? null : target.name(),
                row.status(), row.compatibility(), row.effort(), at + 1, rows.size(), at > 0 ? rows.get(at - 1).element() : null,
                at + 1 < rows.size() ? rows.get(at + 1).element() : null, props, events, m == null ? List.of() : m.slots(),
                m == null ? null : m.binding(), m == null ? null : m.accessibility(), m == null ? null : m.styling(), m == null ? List.of() : m.manual(),
                m == null ? null : m.confidence(), m == null ? null : m.evidence(), row.uses(), row.screens(), modules, journeys, tests, codeFrom, codeJet,
                codePremium, checks, legend);
    }

    static PartView part(Part p, JetMapping m) {
        if (p.to() == null) {
            boolean optional = m.manual().stream().noneMatch(x -> x.startsWith(p.from() + ":"));
            return new PartView(p.from(), null, optional ? "dropped" : "hand", p.conversion());
        }
        if (!p.to().equals(p.from())) {
            return new PartView(p.from(), p.to(), "renamed", p.conversion());
        }
        return new PartView(p.from(), p.to(), p.conversion() == null ? "same" : "converted", p.conversion());
    }

    /** A file of the workspace's working copy, or null when it cannot be read (the path stays inside the working copy). */
    private String read(UUID workspaceId, String relative) {
        try {
            Path root = storage.workingCopy(workspaceId).toAbsolutePath().normalize();
            Path file = root.resolve(relative).normalize();
            if (!file.startsWith(root) || !Files.isRegularFile(file) || Files.size(file) > 2_000_000) {
                return null;
            }
            return Files.readString(file, StandardCharsets.UTF_8);
        } catch (IOException | RuntimeException e) {
            return null;
        }
    }

    // --- the UI path's upgrade plan ---

    public record PlanComponent(String element, String premium, int screens, int uses, String compatibility, String status, boolean included) {
    }

    /** A wave with its run: state planned (no run yet) or the run's; waitsFor says what must be delivered first. */
    public record WaveView(String key, int n, String name, List<UpgradePlans.ScreenUse> screens, List<String> components, List<String> modules,
                           UUID runId, String state, UUID changeId, String changeTitle, String waitsFor, boolean canStart) {
    }

    public record UpgradePlanView(String grouping, List<PlanComponent> components, List<WaveView> waves, int screens, int delivered,
                                  String packVersion, boolean saved, String savedBy, OffsetDateTime savedAt) {
    }

    /** What Upgrade plan saves: grouping (module or component), the components in the plan and those left out. */
    public record UpgradePlanRequest(String grouping, List<String> components, List<String> off) {
    }

    /** The plan with the components asked for (from the inventory) added to the saved ones. */
    public UpgradePlanView upgradePlan(UUID workspaceId, List<String> add) {
        return upgradePlan(workspaceId, add, null);
    }

    /** The plan as it would be with unsaved choices (the page's ticks and grouping), or as saved when draft is null. */
    public UpgradePlanView upgradePlan(UUID workspaceId, List<String> add, UpgradePlanRequest draft) {
        Inventory inventory = inventory(workspaceId);
        Optional<ModernizationStore.SavedPlan> saved = store.plan(workspaceId, "ui");
        String grouping = draft != null && draft.grouping() != null ? draft.grouping()
                : saved.map(p -> p.plan().path("grouping")).filter(n -> n.isString()).map(n -> n.asString()).orElse("module");
        List<String> components = new ArrayList<>(draft != null && draft.components() != null ? draft.components()
                : strings(saved.map(p -> p.plan().path("components")).orElse(null)));
        List<String> off = draft != null && draft.off() != null ? draft.off() : strings(saved.map(p -> p.plan().path("off")).orElse(null));
        for (String c : add == null ? List.<String>of() : add) {
            if (!components.contains(c)) {
                components.add(c);
            }
        }
        Map<String, String> runIds = new LinkedHashMap<>();
        saved.ifPresent(p -> p.plan().path("runs").properties().forEach(e -> runIds.put(e.getKey(), e.getValue().asString())));
        return planView(workspaceId, inventory, grouping, components, off, runIds, saved.orElse(null));
    }

    public UpgradePlanView saveUpgradePlan(UUID workspaceId, UpgradePlanRequest r, String by) {
        Inventory inventory = inventory(workspaceId);
        String grouping = r == null || r.grouping() == null ? "module" : r.grouping();
        if (!"module".equals(grouping) && !"component".equals(grouping)) {
            throw new BadRequestException("Group the waves by module or by component.");
        }
        List<String> components = r.components() == null ? List.of() : List.copyOf(new LinkedHashSet<>(r.components()));
        Set<String> known = new LinkedHashSet<>();
        ComponentInventory.of(inventory, registry).rows().forEach(row -> known.add(row.element()));
        List<String> unknown = components.stream().filter(c -> !known.contains(c)).toList();
        if (!unknown.isEmpty()) {
            throw new BadRequestException("These components are not used on any screen: " + String.join(", ", unknown) + ".");
        }
        List<String> off = r.off() == null ? List.of() : r.off().stream().filter(components::contains).distinct().toList();
        Map<String, String> runIds = new LinkedHashMap<>();
        store.plan(workspaceId, "ui").ifPresent(p -> p.plan().path("runs").properties().forEach(e -> runIds.put(e.getKey(), e.getValue().asString())));
        tools.jackson.databind.node.ObjectNode plan = tools.jackson.databind.node.JsonNodeFactory.instance.objectNode();
        plan.put("grouping", grouping);
        components.forEach(plan.putArray("components")::add);
        off.forEach(plan.putArray("off")::add);
        tools.jackson.databind.node.ObjectNode runs = plan.putObject("runs");
        runIds.forEach(runs::put);
        ModernizationStore.SavedPlan savedPlan = store.savePlan(workspaceId, "ui", plan, by);
        audit.record("MODERNIZATION_PLAN_SAVED", workspaceId, "ui", (components.size() - off.size()) + " components in the plan, by " + grouping);
        return planView(workspaceId, inventory, grouping, components, off, runIds, savedPlan);
    }

    /** Records the run a wave started, in the saved plan. */
    void recordWaveRun(UUID workspaceId, String key, UUID runId, String by) {
        ModernizationStore.SavedPlan saved = store.plan(workspaceId, "ui").orElse(null);
        tools.jackson.databind.node.ObjectNode plan = saved != null && saved.plan() instanceof tools.jackson.databind.node.ObjectNode o ? o.deepCopy()
                : tools.jackson.databind.node.JsonNodeFactory.instance.objectNode();
        tools.jackson.databind.node.ObjectNode runs = plan.has("runs") && plan.get("runs") instanceof tools.jackson.databind.node.ObjectNode o ? o : plan.putObject("runs");
        runs.put(key, runId.toString());
        store.savePlan(workspaceId, "ui", plan, saved != null && saved.savedBy() != null ? saved.savedBy() : by);
    }

    private UpgradePlanView planView(UUID workspaceId, Inventory inventory, String grouping, List<String> components, List<String> off,
                                     Map<String, String> runIds, ModernizationStore.SavedPlan saved) {
        ComponentInventory.View inv = ComponentInventory.of(inventory, registry);
        Map<String, ComponentInventory.Row> rows = new LinkedHashMap<>();
        inv.rows().forEach(row -> rows.put(row.element(), row));
        List<PlanComponent> list = components.stream().filter(rows::containsKey).map(c -> {
            ComponentInventory.Row row = rows.get(c);
            return new PlanComponent(c, row.premium(), row.screens(), row.uses(), row.compatibility(), row.status(), !off.contains(c));
        }).toList();
        List<String> included = list.stream().filter(PlanComponent::included).map(PlanComponent::element).toList();
        List<UpgradePlans.Draft> drafts = UpgradePlans.waves(inventory, included, grouping);
        Map<UUID, RunView> runs = new LinkedHashMap<>();
        runs(workspaceId).forEach(v -> runs.put(v.id(), v));
        List<String> states = new ArrayList<>();
        List<WaveView> waves = new ArrayList<>();
        for (int i = 0; i < drafts.size(); i++) {
            UpgradePlans.Draft d = drafts.get(i);
            RunView run = Optional.ofNullable(UpgradePlans.runOf(runIds, d.key())).map(runs::get).orElse(null);
            String state = run == null || "rejected".equals(run.state()) || "failed".equals(run.state()) ? "planned" : run.state();
            states.add(state);
            String waits = UpgradePlans.waitsFor(i, states);
            waves.add(new WaveView(d.key(), i + 1, d.name(), d.screens(), d.components(), d.modules(), run == null ? null : run.id(), run == null ? "planned" : run.state(),
                    run == null ? null : run.changeId(), run == null ? null : run.changeTitle(), waits, waits == null && "planned".equals(state)));
        }
        Set<String> touched = new LinkedHashSet<>();
        drafts.forEach(d -> d.screens().forEach(s -> touched.add(s.id())));
        int delivered = (int) waves.stream().filter(w -> "delivered".equals(w.state())).count();
        return new UpgradePlanView(grouping, list, waves, touched.size(), delivered, registry.pack("jet-premium").version(), saved != null,
                saved == null ? null : saved.savedBy(), saved == null ? null : saved.savedAt());
    }

    public String upgradePlanCsv(UUID workspaceId) {
        UpgradePlanView plan = upgradePlan(workspaceId, List.of());
        StringBuilder csv = new StringBuilder("\uFEFFWave,Name,Screens,Components,Modules,State,Change\r\n");
        for (WaveView w : plan.waves()) {
            csv.append(String.join(",", String.valueOf(w.n()), cell(w.name()), String.valueOf(w.screens().size()), cell(String.join("; ", w.components())),
                    cell(String.join("; ", w.modules())), cell(w.state()), cell(w.changeTitle()))).append("\r\n");
        }
        return csv.toString();
    }

    private static List<String> strings(tools.jackson.databind.JsonNode node) {
        List<String> out = new ArrayList<>();
        if (node != null) {
            node.forEach(v -> out.add(v.asString()));
        }
        return out;
    }

    // --- the migration path's planner ---

    /** A module in the plan: its facts, the order and the team's weeks (null until planned), and its state from its run. */
    public record PlannerModule(String name, int screens, int fields, int uses, int calls, int callsWithoutBackend, Map<String, Integer> complexity,
                                String size, List<String> needs, List<String> neededBy, int order, Integer from, Integer to, boolean inPlan,
                                String state, UUID runId, UUID changeId, String changeTitle) {
    }

    public record PlannerFinding(String text, String where, String severity, String todo) {
    }

    /** today: the week of the plan it is now (from the plan's first save), or null before it is saved. */
    public record Planner(List<PlannerModule> modules, List<String> suggested, List<String> cycles, List<PlannerFinding> findings, String technology,
                          String technologyTitle, String appFolder, Integer today, int weeks, boolean saved, String savedBy, OffsetDateTime savedAt) {
    }

    public record ModulePlan(String name, Integer order, Integer from, Integer to, Boolean inPlan) {
    }

    public record PlannerRequest(List<ModulePlan> modules) {
    }

    public Planner planner(UUID workspaceId) {
        return planner(workspaceId, null);
    }

    /** The planner, with unsaved choices when draft is given. */
    public Planner planner(UUID workspaceId, PlannerRequest draft) {
        Inventory inventory = inventory(workspaceId);
        Map<String, MigrationPlans.ModuleFacts> facts = MigrationPlans.modules(inventory);
        List<String> suggested = MigrationPlans.suggestedOrder(facts);
        Optional<ModernizationStore.SavedPlan> saved = store.plan(workspaceId, "migration");
        Map<String, tools.jackson.databind.JsonNode> plan = new LinkedHashMap<>();
        saved.ifPresent(p -> p.plan().path("modules").forEach(m -> plan.put(m.path("name").asString(), m)));
        Map<String, ModulePlan> asked = new LinkedHashMap<>();
        if (draft != null && draft.modules() != null) {
            draft.modules().forEach(m -> asked.put(m.name(), m));
        }
        Optional<Choice> choice = store.choice(workspaceId);
        Set<String> chosen = choice.filter(c -> "some".equals(c.scope())).map(c -> (Set<String>) new LinkedHashSet<>(c.modules())).orElse(null);
        Map<String, RunView> latest = new LinkedHashMap<>();
        runs(workspaceId).stream().filter(v -> "migration".equals(v.path())).forEach(v -> latest.putIfAbsent(v.subject(), v));
        List<PlannerModule> modules = new ArrayList<>();
        for (MigrationPlans.ModuleFacts f : facts.values()) {
            tools.jackson.databind.JsonNode p = plan.get(f.name());
            ModulePlan a = asked.get(f.name());
            int order = a != null && a.order() != null ? a.order() : p != null && p.path("order").isNumber() ? p.path("order").asInt() : suggested.indexOf(f.name()) + 1;
            Integer from = a != null ? a.from() : p != null && p.path("from").isNumber() ? Integer.valueOf(p.path("from").asInt()) : null;
            Integer to = a != null ? a.to() : p != null && p.path("to").isNumber() ? Integer.valueOf(p.path("to").asInt()) : null;
            boolean inPlan = a != null && a.inPlan() != null ? a.inPlan() : p != null && p.has("inPlan") ? p.path("inPlan").asBoolean(true) : chosen == null || chosen.contains(f.name());
            RunView run = latest.get(f.name());
            String state = run != null && "delivered".equals(run.state()) ? "delivered" : run != null && run.open() ? "in-progress"
                    : inPlan && from != null ? "planned" : "not-started";
            modules.add(new PlannerModule(f.name(), f.screens(), f.fields(), f.uses(), f.calls(), f.callsWithoutBackend(), f.complexity(), f.size(), f.needs(),
                    f.neededBy(), order, from, to, inPlan, state, run == null ? null : run.id(), run == null ? null : run.changeId(), run == null ? null : run.changeTitle()));
        }
        modules.sort(Comparator.comparingInt(PlannerModule::order).thenComparing(PlannerModule::name));
        List<String> cycles = MigrationPlans.cycles(facts);
        List<PlannerFinding> findings = new ArrayList<>();
        cycles.forEach(c -> findings.add(new PlannerFinding(c, "Navigation between their screens", "medium", "Move them in the same wave, or move the shared screens first")));
        facts.values().stream().filter(f -> f.callsWithoutBackend() > 0).forEach(f -> findings.add(new PlannerFinding(f.name() + " calls " + f.callsWithoutBackend()
                + " services that are not in this codebase", f.screens() + " screens", "low", "They are usually OBDX product services; the new app calls them as they are")));
        facts.values().stream().filter(f -> "L".equals(f.size())).forEach(f -> findings.add(new PlannerFinding(f.name() + " is a large module",
                f.screens() + " screens, " + f.fields() + " fields", "medium", "Plan more weeks, or split it into waves of screens")));
        facts.values().stream().filter(f -> f.neededBy().size() >= 3).forEach(f -> findings.add(new PlannerFinding(f.name() + " is needed by " + f.neededBy().size()
                + " modules", String.join(", ", f.neededBy().stream().limit(3).toList()), "low", "Move it early; the others link to it")));
        TargetService.WorkspaceTarget target = targets.get(workspaceId);
        boolean newApp = target != null && target.target() != null && !"jet".equals(target.target());
        Integer today = saved.map(p -> p.plan().path("startedAt")).filter(n -> n.isString()).map(n -> {
            OffsetDateTime started = OffsetDateTime.parse(n.asString());
            return (int) (java.time.Duration.between(started, OffsetDateTime.now()).toDays() / 7) + 1;
        }).orElse(null);
        int weeks = modules.stream().filter(m -> m.to() != null).mapToInt(PlannerModule::to).max().orElse(0);
        return new Planner(modules, suggested, cycles, findings, newApp ? target.target() : null, newApp ? target.title() : null, newApp ? target.appFolder() : null,
                today, weeks, saved.isPresent(), saved.map(ModernizationStore.SavedPlan::savedBy).orElse(null), saved.map(ModernizationStore.SavedPlan::savedAt).orElse(null));
    }

    public Planner savePlanner(UUID workspaceId, PlannerRequest r, String by) {
        Inventory inventory = inventory(workspaceId);
        Set<String> known = new LinkedHashSet<>();
        inventory.modules().forEach(m -> known.add(m.name()));
        if (r == null || r.modules() == null) {
            throw new BadRequestException("Send the modules of the plan.");
        }
        for (ModulePlan m : r.modules()) {
            if (!known.contains(m.name())) {
                throw new BadRequestException("There is no module " + m.name() + " in the analysis.");
            }
            if ((m.from() == null) != (m.to() == null)) {
                throw new BadRequestException(m.name() + ": give both the first and the last week, or neither.");
            }
            if (m.from() != null && (m.from() < 1 || m.to() < m.from() || m.to() > 156)) {
                throw new BadRequestException(m.name() + ": the weeks must run from week 1 to at most week 156, the last not before the first.");
            }
        }
        Optional<ModernizationStore.SavedPlan> before = store.plan(workspaceId, "migration");
        tools.jackson.databind.node.ObjectNode plan = tools.jackson.databind.node.JsonNodeFactory.instance.objectNode();
        plan.put("startedAt", before.map(p -> p.plan().path("startedAt")).filter(n -> n.isString()).map(n -> n.asString()).orElse(OffsetDateTime.now().toString()));
        tools.jackson.databind.node.ArrayNode list = plan.putArray("modules");
        for (ModulePlan m : r.modules()) {
            tools.jackson.databind.node.ObjectNode o = list.addObject();
            o.put("name", m.name());
            if (m.order() != null) {
                o.put("order", m.order());
            }
            if (m.from() != null) {
                o.put("from", m.from());
                o.put("to", m.to());
            }
            o.put("inPlan", m.inPlan() == null || m.inPlan());
        }
        store.savePlan(workspaceId, "migration", plan, by);
        long planned = r.modules().stream().filter(m -> m.inPlan() == null || m.inPlan()).count();
        audit.record("MODERNIZATION_PLAN_SAVED", workspaceId, "migration", planned + " modules in the plan");
        return planner(workspaceId);
    }

    public String plannerCsv(UUID workspaceId) {
        StringBuilder csv = new StringBuilder("\uFEFFOrder,Module,Screens,Size,Needs first,Needed by,First week,Last week,In the plan,State\r\n");
        for (PlannerModule m : planner(workspaceId).modules()) {
            csv.append(String.join(",", String.valueOf(m.order()), cell(m.name()), String.valueOf(m.screens()), m.size(), cell(String.join("; ", m.needs())),
                    cell(String.join("; ", m.neededBy())), m.from() == null ? "" : String.valueOf(m.from()), m.to() == null ? "" : String.valueOf(m.to()),
                    m.inPlan() ? "yes" : "no", m.state())).append("\r\n");
        }
        return csv.toString();
    }

    // --- runs ---

    /**
     * A run with its state from its change: building (analysis, plan or generation), validating (generated: checks and the
     * Jenkins build), delivered (delivered to SVN or closed as merged), rejected, failed, or starting (no change yet).
     * open: still on its way to delivery.
     */
    public record RunView(UUID id, String path, String subject, List<String> screens, String technology, UUID requirementId, UUID changeId,
                          String changeTitle, String changeStatus, String state, boolean open, String message, String startedBy,
                          OffsetDateTime startedAt, OffsetDateTime finishedAt, Long deliveredRevision, String securityBy,
                          OffsetDateTime securityAt) {
    }

    public List<RunView> runs(UUID workspaceId) {
        return store.runs(workspaceId).stream().map(this::view).toList();
    }

    RunView view(Run r) {
        ChangeRequest change = r.changeId() == null ? null : changes.findById(r.changeId()).orElse(null);
        String state = runState(r.rejected(), change == null ? null : change.getStatus(), change == null ? null : change.getClosedReason(), r.changeId() != null);
        boolean open = state.equals("building") || state.equals("validating") || state.equals("starting");
        return new RunView(r.id(), r.path(), r.subject(), r.screens(), r.technology(), r.requirementId(), r.changeId(), change == null ? null : change.getTitle(),
                change == null ? null : change.getStatus().name(), state, open, r.rejected() ? r.reason() : change == null ? null : change.getMessage(),
                r.startedBy(), r.startedAt(), r.finishedAt(), change == null ? null : change.getDeliveredRevision(), r.securityBy(), r.securityAt());
    }

    static String runState(boolean rejected, ChangeRequest.Status status, ChangeRequest.CloseReason closed, boolean hadChange) {
        if (rejected) {
            return "rejected";
        }
        if (status == null) {
            return hadChange ? "failed" : "starting";
        }
        return switch (status) {
            case ANALYZING, PLAN_READY, GENERATING -> "building";
            case GENERATED -> "validating";
            case DELIVERED -> "delivered";
            case CLOSED -> closed == ChangeRequest.CloseReason.MERGED ? "delivered" : "rejected";
            case FAILED -> "failed";
        };
    }

    // --- helpers ---

    Inventory inventory(UUID workspaceId) {
        workspace(workspaceId);
        return inventories.find(workspaceId)
                .orElseThrow(() -> new NotFoundException("Analyze the code first: Modernization works from the analysis of the workspace's code."));
    }

    Workspace workspace(UUID workspaceId) {
        return workspaces.findById(workspaceId).orElseThrow(() -> new NotFoundException("Workspace not found: " + workspaceId));
    }
}
