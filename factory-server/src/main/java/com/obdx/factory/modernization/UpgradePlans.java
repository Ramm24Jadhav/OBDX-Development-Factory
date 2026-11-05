package com.obdx.factory.modernization;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.UUID;

/**
 * The UI path's waves (docs/MODERNIZATION.md): which screens get which premium components, one change per wave. By
 * module, the smallest modules go first so the bank sees the new look early, up to five waves and then one for the rest;
 * by component, one wave per component, most used first. Each wave waits for the one before it to be delivered. The
 * waves are worked out from the analysis every time; the saved plan keeps the choices and each wave's run.
 */
public final class UpgradePlans {

    static final int MODULE_WAVES = 5;

    public record ScreenUse(String id, String name, String module, int uses) {
    }

    /** A wave before its run is known: its key (stable while the choices stay), name, screens and components. */
    public record Draft(String key, String name, List<ScreenUse> screens, List<String> components, List<String> modules) {
    }

    private UpgradePlans() {
    }

    /** The waves for the included components, grouped by module or by component. */
    public static List<Draft> waves(Inventory inventory, List<String> included, String grouping) {
        Set<String> wanted = new LinkedHashSet<>(included);
        List<Inventory.Screen> screens = inventory.screens().stream().filter(s -> s.elements() != null && s.elements().keySet().stream().anyMatch(wanted::contains)).toList();
        List<Draft> out = new ArrayList<>();
        if ("component".equals(grouping)) {
            Map<String, Integer> uses = new LinkedHashMap<>();
            for (String c : wanted) {
                uses.put(c, screens.stream().mapToInt(s -> s.elements().getOrDefault(c, 0)).sum());
            }
            uses.entrySet().stream().filter(e -> e.getValue() > 0).sorted(Map.Entry.<String, Integer>comparingByValue().reversed()).forEach(e -> {
                List<ScreenUse> on = screens.stream().filter(s -> s.elements().containsKey(e.getKey()))
                        .map(s -> new ScreenUse(s.id(), s.name(), s.module(), s.elements().get(e.getKey()))).toList();
                out.add(new Draft("component:" + e.getKey(), e.getKey(), on, List.of(e.getKey()), on.stream().map(ScreenUse::module).distinct().toList()));
            });
            return out;
        }
        Map<String, List<Inventory.Screen>> byModule = new TreeMap<>();
        screens.forEach(s -> byModule.computeIfAbsent(s.module(), k -> new ArrayList<>()).add(s));
        List<Map.Entry<String, List<Inventory.Screen>>> order = byModule.entrySet().stream()
                .sorted(Comparator.comparingInt((Map.Entry<String, List<Inventory.Screen>> e) -> e.getValue().size()).thenComparing(Map.Entry::getKey)).toList();
        for (int i = 0; i < order.size(); i++) {
            boolean rest = i == MODULE_WAVES && order.size() > MODULE_WAVES + 1;
            List<Map.Entry<String, List<Inventory.Screen>>> group = rest ? order.subList(i, order.size()) : List.of(order.get(i));
            List<ScreenUse> on = new ArrayList<>();
            Set<String> components = new LinkedHashSet<>();
            for (Map.Entry<String, List<Inventory.Screen>> m : group) {
                for (Inventory.Screen s : m.getValue()) {
                    int n = s.elements().entrySet().stream().filter(e -> wanted.contains(e.getKey())).mapToInt(Map.Entry::getValue).sum();
                    on.add(new ScreenUse(s.id(), s.name(), s.module(), n));
                    s.elements().keySet().stream().filter(wanted::contains).forEach(components::add);
                }
            }
            List<String> modules = group.stream().map(Map.Entry::getKey).toList();
            out.add(new Draft(rest ? "rest" : "module:" + modules.getFirst(), rest ? "Everything else" : modules.getFirst(), on,
                    wanted.stream().filter(components::contains).toList(), modules));
            if (rest) {
                break;
            }
        }
        return out;
    }

    /** What a wave waits for: nothing for the first, else the wave before it to be delivered. */
    static String waitsFor(int index, List<String> states) {
        if (index == 0) {
            return null;
        }
        for (int i = index - 1; i >= 0; i--) {
            if (!"delivered".equals(states.get(i))) {
                return "Wave " + (i + 1) + " must be delivered first";
            }
        }
        return null;
    }

    /** The run id a saved plan keeps for a wave key, or null. */
    static UUID runOf(Map<String, String> runs, String key) {
        String id = runs == null ? null : runs.get(key);
        try {
            return id == null ? null : UUID.fromString(id);
        } catch (IllegalArgumentException e) {
            return null;
        }
    }
}
