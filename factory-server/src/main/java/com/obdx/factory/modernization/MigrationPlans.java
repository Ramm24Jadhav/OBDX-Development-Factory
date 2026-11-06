package com.obdx.factory.modernization;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.TreeSet;

/**
 * The migration path's module facts (docs/MODERNIZATION.md): which module needs which, read from the code (a module
 * needs another when its screens open that module's screens), each module's size, and the order that moves what a
 * module needs before the module. The weeks are the team's own plan and are not worked out here.
 */
public final class MigrationPlans {

    public record ModuleFacts(String name, int screens, int fields, int uses, int calls, int callsWithoutBackend, Map<String, Integer> complexity,
                              String size, List<String> needs, List<String> neededBy) {
    }

    private MigrationPlans() {
    }

    /** Each module's facts and dependencies, by name. */
    public static Map<String, ModuleFacts> modules(Inventory inventory) {
        Map<String, String> moduleOf = new HashMap<>();
        inventory.screens().forEach(s -> moduleOf.put(s.id(), s.module()));
        Map<String, Set<String>> needs = new TreeMap<>();
        Map<String, Set<String>> neededBy = new TreeMap<>();
        Map<String, Set<String>> calls = new TreeMap<>();
        Set<String> withoutBackend = new LinkedHashSet<>();
        inventory.calls().stream().filter(c -> c.endpoint() == null).forEach(c -> withoutBackend.add(c.method() + " " + c.path()));
        for (Inventory.Screen s : inventory.screens()) {
            needs.computeIfAbsent(s.module(), k -> new TreeSet<>());
            neededBy.computeIfAbsent(s.module(), k -> new TreeSet<>());
            calls.computeIfAbsent(s.module(), k -> new LinkedHashSet<>()).addAll(s.calls());
            for (String opened : s.opens()) {
                String other = moduleOf.get(opened);
                if (other != null && !other.equals(s.module())) {
                    needs.get(s.module()).add(other);
                    neededBy.computeIfAbsent(other, k -> new TreeSet<>()).add(s.module());
                }
            }
        }
        Map<String, ModuleFacts> out = new LinkedHashMap<>();
        for (Inventory.Module m : inventory.modules()) {
            List<Inventory.Screen> screens = inventory.screens().stream().filter(s -> s.module().equals(m.name())).toList();
            int uses = screens.stream().mapToInt(s -> s.elements() == null ? 0 : s.elements().values().stream().mapToInt(Integer::intValue).sum()).sum();
            Set<String> moduleCalls = calls.getOrDefault(m.name(), Set.of());
            int large = m.complexity() == null ? 0 : m.complexity().getOrDefault("L", 0);
            int medium = m.complexity() == null ? 0 : m.complexity().getOrDefault("M", 0);
            String size = large >= 3 || m.screens() >= 20 ? "L" : large > 0 || medium >= 3 || m.screens() >= 8 ? "M" : "S";
            out.put(m.name(), new ModuleFacts(m.name(), m.screens(), m.fields(), uses, moduleCalls.size(),
                    (int) moduleCalls.stream().filter(c -> withoutBackend.contains(c) || withoutBackend.contains("? " + c.substring(c.indexOf(' ') + 1))).count(),
                    m.complexity(), size, List.copyOf(needs.getOrDefault(m.name(), Set.of())), List.copyOf(neededBy.getOrDefault(m.name(), Set.of()))));
        }
        return out;
    }

    /**
     * The suggested order: a module after everything it needs (by depth in the dependencies), smaller modules first at the
     * same depth. A module in a cycle gets the depth of the first of the cycle that was reached.
     */
    public static List<String> suggestedOrder(Map<String, ModuleFacts> modules) {
        Map<String, Integer> depth = new HashMap<>();
        for (String m : modules.keySet()) {
            depth(m, modules, depth, new LinkedHashSet<>());
        }
        Map<String, Integer> sizeRank = Map.of("S", 0, "M", 1, "L", 2);
        return modules.values().stream().sorted(Comparator.comparingInt((ModuleFacts f) -> depth.get(f.name()))
                .thenComparingInt(f -> sizeRank.getOrDefault(f.size(), 1)).thenComparingInt(ModuleFacts::screens).thenComparing(ModuleFacts::name))
                .map(ModuleFacts::name).toList();
    }

    private static int depth(String m, Map<String, ModuleFacts> modules, Map<String, Integer> depth, Set<String> path) {
        Integer known = depth.get(m);
        if (known != null) {
            return known;
        }
        if (!path.add(m)) {
            return 0;
        }
        int d = 0;
        for (String n : modules.get(m).needs()) {
            if (modules.containsKey(n)) {
                d = Math.max(d, 1 + depth(n, modules, depth, path));
            }
        }
        path.remove(m);
        depth.put(m, d);
        return d;
    }

    /** Modules that need each other, each pair once ("A and B need each other"). */
    public static List<String> cycles(Map<String, ModuleFacts> modules) {
        List<String> out = new ArrayList<>();
        for (ModuleFacts f : modules.values()) {
            for (String n : f.needs()) {
                ModuleFacts other = modules.get(n);
                if (other != null && other.needs().contains(f.name()) && f.name().compareTo(n) < 0) {
                    out.add(f.name() + " and " + n + " need each other");
                }
            }
        }
        return out;
    }
}
