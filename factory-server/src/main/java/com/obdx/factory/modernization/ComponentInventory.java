package com.obdx.factory.modernization;

import com.obdx.factory.componentpack.ComponentRegistry;
import com.obdx.factory.componentpack.ComponentRegistry.JetMapping;
import com.obdx.factory.componentpack.ComponentRegistry.Part;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.TreeSet;

/**
 * The UI path's component inventory: every Oracle JET element the analysis counted in the screens, with its premium
 * replacement from the JET mapping registry, how it maps, and where it is used. Compatibility is the mapping status
 * grouped three ways: direct (a direct replacement), mapping (property or event mapping) and custom (a custom
 * transformation, manual work, unsupported, or an element the registry does not list). Helper elements the premium
 * components take as they are (oj-option, oj-validation-group, oj-form-layout, oj-toolbar) are kept and not counted.
 */
public final class ComponentInventory {

    /** One JET element type in the code. */
    public record Row(String element, String category, String component, String premium, String status, String compatibility, String effort,
                      int uses, int screens, List<String> modules, String note) {
    }

    public record Totals(int uses, int types, int direct, int mapping, int custom, int screensAffected) {
    }

    public record Count(String id, String name, int uses) {
    }

    public record ModuleUsage(String module, int screens, int uses, List<String> mostUsed, int coveredPercent) {
    }

    /** Part by part: "9 of 9" properties and events carried over, the slots, styling and the result. */
    public record MatrixRow(String element, String properties, String events, String slots, String styling, String result, String compatibility) {
    }

    /** severity: high, medium or low. */
    public record Finding(String text, String where, String severity, String todo, String element, int screens) {
    }

    public record View(boolean counted, Totals totals, List<Row> rows, List<Count> categories, List<Count> compatibility,
                       List<ModuleUsage> modules, List<MatrixRow> matrix, List<Finding> findings) {
    }

    static final Set<String> KEPT = Set.of("oj-option", "oj-validation-group", "oj-form-layout", "oj-toolbar");

    private static final Map<String, String> CATEGORY_NAMES = new LinkedHashMap<>();

    static {
        CATEGORY_NAMES.put("input", "Input and form");
        CATEGORY_NAMES.put("navigation", "Navigation");
        CATEGORY_NAMES.put("data", "Data display");
        CATEGORY_NAMES.put("layout", "Layout and container");
        CATEGORY_NAMES.put("overlay", "Popup and overlay");
        CATEGORY_NAMES.put("other", "Other");
    }

    private ComponentInventory() {
    }

    /** direct, mapping or custom, from a mapping status (null: the registry does not list the element). */
    public static String compatibility(String status) {
        if (status == null) {
            return "custom";
        }
        return switch (status) {
            case "direct-replacement" -> "direct";
            case "property-mapping", "event-mapping" -> "mapping";
            default -> "custom";
        };
    }

    static String effort(String compatibility) {
        return switch (compatibility) {
            case "direct" -> "Low";
            case "mapping" -> "Medium";
            default -> "High";
        };
    }

    /** The group an element is listed under, from its name. */
    static String category(String element) {
        String e = element.substring(3);
        if (e.startsWith("input") || e.startsWith("text-area") || e.startsWith("select") || e.startsWith("combobox") || e.startsWith("checkbox")
                || e.startsWith("radio") || e.equals("switch") || e.equals("slider") || e.equals("file-picker") || e.startsWith("button")
                || e.equals("menu-button") || e.equals("label") || e.equals("color-palette")) {
            return "input";
        }
        if (e.equals("tab-bar") || e.equals("navigation-list") || e.equals("train") || e.equals("paging-control") || e.equals("menu")) {
            return "navigation";
        }
        if (e.equals("table") || e.equals("list-view") || e.equals("data-grid") || e.equals("tree-view") || e.contains("chart") || e.contains("gauge")
                || e.startsWith("progress") || e.equals("avatar") || e.equals("conveyor-belt") || e.equals("film-strip")) {
            return "data";
        }
        if (e.equals("collapsible") || e.equals("accordion") || e.equals("masonry-layout")) {
            return "layout";
        }
        if (e.equals("dialog") || e.equals("popup") || e.equals("messages")) {
            return "overlay";
        }
        return "other";
    }

