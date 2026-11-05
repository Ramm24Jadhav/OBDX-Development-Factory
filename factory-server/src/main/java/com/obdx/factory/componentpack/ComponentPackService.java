package com.obdx.factory.componentpack;

import com.obdx.factory.common.BadRequestException;
import com.obdx.factory.componentpack.ComponentRegistry.Entry;
import com.obdx.factory.componentpack.ComponentRegistry.Gate;
import com.obdx.factory.componentpack.ComponentRegistry.Pack;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * What the Component factory shows: each pack with its readiness, and each component with, per pack, its readiness and
 * its mapping from the workspace's JET element.
 *
 * Readiness comes only from the registry: Available when every quality gate of the component is passed in that pack,
 * In test when the component is built but not every gate is passed, Planned when the pack names it but it is not built,
 * and Not in this pack otherwise. Mapping statuses are proposals from the component's type until a mapping registry
 * entry with evidence exists (there are none yet), and say so.
 *
 * The premium JET pack is built for the workspace's JET release, read from the ui.jetVersion fact the Project Profile
 * scan finds in the code (or the value a user set there): the pack's build that covers that major version gives each
 * component what it is built on. Without a version the first build, which runs on the oldest supported release, is shown.
 */
@Service
public class ComponentPackService {

    /** The gates a component must pass to be Available; parity only when it replaces a JET element. */
    static final List<String> GATES = List.of("unit", "accessibility", "visual", "themes", "responsive", "parity");

    private static final Set<String> SIMPLE = Set.of("text", "password", "select", "date", "choice", "check", "switch", "button", "iconbtn", "segmented", "code");
    private static final Set<String> LIGHT = Set.of("tabs", "nav", "stepper", "menu", "pages", "accordion", "tooltip", "toast", "alert");

    public record Counts(int available, int inTest, int planned, int notInPack) {
    }

    public record PackView(String id, String name, String packageName, String version, String path, String frameworkRange, String state,
                           String description, String repository, List<ComponentRegistry.Dependency> dependencies, Counts counts,
                           List<ComponentRegistry.Build> builds) {
    }

    /** The workspace's ui.jetVersion fact: its value (null when the scan found none), status and evidence. */
    public record JetFact(String value, String status, List<String> evidence) {
    }

    /**
     * The JET release the premium pack is built for: what was found and where, the build chosen and a note for the page.
     * status is the Project Profile's (detected, confirmed, corrected), missing, or no-workspace.
     */
    public record JetTarget(String found, Integer major, String status, List<String> evidence, String build, String buildName,
                            String buildDetail, String note) {
    }

    /** One component in one pack. */
    public record InPack(String name, String readiness, String builtOn, String mapping, String mappingConfidence, String mappingEvidence,
                         Map<String, String> gates, String source) {
    }

    public record ComponentView(String id, String name, String purpose, String kind, boolean foundation, String dashboard,
                                String workspaceKind, String workspaceElement, Map<String, String> sample, Map<String, InPack> packs) {
    }

    public record CategoryView(String id, String name, List<ComponentView> components) {
    }

    public record Catalogue(List<PackView> packs, List<CategoryView> categories, int components, JetTarget jet) {
    }

    private static final Pattern MAJOR = Pattern.compile("(\\d+)");
    private static final Pattern CORE_PACK_ELEMENT = Pattern.compile("oj-c-[a-z]+(?:-[a-z]+)*");

    private final ComponentRegistry registry;

    public ComponentPackService(ComponentRegistry registry) {
        this.registry = registry;
    }

    /** The catalogue without a workspace: the premium JET pack shows its first build. */
    public Catalogue catalogue() {
        return catalogue(null);
    }

    /** The catalogue for a workspace whose JET version fact is given (null: no workspace). */
    public Catalogue catalogue(JetFact fact) {
        JetTarget jet = jetTarget(fact);
        ComponentRegistry.Build build = registry.pack("jet-premium").builds().stream().filter((b) -> b.id().equals(jet.build())).findFirst().orElseThrow();
        List<CategoryView> categories = new ArrayList<>();
        for (ComponentRegistry.Category c : registry.categories()) {
            categories.add(new CategoryView(c.id(), c.name(), c.components().stream().map((e) -> view(e, build)).toList()));
        }
        List<PackView> packs = registry.packs().stream().map((p) -> new PackView(p.id(), p.name(), p.packageName(), p.version(), p.path(),
                p.frameworkRange(), p.state(), p.description(), p.repository(), p.dependencies(), counts(p, categories), p.builds())).toList();
        return new Catalogue(packs, categories, registry.size(), jet);
    }

