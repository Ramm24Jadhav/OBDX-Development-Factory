package com.obdx.factory.design;

import com.obdx.factory.requirements.RequirementSpec;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
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

    /** How the studio names a criterion: its ID, or its text when the document gave it none. */
    static String criterionKey(RequirementSpec.AcceptanceCriterion criterion) {
        return criterion.id() == null || criterion.id().isBlank() ? String.valueOf(criterion.description()) : criterion.id();
    }

    /**
     * The acceptance criteria each screen helps meet: those of the requirements the screen serves. A criterion that
     * names some of those screens ("the Review screen shows the fee") belongs to them only.
     */
    static Map<UUID, List<String>> criteriaByScreen(List<Screen> ordered, List<Flow> flows) {
        Map<UUID, List<String>> byScreen = new LinkedHashMap<>();
        ordered.forEach(s -> byScreen.put(s.id(), new ArrayList<>()));
        Map<String, RequirementSpec.AcceptanceCriterion> criteria = new LinkedHashMap<>();
        Map<String, Set<UUID>> candidates = new LinkedHashMap<>();
        for (Flow f : flows) {
            for (RequirementSpec.AcceptanceCriterion c : f.criteria()) {
                criteria.putIfAbsent(criterionKey(c), c);
                candidates.computeIfAbsent(criterionKey(c), k -> new LinkedHashSet<>()).addAll(f.screens());
            }
        }
        candidates.forEach((key, screens) -> {
            String text = " " + key(criteria.get(key).description()) + " ";
            List<UUID> matched = ordered.stream().filter(s -> screens.contains(s.id()) && !key(s.name()).isEmpty()
                    && text.contains(" " + key(s.name()) + " ")).map(Screen::id).toList();
            // "Add Beneficiary – Review" names that screen, not also "Add Beneficiary"
            List<String> names = matched.stream().map(id -> key(ordered.stream().filter(s -> s.id().equals(id)).findFirst().orElseThrow().name())).toList();
            List<UUID> named = matched.stream().filter(id -> {
                String own = names.get(matched.indexOf(id));
                return names.stream().noneMatch(other -> other.length() > own.length() && (" " + other + " ").contains(" " + own + " "));
            }).toList();
            (named.isEmpty() ? screens : named).forEach(id -> byScreen.get(id).add(key));
        });
        return byScreen;
    }

    /** The criteria no screen helps meet: linked to no requirement, or only to requirements without screens. */
    static List<String> uncovered(List<RequirementSpec.AcceptanceCriterion> criteria, Map<UUID, List<String>> byScreen) {
        Set<String> covered = new HashSet<>();
        byScreen.values().forEach(covered::addAll);
        return criteria.stream().map(RequirementFlows::criterionKey).filter(k -> !covered.contains(k)).distinct().toList();
    }

    /** Option lists the generator fills in when the document names none ("Option 1", "Column 1": ScreenModels). */
    private static final Set<String> STAND_INS = Set.of("option 1", "option 2", "column 1", "column 2");

    /**
     * The labels of a screen's choices and tables whose values the document does not give, so an analyst must confirm
     * them. Lists loaded from an API and the bank's own components are not counted.
     */
    static List<String> unconfirmed(ScreenModel model) {
        if (model == null) {
            return List.of();
        }
        return model.sections().stream().flatMap(s -> s.components().stream())
                .filter(c -> Set.of("select", "radio", "checkbox", "table").contains(c.type()))
                .filter(c -> c.dataSource() == null || c.dataSource().api() == null || c.dataSource().api().isBlank())
                .filter(c -> c.options() == null || c.options().stream().allMatch(o -> o == null || o.isBlank()
                        || STAND_INS.contains(o.trim().toLowerCase(Locale.ROOT))))
                .map(c -> c.label() == null || c.label().isBlank() ? String.valueOf(c.name()) : c.label())
                .toList();
    }

    /**
     * An open question of the spec that has no answer yet, with the requirements and screens it mentions by ID or name
     * (none: it concerns the whole BRD).
     */
    record Question(String question, String reason, String reference, List<String> options, String suggestedAnswer,
                    List<String> requirements, List<UUID> screens) {
    }

    /**
     * Design decisions the BRD leaves open on a screen made from it: whether it is a new screen or a change to an
     * existing one, and, for each field it captures, whether the field is mandatory. A field someone has since made
     * mandatory is decided. (An approved spec has no open questions, so these are what is left for an analyst.)
     */
    static List<String> openDecisions(RequirementSpec spec, Screen screen) {
        if (spec == null || spec.screens() == null || screen.model() == null) {
            return List.of();
        }
        RequirementSpec.Screen source = spec.screens().stream()
                .filter(s -> s != null && !key(s.name()).isEmpty() && key(s.name()).equals(key(screen.name()))).findFirst().orElse(null);
        if (source == null) {
            return List.of();
        }
        List<String> open = new ArrayList<>();
        if ("unknown".equalsIgnoreCase(source.changeType())) {
            open.add("New screen, or a change to an existing OBDX screen? The BRD does not say.");
        }
        List<ScreenModel.Component> components = screen.model().sections().stream().flatMap(s -> s.components().stream()).toList();
        for (RequirementSpec.Field field : source.fields() == null ? List.<RequirementSpec.Field>of() : source.fields()) {
            if (field == null || field.mandatory() != null) {
                continue;
            }
            components.stream()
                    .filter(c -> c.name() != null && c.name().equals(field.name()) && c.required() == null && !Boolean.TRUE.equals(c.readonly())
                            && !"display".equals(c.type()) && !"table".equals(c.type()))
                    .findFirst()
                    .ifPresent(c -> open.add("Is \"" + (c.label() == null ? c.name() : c.label()) + "\" mandatory? The BRD does not say."));
        }
        return open;
    }

    static List<Question> unresolved(RequirementSpec spec, List<Screen> ordered) {
        if (spec == null || spec.openQuestions() == null) {
            return List.of();
        }
        List<Question> questions = new ArrayList<>();
        for (RequirementSpec.OpenQuestion q : spec.openQuestions()) {
            if (q == null || q.question() == null || (q.answer() != null && !q.answer().isBlank())) {
                continue;
            }
            String text = " " + key(q.question() + " " + (q.reason() == null ? "" : q.reason()) + " "
                    + (q.reference() == null ? "" : q.reference())) + " ";
            List<String> requirements = spec.requirements().stream().map(RequirementSpec.FunctionalRequirement::id)
                    .filter(id -> id != null && !key(id).isEmpty() && text.contains(" " + key(id) + " ")).toList();
            List<UUID> screens = ordered.stream().filter(s -> !key(s.name()).isEmpty() && text.contains(" " + key(s.name()) + " "))
                    .map(Screen::id).toList();
            questions.add(new Question(q.question(), q.reason(), q.reference(), q.options(), q.suggestedAnswer(), requirements, screens));
        }
        return questions;
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
