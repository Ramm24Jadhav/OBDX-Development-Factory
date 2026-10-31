package com.obdx.factory.requirements;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.TreeSet;

/**
 * Keeps a drafted spec to what the document says, without a model: APIs the document never names are dropped (a BRD
 * that prescribes no API gets none invented), screens with the same words in another order are one screen ("Review
 * Transfer" and "Transfer Review"), and a screen a functional requirement needs is added when the document names it
 * ("Transfer History"), so every requirement has a screen to design.
 */
final class SpecGrounding {

    private SpecGrounding() {
    }

    static RequirementSpec apply(RequirementSpec spec, String documentText) {
        String doc = words(documentText == null ? "" : documentText);
        if (doc.isBlank()) {
            return spec;
        }
        // APIs: only those the document names (the analyst's decisions count as the document)
        StringBuilder decided = new StringBuilder(doc);
        spec.decisions().forEach(d -> decided.append(' ').append(words(d.answer())));
        String known = decided.toString();
        List<RequirementSpec.Api> apis = spec.apis().stream().filter(a -> known.contains(words(a.name())) || pathNamed(a, known)).toList();

        // Screens: one per set of words, the first name kept, their fields and actions together
        Map<String, RequirementSpec.Screen> screens = new LinkedHashMap<>();
        for (RequirementSpec.Screen s : spec.screens()) {
            screens.merge(screenKey(s.name()), s, SpecMerger::mergeScreens);
        }
        // A screen a requirement needs and the document names, which the draft left out. Only for a requirement the draft
        // gave no screen at all: one that has its screen merely mentions others it passes through (an existing "Review
        // Transfer" in a change to the initiate screen), which are not designed again
        for (RequirementSpec.FunctionalRequirement r : spec.requirements()) {
            if (r.screens().stream().anyMatch(n -> screens.containsKey(screenKey(n)))) {
                continue;
            }
            for (String name : r.screens()) {
                String key = screenKey(name);
                if (!key.isEmpty() && !screens.containsKey(key) && doc.contains(words(name))) {
                    screens.put(key, new RequirementSpec.Screen(name, "unknown", r.description() != null ? r.description() : r.title(),
                            r.id(), List.of(), List.of(), List.of()));
                }
            }
        }
        // Requirements name the screens as the spec does
        Map<String, String> names = new LinkedHashMap<>();
        screens.forEach((key, s) -> names.put(key, s.name()));
        List<RequirementSpec.FunctionalRequirement> requirements = spec.requirements().stream()
                .map(r -> new RequirementSpec.FunctionalRequirement(r.id(), r.title(), r.description(), r.priority(),
                        r.screens().stream().map(n -> names.getOrDefault(screenKey(n), n)).distinct().toList()))
                .toList();
        if (apis.size() == spec.apis().size() && screens.size() == spec.screens().size() && requirements.equals(spec.requirements())) {
            return spec;
        }
        return new RequirementSpec(spec.title(), spec.summary(), new ArrayList<>(screens.values()), spec.businessRules(), spec.roles(), apis,
                spec.hostInteractions(), spec.messages(), spec.openQuestions(), spec.decisions(), spec.scope(), spec.outOfScope(),
                spec.assumptions(), requirements, spec.acceptanceCriteria(), spec.nonFunctional());
    }

    private static final java.util.regex.Pattern PATH = java.util.regex.Pattern.compile("(?<![\\w/])/[\\w{}.-]+(?:/[\\w{}.-]+)*");
    private static final java.util.regex.Pattern METHOD = java.util.regex.Pattern.compile("(?i)\\b(GET|POST|PUT|PATCH|DELETE)\\b");

    /**
     * Whether the document names an API by its method and path, though not as one piece of text: "POST, GET, GET
     * /{instructionId}, DELETE on /payments/standingInstructions" names GET /payments/standingInstructions/{instructionId}.
     * Every fixed segment of the path, and the method, must be words of the document.
     */
    static boolean pathNamed(RequirementSpec.Api api, String known) {
        String text = (api.name() == null ? "" : api.name()) + " " + (api.description() == null ? "" : api.description());
        // An API name is short; a long text is cut so that the repeated path group cannot overflow the stack
        java.util.regex.Matcher path = PATH.matcher(text.length() > 300 ? text.substring(0, 300) : text);
        if (!path.find()) {
            return false;
        }
        List<String> fixed = new ArrayList<>();
        for (String segment : path.group().split("/")) {
            if (!segment.isEmpty() && !segment.startsWith("{") && !segment.matches("v\\d+")) {
                fixed.add(words(segment));
            }
        }
        if (fixed.isEmpty() || !fixed.stream().allMatch(known::contains)) {
            return false;
        }
        java.util.regex.Matcher method = METHOD.matcher(api.method() == null ? text : api.method());
        return !method.find() || known.contains(" " + method.group(1).toLowerCase(Locale.ROOT) + " ");
    }

    /** "Transfer Review screen" and "Review Transfer" are the same screen. */
    static String screenKey(String name) {
        TreeSet<String> words = new TreeSet<>();
        for (String w : (name == null ? "" : name).toLowerCase(Locale.ROOT).split("[^a-z0-9]+")) {
            if (!w.isEmpty() && !w.equals("screen") && !w.equals("page")) {
                words.add(w);
            }
        }
        return String.join(" ", words);
    }

    private static String words(String text) {
        return " " + (text == null ? "" : text).toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]+", " ").strip() + " ";
    }
}