    /** Picks the premium JET build for the workspace's JET version and says why. */
    JetTarget jetTarget(JetFact fact) {
        List<ComponentRegistry.Build> builds = registry.pack("jet-premium").builds();
        ComponentRegistry.Build first = builds.getFirst();
        if (fact == null) {
            return target(null, null, "no-workspace", List.of(), first,
                    "Choose a workspace to build the premium JET pack for the JET release in its code. Showing the " + first.name() + " build.");
        }
        Integer major = null;
        if (fact.value() != null) {
            Matcher m = MAJOR.matcher(fact.value());
            major = m.find() ? Integer.valueOf(m.group(1)) : null;
        }
        if (major == null) {
            return target(fact.value(), null, "missing", fact.evidence(), first, "The scan found no Oracle JET version in the code. Import the code or "
                    + "refresh discovery, or enter the version on the Project Profile. Showing the " + first.name() + " build, which runs on JET "
                    + first.jetFrom() + " and later.");
        }
        String from = "corrected".equals(fact.status()) || "confirmed".equals(fact.status()) ? "set on the Project Profile" : "found in the code";
        if (major < first.jetFrom()) {
            return target(fact.value(), major, fact.status(), fact.evidence(), first, fact.value() + " (" + from + ") is older than the pack supports: "
                    + "it needs JET " + first.jetFrom() + " or later. Check the version on the Project Profile.");
        }
        int found = major;
        ComponentRegistry.Build build = builds.stream().filter((b) -> b.covers(found)).findFirst().orElse(builds.getLast());
        return target(fact.value(), major, fact.status(), fact.evidence(), build,
                "Built for " + fact.value() + ", " + from + ": the " + build.name() + " build.");
    }

    private static JetTarget target(String found, Integer major, String status, List<String> evidence, ComponentRegistry.Build build, String note) {
        return new JetTarget(found, major, status, evidence == null ? List.of() : evidence, build.id(), build.name(), build.builtOn(), note);
    }

    private ComponentView view(Entry e, ComponentRegistry.Build jetBuild) {
        Map<String, InPack> packs = new LinkedHashMap<>();
        for (Pack p : registry.packs()) {
            InPack in = inPack(e, p);
            if ("jet-premium".equals(p.id()) && !jetBuild.elements().isEmpty()) {
                in = new InPack(in.name(), in.readiness(), olderBuiltOn(e, jetBuild), in.mapping(), in.mappingConfidence(), in.mappingEvidence(),
                        in.gates(), in.source());
            }
            packs.put(p.id(), in);
        }
        return new ComponentView(e.id(), e.name(), e.purpose(), e.kind(), e.foundation(), e.dashboard(), e.workspace().kind(),
                e.workspace().element(), e.sample(), packs);
    }

    InPack inPack(Entry e, Pack p) {
        String name = e.names().get(p.id());
        ComponentRegistry.Built built = p.built().stream().filter((b) -> b.component().equals(e.id())).findFirst().orElse(null);
        Map<String, Gate> recorded = p.checks().getOrDefault(e.id(), Map.of());
        Map<String, String> gates = new LinkedHashMap<>();
        boolean replaces = "element".equals(e.workspace().kind());
        for (String gate : GATES) {
            Gate g = recorded.get(gate);
            gates.put(gate, g != null ? g.status() : "parity".equals(gate) && !replaces ? "not-applicable" : "not-run");
        }
        String readiness;
        if (name == null) {
            readiness = "not-in-pack";
        } else if (built == null) {
            readiness = "planned";
        } else {
            readiness = gates.values().stream().allMatch((s) -> "passed".equals(s) || "not-applicable".equals(s)) ? "available" : "in-test";
        }
        String mapping = proposedMapping(e, p.id(), name != null);
        String evidence = switch (mapping) {
            case "new" -> "Nothing in the workspace to replace.";
            case "unsupported" -> "No component in this pack.";
            default -> "Proposed from the component type; no parity test yet.";
        };
        String confidence = "new".equals(mapping) || "unsupported".equals(mapping) ? "high" : "proposed";
        return new InPack(name, readiness, e.builtOn().get(p.id()), mapping, confidence, evidence, gates,
                built == null ? null : built.source() + (built.export() == null ? "" : "#" + built.export()));
    }

    /**
     * What a premium JET component is built on in a build for older JET: the workspace's own classic oj-* element (or
     * the build's older equivalent, oj-select-single becomes oj-select-one), or the catalogue's Core Pack elements
     * swapped for the build's equivalents (oj-c-action-card becomes the pack's own card).
     */
    static String olderBuiltOn(Entry e, ComponentRegistry.Build build) {
        String element = e.workspace().element();
        if ("element".equals(e.workspace().kind()) && element != null && element.startsWith("oj-") && !element.startsWith("oj-c-")) {
            return build.elements().getOrDefault(element, element);
        }
        String core = e.builtOn().get("jet-premium");
        return core == null ? null : CORE_PACK_ELEMENT.matcher(core)
                .replaceAll((m) -> Matcher.quoteReplacement(build.elements().getOrDefault(m.group(), m.group())));
    }