    public static View of(Inventory inventory, ComponentRegistry registry) {
        boolean counted = inventory.summary() != null && inventory.summary().components() != null;
        // element -> screens and modules using it, and uses
        Map<String, Integer> uses = new TreeMap<>();
        Map<String, Set<String>> screensOf = new TreeMap<>();
        Map<String, Map<String, Integer>> modulesOf = new TreeMap<>();
        for (Inventory.Screen s : inventory.screens()) {
            if (s.elements() == null) {
                continue;
            }
            s.elements().forEach((element, n) -> {
                if (KEPT.contains(element)) {
                    return;
                }
                uses.merge(element, n, Integer::sum);
                screensOf.computeIfAbsent(element, k -> new TreeSet<>()).add(s.id());
                modulesOf.computeIfAbsent(element, k -> new TreeMap<>()).merge(s.module(), n, Integer::sum);
            });
        }
        List<Row> rows = new ArrayList<>();
        for (Map.Entry<String, Integer> u : uses.entrySet()) {
            String element = u.getKey();
            JetMapping m = registry.jetMapping(element);
            String status = m == null ? null : m.status();
            String compatibility = compatibility(status);
            ComponentRegistry.Entry target = m == null || m.target() == null ? null : registry.component(m.target());
            String premium = target != null ? target.names().get("jet-premium") : m != null && m.target() == null && !"unsupported".equals(status)
                    ? "Moves into the premium fields" : "Not in the pack yet";
            List<String> modules = modulesOf.get(element).entrySet().stream()
                    .sorted(Map.Entry.<String, Integer>comparingByValue().reversed().thenComparing(Map.Entry.comparingByKey())).map(Map.Entry::getKey).toList();
            String note = m == null ? "The mapping registry does not list " + element + "." : m.manual().isEmpty() ? null : String.join(" ", m.manual());
            rows.add(new Row(element, category(element), target == null ? null : target.id(), premium, status == null ? "unsupported" : status,
                    compatibility, effort(compatibility), u.getValue(), screensOf.get(element).size(), modules, note));
        }
        rows.sort(Comparator.comparingInt(Row::uses).reversed().thenComparing(Row::element));

        int total = rows.stream().mapToInt(Row::uses).sum();
        int direct = sum(rows, "direct");
        int mapping = sum(rows, "mapping");
        int custom = sum(rows, "custom");
        Set<String> affected = new TreeSet<>();
        screensOf.values().forEach(affected::addAll);
        Totals totals = new Totals(total, rows.size(), direct, mapping, custom, affected.size());

        List<Count> categories = new ArrayList<>();
        CATEGORY_NAMES.forEach((id, name) -> {
            int n = rows.stream().filter(r -> r.category().equals(id)).mapToInt(Row::uses).sum();
            if (n > 0) {
                categories.add(new Count(id, name, n));
            }
        });
        List<Count> compat = List.of(new Count("direct", "Direct replacement", direct), new Count("mapping", "Property or event mapping", mapping),
                new Count("custom", "Transformation, manual or unsupported", custom));

        // Usage by module
        Map<String, String> compatibilityOf = new LinkedHashMap<>();
        rows.forEach(r -> compatibilityOf.put(r.element(), r.compatibility()));
        List<ModuleUsage> modules = new ArrayList<>();
        Map<String, List<Inventory.Screen>> byModule = new TreeMap<>();
        inventory.screens().forEach(s -> byModule.computeIfAbsent(s.module(), k -> new ArrayList<>()).add(s));
        byModule.forEach((module, screens) -> {
            Map<String, Integer> counts = new TreeMap<>();
            screens.forEach(s -> (s.elements() == null ? Map.<String, Integer>of() : s.elements()).forEach((k, v) -> {
                if (!KEPT.contains(k)) {
                    counts.merge(k, v, Integer::sum);
                }
            }));
            int n = counts.values().stream().mapToInt(Integer::intValue).sum();
            if (n == 0) {
                return;
            }
            int covered = counts.entrySet().stream().filter(e -> !"custom".equals(compatibilityOf.get(e.getKey()))).mapToInt(Map.Entry::getValue).sum();
            List<String> most = counts.entrySet().stream().sorted(Map.Entry.<String, Integer>comparingByValue().reversed().thenComparing(Map.Entry.comparingByKey()))
                    .limit(2).map(Map.Entry::getKey).toList();
            modules.add(new ModuleUsage(module, screens.size(), n, most, Math.round(100f * covered / n)));
        });
        modules.sort(Comparator.comparingInt(ModuleUsage::uses).reversed().thenComparing(ModuleUsage::module));

        List<MatrixRow> matrix = rows.stream().map(r -> matrixRow(r, registry.jetMapping(r.element()))).toList();
        return new View(counted, totals, rows, categories, compat, modules, matrix, findings(inventory, rows));
    }

