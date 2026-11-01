package com.obdx.factory.design;

import com.obdx.factory.requirements.RequirementSpec;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;

/**
 * Which screens serve which functional requirement of a BRD, and the order the customer meets them in. Read from the
 * spec (each requirement names its screens) and the designs' names and stages, so nothing extra is stored.
 */
final class RequirementFlows {

    private RequirementFlows() {
    }

    /** A design as the mapping needs it, in creation order. */
    record Screen(UUID id, String name, ScreenModel model) {
        String stage() {
            return model == null ? null : model.stage();
        }
    }

    /** A functional requirement with its screens in flow order, and the rules and criteria that apply to it. */
    record Flow(String id, String title, String description, String priority, List<String> screenNames, List<UUID> screens,
                List<RequirementSpec.BusinessRule> rules, List<RequirementSpec.AcceptanceCriterion> criteria) {
    }

    /**
     * The screens in the order of the flow: as created (the spec's order), with each review and confirmation screen made
     * from an initiate screen ("Add Payee – Review") moved right after it.
     */
    static List<Screen> order(List<Screen> screens) {
        List<Screen> main = new ArrayList<>();
        List<Screen> steps = new ArrayList<>();
        for (Screen s : screens) {
            if (initiateOf(s, screens) != null) {
                steps.add(s);
            } else {
                main.add(s);
            }
        }
        List<Screen> ordered = new ArrayList<>();
        for (Screen s : main) {
            ordered.add(s);
            steps.stream().filter(step -> initiateOf(step, screens) == s)
                    .sorted((a, b) -> Integer.compare(stepRank(a), stepRank(b))).forEach(ordered::add);
        }
        // Screens whose steps point at each other (a cycle) belong to no main screen: they come last, not left out
        screens.stream().filter(s -> !ordered.contains(s)).forEach(ordered::add);
        return ordered;
    }

    /** One flow per functional requirement of the spec, in the spec's order. */
    static List<Flow> flows(RequirementSpec spec, List<Screen> ordered) {
        List<Flow> flows = new ArrayList<>();
        if (spec == null) {
            return flows;
        }
        for (RequirementSpec.FunctionalRequirement r : spec.requirements()) {
            Set<String> names = new HashSet<>();
            r.screens().forEach(n -> names.add(key(n)));
            Set<UUID> members = new LinkedHashSet<>();
            for (Screen s : ordered) {
                Screen initiate = initiateOf(s, ordered);
                if (names.contains(key(s.name())) || (initiate != null && names.contains(key(initiate.name())))) {
                    members.add(s.id());
                }
            }
            List<RequirementSpec.BusinessRule> rules = spec.businessRules() == null ? List.of() : spec.businessRules().stream()
                    .filter(rule -> rule.screens() != null && rule.screens().stream().anyMatch(n -> names.contains(key(n))))
                    .toList();
            List<RequirementSpec.AcceptanceCriterion> criteria = r.id() == null ? List.of() : spec.acceptanceCriteria().stream()
                    .filter(c -> c.requirements().stream().anyMatch(id -> r.id().equalsIgnoreCase(id))).toList();
            flows.add(new Flow(r.id(), r.title(), r.description(), r.priority(), r.screens(), List.copyOf(members), rules, criteria));
        }
        return flows;
    }

    /** The screens no functional requirement names, in flow order. */
    static List<UUID> others(List<Screen> ordered, List<Flow> flows) {
        Set<UUID> mapped = new HashSet<>();
        flows.forEach(f -> mapped.addAll(f.screens()));
        return ordered.stream().map(Screen::id).filter(id -> !mapped.contains(id)).toList();
    }

    /**
     * Whether a screen takes input for a transaction but has no review and confirmation screens after it, so the
     * designer can offer to add them.
     */
    static boolean needsSteps(Screen screen, List<Screen> ordered) {
        String stage = screen.stage();
        if (screen.model() == null || "review".equals(stage) || "confirm".equals(stage) || "inquiry".equals(stage)
                || !ScreenDesignService.capturesInput(screen.model())) {
            return false;
        }
        int at = ordered.indexOf(screen);
        Screen next = at >= 0 && at + 1 < ordered.size() ? ordered.get(at + 1) : null;
        return next == null || !("review".equals(next.stage()) || "confirm".equals(next.stage()));
    }

    /** The initiate screen a review or confirmation screen was made from, by its name ("Add Payee – Review"); or null. */
    private static Screen initiateOf(Screen screen, List<Screen> screens) {
        String stage = screen.stage();
        int dash = screen.name() == null ? -1 : screen.name().lastIndexOf(" – ");
        if (dash <= 0 || !("review".equals(stage) || "confirm".equals(stage))) {
            return null;
        }
        String base = key(screen.name().substring(0, dash));
        return screens.stream().filter(s -> s != screen && key(s.name()).equals(base)).findFirst().orElse(null);
    }

    private static int stepRank(Screen screen) {
        return "review".equals(screen.stage()) ? 0 : 1;
    }

    /** "Add  Payee" and "add payee" are the same screen. */
    static String key(String name) {
        return name == null ? "" : name.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]+", " ").trim();
    }
}
