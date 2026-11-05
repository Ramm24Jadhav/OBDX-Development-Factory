package com.obdx.factory.componentpack;

import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * The premium component packs' registry, packaged with the factory under target-packs/components: the catalogue (one
 * entry per logical component, with its name in every pack and what it is built on) and the packs (version, framework
 * range, dependencies, which components are built and their quality gate results). Read once at start-up.
 */
@Component
public class ComponentRegistry {

    /** The packs, in the order the factory shows them. */
    public static final List<String> PACKS = List.of("jet-premium", "react", "react-native", "angular");

    /** What the bank's workspace has today: an oj-* element, an OBDX widget or screen, or nothing. */
    public record Workspace(String kind, String element) {
    }

    public record Entry(String id, String name, String purpose, String kind, boolean foundation, Workspace workspace, String dashboard,
                        Map<String, String> names, Map<String, String> builtOn, Map<String, String> sample) {
    }

    public record Category(String id, String name, List<Entry> components) {
    }

    public record Dependency(String name, String version, String licence) {
    }

    /** A component with an implementation in a pack, and where it is. */
    public record Built(String component, String source, String export) {
    }

    /** One quality gate result: passed, failed, not-run or not-applicable, with what shows it. */
    public record Gate(String status, String evidence) {
    }

    /**
     * One build of a pack for a range of framework major versions (the premium JET pack: classic oj-* elements for older
     * JET, the Core Pack for newer). jetTo is null when the build covers every later release; elements gives, for an
     * older build, the element it uses in place of each Core Pack element the catalogue names.
     */
    public record Build(String id, String name, int jetFrom, Integer jetTo, String builtOn, String notes, Map<String, String> elements) {

        public boolean covers(int major) {
            return major >= jetFrom && (jetTo == null || major <= jetTo);
        }
    }

    public record Pack(String id, String name, String packageName, String version, String path, String frameworkRange, String state,
                       String description, String repository, List<Dependency> dependencies, List<Built> built,
                       Map<String, Map<String, Gate>> checks, List<Build> builds) {
    }

    private final List<Category> categories;
    private final List<Pack> packs;
    private final Map<String, Entry> byId = new LinkedHashMap<>();

    public ComponentRegistry(ObjectMapper json) {
        JsonNode catalogue = read(json, "catalogue.json");
        List<Category> cats = new ArrayList<>();
        for (JsonNode c : catalogue.path("categories")) {
            List<Entry> entries = new ArrayList<>();
            for (JsonNode m : c.path("components")) {
                JsonNode ws = m.path("workspace");
                Entry entry = new Entry(text(m, "id"), text(m, "name"), text(m, "purpose"), text(m, "kind"), m.path("foundation").asBoolean(false),
                        new Workspace(text(ws, "kind"), text(ws, "element")), text(m, "dashboard"), strings(m.path("names")),
                        strings(m.path("builtOn")), strings(m.path("sample")));
                if (byId.put(entry.id(), entry) != null) {
                    throw new IllegalStateException("The component catalogue lists " + entry.id() + " twice");
                }
                entries.add(entry);
            }
            cats.add(new Category(text(c, "id"), text(c, "name"), List.copyOf(entries)));
        }
        this.categories = List.copyOf(cats);
        List<Pack> list = new ArrayList<>();
        for (JsonNode p : read(json, "packs.json").path("packs")) {
            List<Dependency> deps = new ArrayList<>();
            for (JsonNode d : p.path("dependencies")) {
                deps.add(new Dependency(text(d, "name"), text(d, "version"), text(d, "licence")));
            }
            List<Built> built = new ArrayList<>();
            for (JsonNode b : p.path("built")) {
                Built item = new Built(text(b, "component"), text(b, "source"), text(b, "export"));
                if (!byId.containsKey(item.component())) {
                    throw new IllegalStateException("packs.json: " + text(p, "id") + " builds " + item.component() + ", which is not in the catalogue");
                }
                built.add(item);
            }
            Map<String, Map<String, Gate>> checks = new LinkedHashMap<>();
            for (Map.Entry<String, JsonNode> component : p.path("checks").properties()) {
                Map<String, Gate> gates = new LinkedHashMap<>();
                for (Map.Entry<String, JsonNode> gate : component.getValue().properties()) {
                    gates.put(gate.getKey(), new Gate(text(gate.getValue(), "status"), text(gate.getValue(), "evidence")));
                }
                checks.put(component.getKey(), Collections.unmodifiableMap(gates));
            }
            List<Build> builds = new ArrayList<>();
            for (JsonNode b : p.path("builds")) {
                JsonNode to = b.path("jetTo");
                builds.add(new Build(text(b, "id"), text(b, "name"), b.path("jetFrom").asInt(), to.isMissingNode() || to.isNull() ? null : to.asInt(),
                        text(b, "builtOn"), text(b, "notes"), strings(b.path("elements"))));
            }
            for (int i = 1; i < builds.size(); i++) {
                Build before = builds.get(i - 1);
                if (before.jetTo() == null || before.jetTo() + 1 != builds.get(i).jetFrom()) {
                    throw new IllegalStateException("packs.json: the builds of " + text(p, "id") + " must follow on from each other");
                }
            }
            list.add(new Pack(text(p, "id"), text(p, "name"), text(p, "package"), text(p, "version"), text(p, "path"), text(p, "frameworkRange"),
                    text(p, "state"), text(p, "description"), text(p, "repository"), List.copyOf(deps), List.copyOf(built), Collections.unmodifiableMap(checks),
                    List.copyOf(builds)));
        }
        this.packs = List.copyOf(list);
        if (!packs.stream().map(Pack::id).toList().equals(PACKS)) {
            throw new IllegalStateException("packs.json must list the packs " + PACKS);
        }
        if (pack("jet-premium").builds().isEmpty()) {
            throw new IllegalStateException("packs.json: jet-premium needs its JET builds");
        }
    }

    public List<Category> categories() {
        return categories;
    }

    public List<Pack> packs() {
        return packs;
    }

    public Pack pack(String id) {
        return packs.stream().filter((p) -> p.id().equals(id)).findFirst().orElse(null);
    }

    public Entry component(String id) {
        return byId.get(id);
    }

    public int size() {
        return byId.size();
    }

    private static JsonNode read(ObjectMapper json, String name) {
        try (InputStream in = ComponentRegistry.class.getResourceAsStream("/target-packs/components/" + name)) {
            if (in == null) {
                throw new IllegalStateException("target-packs/components/" + name + " is missing from the factory");
            }
            return json.readTree(in);
        } catch (IOException e) {
            throw new UncheckedIOException("Cannot read target-packs/components/" + name, e);
        }
    }

    private static String text(JsonNode node, String field) {
        JsonNode value = node.path(field);
        return value.isMissingNode() || value.isNull() ? null : value.asString();
    }

    private static Map<String, String> strings(JsonNode node) {
        Map<String, String> out = new LinkedHashMap<>();
        for (Map.Entry<String, JsonNode> e : node.properties()) {
            out.put(e.getKey(), e.getValue().asString());
        }
        return Collections.unmodifiableMap(out);
    }
}