    /** The mapping a component would have from the workspace's JET element to a pack, before any parity test. */
    static String proposedMapping(Entry e, String pack, boolean inPack) {
        String ws = e.workspace().kind();
        if ("none".equals(ws)) {
            return "new";
        }
        if (!inPack) {
            return "unsupported";
        }
        if ("widget".equals(ws) || "screen".equals(ws)) {
            return "custom-transformation";
        }
        if ("jet-premium".equals(pack)) {
            return SIMPLE.contains(e.kind()) ? "direct-replacement" : LIGHT.contains(e.kind()) ? "property-mapping" : "custom-transformation";
        }
        if ("session-timeout".equals(e.id())) {
            return "manual-intervention";
        }
        return SIMPLE.contains(e.kind()) ? "event-mapping" : "custom-transformation";
    }

    private static Counts counts(Pack p, List<CategoryView> categories) {
        int available = 0;
        int inTest = 0;
        int planned = 0;
        int missing = 0;
        for (CategoryView c : categories) {
            for (ComponentView v : c.components()) {
                switch (v.packs().get(p.id()).readiness()) {
                    case "available" -> available++;
                    case "in-test" -> inTest++;
                    case "planned" -> planned++;
                    default -> missing++;
                }
            }
        }
        return new Counts(available, inTest, planned, missing);
    }

    // The component style --------------------------------------------------------------------------------------------

    static final Set<String> LOOKS = Set.of("elevated", "soft", "glass", "outline", "vivid", "pill", "brutal", "redwood");
    static final Set<String> HOVER = Set.of("none", "lift", "glow", "shine");
    static final Set<String> CLICK = Set.of("none", "press", "ripple", "bounce");
    static final Set<String> SCROLL = Set.of("none", "fadeup", "scale", "slide", "blur");
    static final Set<String> MODES = Set.of("light", "dark");
    static final Set<String> BRANDS = Set.of("workspace", "indigo", "emerald", "burgundy", "gold");

    public record Motion(String hover, String click, String scroll) {
    }

    /** A design option, motion and preview theme; on a component, a null part takes the workspace default. */
    public record Choice(String look, Motion motion, String mode, String brand) {
    }

    public record Style(Choice defaults, Map<String, Choice> components) {
    }

    /** The default style of a workspace that has not saved one. */
    public static Style defaultStyle() {
        return new Style(new Choice("elevated", new Motion("lift", "press", "fadeup"), "light", "workspace"), Map.of());
    }

    /** Checks a style before it is saved: known values only, every component in the catalogue. */
    public Style validate(Style style) {
        if (style == null || style.defaults() == null) {
            throw new BadRequestException("Send the style's defaults: a design option, motion and theme.");
        }
        Choice d = style.defaults();
        if (d.look() == null || d.motion() == null || d.mode() == null || d.brand() == null) {
            throw new BadRequestException("The defaults need a design option, motion (hover, click, scroll), mode and brand.");
        }
        check("defaults", d, true);
        Map<String, Choice> components = new LinkedHashMap<>();
        if (style.components() != null) {
            for (Map.Entry<String, Choice> e : style.components().entrySet()) {
                if (registry.component(e.getKey()) == null) {
                    throw new BadRequestException("There is no component " + e.getKey() + " in the catalogue.");
                }
                if (e.getValue() != null) {
                    check(e.getKey(), e.getValue(), false);
                    components.put(e.getKey(), e.getValue());
                }
            }
        }
        return new Style(d, components);
    }

    private static void check(String where, Choice c, boolean all) {
        one(where, "design option", c.look(), LOOKS);
        one(where, "mode", c.mode(), MODES);
        one(where, "brand", c.brand(), BRANDS);
        if (c.motion() != null) {
            if (all && (c.motion().hover() == null || c.motion().click() == null || c.motion().scroll() == null)) {
                throw new BadRequestException("The default motion needs hover, click and scroll.");
            }
            one(where, "hover motion", c.motion().hover(), HOVER);
            one(where, "click motion", c.motion().click(), CLICK);
            one(where, "scroll motion", c.motion().scroll(), SCROLL);
        }
    }

    private static void one(String where, String what, String value, Set<String> allowed) {
        if (value != null && !allowed.contains(value)) {
            throw new BadRequestException(where + ": " + what + " " + value + " is not one of " + allowed.stream().sorted().toList() + ".");
        }
    }
}
