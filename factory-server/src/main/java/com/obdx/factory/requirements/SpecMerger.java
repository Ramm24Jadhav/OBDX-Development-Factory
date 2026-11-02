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
                unique(specs, RequirementSpec::apis, SpecMerger::apiKey, (a, b) -> a),
                unique(specs, RequirementSpec::hostInteractions, h -> h.system() + " " + h.description(), (a, b) -> a),
                unique(specs, RequirementSpec::messages, m -> m.code() != null ? m.code() : m.text(), (a, b) -> a),
                questions(specs.stream().flatMap(s -> s.openQuestions().stream()).toList()),
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

    private static final java.util.regex.Pattern METHOD = java.util.regex.Pattern.compile("(?i)^\\s*(GET|POST|PUT|PATCH|DELETE)\\b\\s*");

    /**
     * An API is its method and path: GET and POST /payments/standingInstructions are two APIs. The method is taken from
     * the API's method, else from the start of its name ("GET /x"), and is not counted twice.
     */
    static String apiKey(RequirementSpec.Api api) {
        String name = api.name() == null ? "" : api.name();
        java.util.regex.Matcher m = METHOD.matcher(name);
        String method = api.method() != null && !api.method().isBlank() ? api.method() : m.find() ? m.group(1) : "";
        // The path, from the name or else the description ("Validate beneficiary" described as POST /payments/...)
        String path = pathOf(name);
        if (path == null) {
            path = pathOf(api.description());
        }
        return method.strip().toUpperCase(Locale.ROOT) + " " + (path != null ? path : METHOD.matcher(name).replaceFirst(""));
    }

    private static final java.util.regex.Pattern PATH = java.util.regex.Pattern.compile("(?<![\\w/])/[A-Za-z{][\\w{}.-]*(?:/[\\w{}.-]+){0,15}");

    /** The first REST path in a text (/payments/beneficiaries/{id}), without trailing punctuation; null when there is none. */
    static String pathOf(String text) {
        if (text == null) {
            return null;
        }
        java.util.regex.Matcher m = PATH.matcher(text.length() > 300 ? text.substring(0, 300) : text);
        return m.find() ? m.group().replaceAll("[.,;:]+$", "") : null;
    }

    /** The most questions compared with each other; the others are compared by their normalised text only. */
    static final int MAX_COMPARED = 200;

    /**
     * The open questions of all sections, once each: the same question in other words is one (the first kept, with the
     * options, reason and answer a later one adds). Each question's words are read once; the first
     * {@link #MAX_COMPARED} are compared with each other, the rest only by their normalised text, so a draft with
     * thousands of questions stays quick.
     */
    static List<RequirementSpec.OpenQuestion> questions(List<RequirementSpec.OpenQuestion> all) {
        List<RequirementSpec.OpenQuestion> kept = new ArrayList<>();
        List<DocumentStructure.Prepared> prepared = new ArrayList<>();
        Map<String, Integer> byText = new java.util.HashMap<>();
        for (RequirementSpec.OpenQuestion q : all) {
            String key = normalize(capped(q.question()));
            Integer same = byText.get(key);
            DocumentStructure.Prepared words = null;
            if (same == null && kept.size() < MAX_COMPARED) {
                words = DocumentStructure.prepare(q.question());
                for (int i = 0; i < prepared.size() && same == null; i++) {
                    if (DocumentStructure.sameQuestion(prepared.get(i), words)) {
                        same = i;
                    }
                }
            }
            if (same != null) {
                kept.set(same, joined(kept.get(same), q));
                continue;
            }
            byText.putIfAbsent(key, kept.size());
            kept.add(q);
            if (words != null) {
                prepared.add(words);
            }
        }
        return kept;
    }

    /**
     * The first question with what a later one of the same adds: its options when it has none, its reason; its answer
     * only when it is surely the same question (the same words, or the same ID of the document), as an answer given to
     * other words may answer something else.
     */
    static RequirementSpec.OpenQuestion joined(RequirementSpec.OpenQuestion k, RequirementSpec.OpenQuestion q) {
        boolean options = k.options().isEmpty() && !q.options().isEmpty();
        boolean surely = sameWords(k, q) || sameId(k, q);
        return new RequirementSpec.OpenQuestion(k.question(), first(k.reason(), q.reason()), first(k.reference(), q.reference()),
                options ? q.options() : k.options(), first(k.suggestedAnswer(), options ? q.suggestedAnswer() : null),
                surely ? first(k.answer(), q.answer()) : k.answer());
    }

    /** Whether two open questions ask the same thing: the same words, or the same question as DocumentStructure tells it. */
    static boolean sameQuestion(RequirementSpec.OpenQuestion a, RequirementSpec.OpenQuestion b) {
        return sameWords(a, b) || DocumentStructure.sameQuestion(DocumentStructure.prepare(a.question()), DocumentStructure.prepare(b.question()));
    }

    /** The same words, case and punctuation aside. */
    static boolean sameWords(RequirementSpec.OpenQuestion a, RequirementSpec.OpenQuestion b) {
        return normalize(capped(a.question())).equals(normalize(capped(b.question())));
    }

    /** Both name the same ID of the document (OQ-001) as their reference. */
    static boolean sameId(RequirementSpec.OpenQuestion a, RequirementSpec.OpenQuestion b) {
        return a.reference() != null && b.reference() != null && documentId(a.reference()) && !REQUIREMENT_ID.matcher(a.reference().strip()).matches()
                && normalize(a.reference()).equals(normalize(b.reference()));
    }

    /** A requirement's or criterion's ID (FR-001, AC-2): many questions may name the same one, so it says no two are one. */
    private static final java.util.regex.Pattern REQUIREMENT_ID = java.util.regex.Pattern.compile("(?i)(?:FR|BR|AC|NFR|REQ|US|UC)[-_ ]?\\d{1,4}");

    /**
     * How surely the model's question restates one of the document's: 3 the same ID of the document, 2 the same words,
     * 1 the same question (see DocumentStructure.sameQuestion), 0 not at all. A drafted question restates the one it
     * matches best (see DocumentStructure.apply).
     */
    static int restatement(RequirementSpec.OpenQuestion document, DocumentStructure.Prepared documentWords,
                           RequirementSpec.OpenQuestion drafted, DocumentStructure.Prepared draftedWords) {
        return sameId(document, drafted) ? 3 : sameWords(document, drafted) ? 2 : DocumentStructure.sameQuestion(documentWords, draftedWords) ? 1 : 0;
    }

    /**
     * Whether the model's question restates one of the document's own (a row of its "Open questions" table): the same
     * question as {@link #sameQuestion} tells it, or the model gave it the document question's ID as its reference
     * ("OQ-001" for both "Should a NONE name match be VALID or INVALID?" and "How should a 'NONE' name match be
     * treated?"). Two of the document's own questions are never taken as one: the analysts asked both.
     */
    static boolean restates(RequirementSpec.OpenQuestion document, RequirementSpec.OpenQuestion drafted) {
        return restates(document, DocumentStructure.prepare(document.question()), drafted, DocumentStructure.prepare(drafted.question()));
    }

    /** {@link #restates(RequirementSpec.OpenQuestion, RequirementSpec.OpenQuestion)} with the words read before. */
    static boolean restates(RequirementSpec.OpenQuestion document, DocumentStructure.Prepared documentWords, RequirementSpec.OpenQuestion drafted,
                            DocumentStructure.Prepared draftedWords) {
        return restatement(document, documentWords, drafted, draftedWords) > 0;
    }

    /** The most of a question's text read to compare it. */
    static final int MAX_QUESTION = 500;

    private static String capped(String text) {
        return text == null ? "" : text.length() > MAX_QUESTION ? text.substring(0, MAX_QUESTION) : text;
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
