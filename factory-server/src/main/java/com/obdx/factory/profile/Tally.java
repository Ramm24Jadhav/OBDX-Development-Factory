package com.obdx.factory.profile;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * Counts values and remembers a few example files for each, to report what is most common and why.
 */
class Tally {

    private final Map<String, Integer> counts = new HashMap<>();
    private final Map<String, List<String>> examples = new HashMap<>();

    void add(String value, String path) {
        counts.merge(value, 1, Integer::sum);
        List<String> list = examples.computeIfAbsent(value, k -> new ArrayList<>());
        if (list.size() < 3 && !list.contains(path)) {
            list.add(path);
        }
    }

    boolean isEmpty() {
        return counts.isEmpty();
    }

    int total() {
        return counts.values().stream().mapToInt(Integer::intValue).sum();
    }

    int count(String value) {
        return counts.getOrDefault(value, 0);
    }

    /** Values from most to least common; ties ordered by name for stable output. */
    List<String> top(int limit) {
        return counts.entrySet().stream()
                .sorted(Map.Entry.<String, Integer>comparingByValue().reversed().thenComparing(Map.Entry.comparingByKey()))
                .limit(limit)
                .map(Map.Entry::getKey)
                .toList();
    }

    /** For example "JAX-RS (120 files), Spring (3 files)". */
    String describe(int limit, String unit) {
        Map<String, Integer> top = new LinkedHashMap<>();
        for (String value : top(limit)) {
            top.put(value, counts.get(value));
        }
        return top.entrySet().stream()
                .map(e -> e.getKey() + " (" + e.getValue() + " " + (e.getValue() == 1 ? unit : plural(unit)) + ")")
                .collect(Collectors.joining(", "));
    }

    static String plural(String noun) {
        return noun.endsWith("s") || noun.endsWith("x") || noun.endsWith("ch") || noun.endsWith("sh") ? noun + "es" : noun + "s";
    }

    List<String> evidence(int limit) {
        return top(limit).stream().flatMap(value -> examples.get(value).stream()).limit(5).toList();
    }

    /** MEDIUM once there are at least manyAt occurrences, LOW below that; HIGH is reserved for explicit declarations. */
    ProfileFact.Confidence confidenceByCount(int manyAt) {
        int total = total();
        return total == 0 ? ProfileFact.Confidence.NONE
                : total >= manyAt ? ProfileFact.Confidence.MEDIUM : ProfileFact.Confidence.LOW;
    }

    static Comparator<String> byVersion() {
        return (a, b) -> {
            String[] x = a.split("\\D+");
            String[] y = b.split("\\D+");
            for (int i = 0; i < Math.max(x.length, y.length); i++) {
                int p = i < x.length && !x[i].isEmpty() ? Integer.parseInt(x[i]) : 0;
                int q = i < y.length && !y[i].isEmpty() ? Integer.parseInt(y[i]) : 0;
                if (p != q) {
                    return Integer.compare(p, q);
                }
            }
            return 0;
        };
    }
}