    private static int sum(List<Row> rows, String compatibility) {
        return rows.stream().filter(r -> r.compatibility().equals(compatibility)).mapToInt(Row::uses).sum();
    }

    static MatrixRow matrixRow(Row r, JetMapping m) {
        if (m == null || m.target() == null && "unsupported".equals(m.status())) {
            return new MatrixRow(r.element(), "none", "none", "none", "none", "Not in the pack", r.compatibility());
        }
        String result = switch (r.compatibility()) {
            case "direct" -> "Drop-in";
            case "mapping" -> "Needs mapping";
            default -> "Custom work";
        };
        return new MatrixRow(r.element(), carried(m.properties()), carried(m.events()), m.slots().isEmpty() ? "none" : m.slots().size() + " of " + m.slots().size(),
                "tokens", result, r.compatibility());
    }

    /** "7 of 8": the parts carried over (renamed counts as carried) of all; "none" when there are none. */
    static String carried(List<Part> parts) {
        if (parts.isEmpty()) {
            return "none";
        }
        long n = parts.stream().filter(p -> p.to() != null).count();
        return n + " of " + parts.size();
    }

    /** What to fix or decide before the upgrade, from the mapping and the markers the analysis counted. */
    static List<Finding> findings(Inventory inventory, List<Row> rows) {
        List<Finding> out = new ArrayList<>();
        for (Row r : rows) {
            if ("unsupported".equals(r.status())) {
                out.add(new Finding(r.element() + " has no premium version", where(r), "medium", "Keep the JET element on these screens, or wait for a "
                        + "premium component", r.element(), r.screens()));
            } else if ("custom".equals(r.compatibility())) {
                out.add(new Finding(r.element() + " needs a custom transformation", where(r), "medium", r.note() == null ? "Map it by hand in the "
                        + "workspace" : r.note(), r.element(), r.screens()));
            } else if (r.note() != null) {
                out.add(new Finding(r.element() + ": some options need a hand edit", where(r), "low", r.note(), r.element(), r.screens()));
            }
        }
        marker(inventory, out, "renderer", "Renderer functions on JET elements", "medium",
                "Write each renderer as an item or row template of the premium element");
        marker(inventory, out, "template", "Template slots in JET elements", "low",
                "Check each template: the premium elements take the same slot names");
        marker(inventory, out, "inline-style", "Inline styles on JET elements", "low",
                "Remove them; the pack's theme tokens replace them");
        out.sort(Comparator.comparingInt((Finding f) -> f.severity().equals("high") ? 0 : f.severity().equals("medium") ? 1 : 2)
                .thenComparing(Comparator.comparingInt(Finding::screens).reversed()));
        return out;
    }

    private static void marker(Inventory inventory, List<Finding> out, String key, String text, String severity, String todo) {
        Map<String, Integer> modules = new TreeMap<>();
        int screens = 0;
        for (Inventory.Screen s : inventory.screens()) {
            Integer n = s.markers() == null ? null : s.markers().get(key);
            if (n != null && n > 0) {
                screens++;
                modules.merge(s.module(), 1, Integer::sum);
            }
        }
        if (screens > 0) {
            out.add(new Finding(text, String.join(", ", new LinkedHashSet<>(modules.keySet()).stream().limit(3).toList())
                    + (modules.size() > 3 ? " and " + (modules.size() - 3) + " more" : "") + " (" + screens + (screens == 1 ? " screen)" : " screens)"),
                    severity, todo, null, screens));
        }
    }

    private static String where(Row r) {
        return String.join(", ", r.modules().stream().limit(2).toList()) + (r.modules().size() > 2 ? " and " + (r.modules().size() - 2) + " more" : "")
                + " (" + r.screens() + (r.screens() == 1 ? " screen)" : " screens)");
    }
}
