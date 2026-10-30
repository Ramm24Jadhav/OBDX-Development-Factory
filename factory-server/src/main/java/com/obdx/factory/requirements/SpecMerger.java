package com.obdx.factory.requirements;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.function.BinaryOperator;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Combines specs drafted from different sections of one long document. Screens and fields with the same name are
 * merged, keeping the first value found for each attribute and adding what later sections add; other lists are
 * combined without duplicates. Business rules keep the document's IDs (BR-001); those without one are numbered after them.
 */
public final class SpecMerger {

    private SpecMerger() {
    }

    public static RequirementSpec merge(List<RequirementSpec> specs, String title) {
        if (specs.isEmpty()) {
            return RequirementSpec.empty(title);
        }
        String summary = specs.stream().map(RequirementSpec::summary).filter(Objects::nonNull).distinct()
                .collect(Collectors.joining(" "));
        List<RequirementSpec.BusinessRule> rules = unique(specs, RequirementSpec::businessRules, RequirementSpec.BusinessRule::description, (a, b) -> a);
        // The document's own rule IDs (BR-001) stay, for traceability; rules without one, or with an ID another rule
        // already has, are numbered after the highest
        java.util.Set<String> taken = new java.util.HashSet<>();
        int next = 1;
        String pattern = "BR-%d";
        for (RequirementSpec.BusinessRule rule : rules) {
            if (documentId(rule.id())) {
                if (next == 1) {
                    // Numbered like the document's own: R7 → R8, BR-010 → BR-011
                    String digits = rule.id().strip().replaceAll("^\\D*", "");
                    pattern = rule.id().strip().replaceAll("\\d+$", "") + (digits.startsWith("0") ? "%0" + digits.length() + "d" : "%d");
                }
                next = Math.max(next, number(rule.id()) + 1);
            }
        }
        List<RequirementSpec.BusinessRule> numbered = new ArrayList<>();
        for (RequirementSpec.BusinessRule rule : rules) {
            String id = documentId(rule.id()) && taken.add(normalize(rule.id())) ? rule.id() : pattern.formatted(next++);
            numbered.add(new RequirementSpec.BusinessRule(id, rule.description(), rule.screens(), rule.reference()));
        }
        return new RequirementSpec(
                specs.stream().map(RequirementSpec::title).filter(Objects::nonNull).findFirst().orElse(title),
                summary.isEmpty() ? null : summary,
                unique(specs, RequirementSpec::screens, RequirementSpec.Screen::name, SpecMerger::mergeScreens),
                numbered,
                unique(specs, RequirementSpec::roles, RequirementSpec.Role::name, (a, b) -> a.access() != null ? a : b),
                unique(specs, RequirementSpec::apis, RequirementSpec.Api::name, (a, b) -> a),
                unique(specs, RequirementSpec::hostInteractions, h -> h.system() + " " + h.description(), (a, b) -> a),
                unique(specs, RequirementSpec::messages, m -> m.code() != null ? m.code() : m.text(), (a, b) -> a),
                unique(specs, RequirementSpec::openQuestions, RequirementSpec.OpenQuestion::question, (a, b) -> a),
                unique(specs, RequirementSpec::decisions, RequirementSpec.Decision::question, (a, b) -> b),
                unique(specs, RequirementSpec::scope, s -> s, (a, b) -> a),
                unique(specs, RequirementSpec::outOfScope, s -> s, (a, b) -> a),
                unique(specs, RequirementSpec::assumptions, s -> s, (a, b) -> a),
                unique(specs, RequirementSpec::requirements, r -> r.id() != null ? r.id() : r.description(),
                        (a, b) -> new RequirementSpec.FunctionalRequirement(a.id(), first(a.title(), b.title()), first(a.description(), b.description()),
                                first(a.priority(), b.priority()), uniqueList(a.screens(), b.screens(), s -> s, (x, y) -> x))),
                unique(specs, RequirementSpec::acceptanceCriteria, c -> c.id() != null ? c.id() : c.description(),
                        (a, b) -> new RequirementSpec.AcceptanceCriterion(a.id(), first(a.description(), b.description()),
                                uniqueList(a.requirements(), b.requirements(), s -> s, (x, y) -> x))),
                unique(specs, RequirementSpec::nonFunctional, n -> n.id() != null ? n.id() : n.description(), (a, b) -> a));
    }

    /** An ID the document gave (BR-001, BR-12): letters, a dash or none, and a number. */
    static boolean documentId(String id) {
        return id != null && id.strip().matches("[A-Za-z]{1,6}[-_ ]?\\d{1,4}");
    }

    private static int number(String id) {
        return Integer.parseInt(id.replaceAll("\\D", ""));
    }

    static RequirementSpec.Screen mergeScreens(RequirementSpec.Screen a, RequirementSpec.Screen b) {
        String changeType = !"unknown".equals(a.changeType()) ? a.changeType() : b.changeType();
        String description = a.description() == null ? b.description()
                : b.description() == null || a.description().contains(b.description()) ? a.description()
                : a.description() + " " + b.description();
        return new RequirementSpec.Screen(a.name(), changeType, description, first(a.reference(), b.reference()),
                uniqueList(a.fields(), b.fields(), RequirementSpec.Field::name, SpecMerger::mergeFields),
                uniqueList(a.actions(), b.actions(), RequirementSpec.Action::name, (x, y) -> x.description() != null ? x : y),
                uniqueList(a.relatedCode(), b.relatedCode(), s -> s, (x, y) -> x));
    }

    static RequirementSpec.Field mergeFields(RequirementSpec.Field a, RequirementSpec.Field b) {
        return new RequirementSpec.Field(a.name(), first(a.label(), b.label()), first(a.type(), b.type()),
                a.mandatory() != null ? a.mandatory() : b.mandatory(),
                uniqueList(a.validations(), b.validations(), s -> s, (x, y) -> x),
                first(a.defaultValue(), b.defaultValue()), first(a.source(), b.source()), first(a.notes(), b.notes()));
    }

    private static <T> List<T> unique(List<RequirementSpec> specs, Function<RequirementSpec, List<T>> items,
                                      Function<T, String> key, BinaryOperator<T> combine) {
        List<T> all = specs.stream().flatMap(spec -> items.apply(spec).stream()).toList();
        return uniqueList(all, List.of(), key, combine);
    }

    private static <T> List<T> uniqueList(List<T> first, List<T> second, Function<T, String> key, BinaryOperator<T> combine) {
        Map<String, T> byKey = new LinkedHashMap<>();
        for (List<T> list : List.of(first, second)) {
            for (T item : list) {
                byKey.merge(normalize(key.apply(item)), item, combine);
            }
        }
        return new ArrayList<>(byKey.values());
    }

    /** "Fund Transfer screen" and "fund-transfer Screen" count as the same name. */
    static String normalize(String value) {
        return value == null ? "" : value.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]+", "");
    }

    private static String first(String a, String b) {
        return a != null ? a : b;
    }
}
