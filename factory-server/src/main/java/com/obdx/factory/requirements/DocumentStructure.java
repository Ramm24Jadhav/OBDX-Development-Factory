package com.obdx.factory.requirements;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.function.BiFunction;
import java.util.function.Function;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * What a BRD states in its own structure, read without a model: tables whose rows carry IDs (functional requirements
 * FR-001, business rules BR-001, acceptance criteria AC-001, non-functional requirements NFR-001, open questions
 * OQ-001), the traceability matrix that links requirements to their criteria, and the lists under the scope,
 * out-of-scope and assumption headings. The document's words and IDs are kept exactly, whatever model drafts the rest:
 * a small local model summarising a long table loses rows and renumbers them.
 */
final class DocumentStructure {

    record Structure(List<String> scope, List<String> outOfScope, List<String> assumptions,
                     List<RequirementSpec.FunctionalRequirement> requirements, List<RequirementSpec.AcceptanceCriterion> criteria,
                     List<RequirementSpec.NonFunctional> nonFunctional, List<RequirementSpec.BusinessRule> rules,
                     List<RequirementSpec.OpenQuestion> questions) {

        boolean isEmpty() {
            return scope.isEmpty() && outOfScope.isEmpty() && assumptions.isEmpty() && requirements.isEmpty() && criteria.isEmpty()
                    && nonFunctional.isEmpty() && rules.isEmpty() && questions.isEmpty();
        }
    }

    private static final Pattern ID = Pattern.compile("^([A-Z]{1,5})[-_ ]?(\\d{1,4})$");
    private static final Pattern ANY_ID = Pattern.compile("\\b([A-Z]{1,5}-\\d{1,4})\\b");
    private static final Pattern HEADING = Pattern.compile("^#{1,6}\\s+(?:[\\d.]+\\s*)?(.+?)\\s*$");
    /** "**Out of scope**", "__Assumptions:__", "**Out of scope:**" */
    private static final Pattern LABEL = Pattern.compile("^(?:\\*\\*|__)\\s*(.+?)\\s*:?\\s*(?:\\*\\*|__)\\s*:?$");
    /** The lists a BRD keeps under its scope; a bold label naming one of them starts that list. */
    private static final Set<String> LISTS = Set.of("scope", "in scope", "out of scope", "exclusions", "assumptions", "dependencies",
            "constraints", "risks", "not in scope");

    private DocumentStructure() {
    }

    static Structure read(String text) {
        List<String> lines = List.of((text == null ? "" : text).replace("\r\n", "\n").split("\n"));
        List<RequirementSpec.FunctionalRequirement> requirements = new ArrayList<>();
        List<RequirementSpec.AcceptanceCriterion> criteria = new ArrayList<>();
        List<RequirementSpec.NonFunctional> nonFunctional = new ArrayList<>();
        List<RequirementSpec.BusinessRule> rules = new ArrayList<>();
        List<RequirementSpec.OpenQuestion> questions = new ArrayList<>();
        Map<String, Set<String>> criteriaOf = new LinkedHashMap<>();
        String heading = "";
        for (int i = 0; i < lines.size(); i++) {
            Matcher h = HEADING.matcher(lines.get(i));
            if (h.matches()) {
                heading = h.group(1);
                continue;
            }
            if (!isRow(lines.get(i)) || i + 1 >= lines.size() || !isSeparator(lines.get(i + 1))) {
                continue;
            }
            List<String> header = cells(lines.get(i));
            List<List<String>> rows = new ArrayList<>();
            int j = i + 2;
            while (j < lines.size() && isRow(lines.get(j))) {
                rows.add(cells(lines.get(j)));
                j++;
            }
            i = j - 1;
            String kind = kindOf(header, heading, rows);
            if (kind == null) {
                continue;
            }
            for (List<String> row : rows) {
                String id = row.getFirst().strip();
                if (!ID.matcher(id).matches()) {
                    continue;
                }
                String prefix = ID.matcher(id).replaceAll("$1");
                if (isTraceability(header)) {
                    // FR-001 | ... | AC-001, AC-002 | ...: the criteria that verify the requirement
                    if (prefix.equals("FR") || prefix.equals("REQ")) {
                        for (String cell : row.subList(1, row.size())) {
                            Matcher m = ANY_ID.matcher(cell);
                            while (m.find()) {
                                if (!m.group(1).startsWith(prefix)) {
                                    criteriaOf.computeIfAbsent(m.group(1), k -> new LinkedHashSet<>()).add(id);
                                }
                            }
                        }
                    }
                    continue;
                }
                switch (kind) {
                    case "FR" -> requirements.add(new RequirementSpec.FunctionalRequirement(id, cell(header, row, "requirement", "name", "title", "feature"),
                            longest(header, row, "statement", "description", "detail", "requirement"), cell(header, row, "priority", "moscow"), List.of()));
                    case "AC" -> criteria.add(new RequirementSpec.AcceptanceCriterion(id, longest(header, row, "criterion", "criteria", "given", "description"),
                            List.of()));
                    case "NFR" -> nonFunctional.add(new RequirementSpec.NonFunctional(id, cell(header, row, "category", "type", "area"),
                            longest(header, row, "requirement", "description", "statement")));
                    case "BR" -> rules.add(new RequirementSpec.BusinessRule(id, longest(header, row, "rule", "description"), List.of(), heading));
                    case "OQ" -> {
                        String owner = cell(header, row, "owner", "responsible");
                        String status = cell(header, row, "status");
                        if (status == null || !status.toLowerCase(Locale.ROOT).matches("closed|resolved|answered|done")) {
                            questions.add(new RequirementSpec.OpenQuestion(longest(header, row, "question", "description"),
                                    owner == null ? null : "For " + owner + " to answer.", id, List.of(), null, null));
                        }
                    }
                    default -> {
                    }
                }
            }
        }
        List<RequirementSpec.AcceptanceCriterion> linked = criteria.stream().map(c -> criteriaOf.containsKey(c.id())
                ? new RequirementSpec.AcceptanceCriterion(c.id(), c.description(), List.copyOf(criteriaOf.get(c.id()))) : c).toList();
        return new Structure(listUnder(lines, "in scope", "scope"), listUnder(lines, "out of scope", "exclusions"), listUnder(lines, "assumptions"),
                requirements.stream().filter(r -> r.description() != null || r.title() != null).toList(),
                linked.stream().filter(c -> c.description() != null).toList(),
                nonFunctional.stream().filter(n -> n.description() != null).toList(),
                rules.stream().filter(r -> r.description() != null).toList(),
                questions.stream().filter(q -> q.question() != null).toList());
    }

    /**
     * The spec with the document's own structure: its requirements, criteria, non-functional requirements and rules
     * as the document words them (keeping the screens the model linked them to), its scope lists, and its open
     * questions added to the model's. The model's own requirements, criteria and rules that the document's tables do
     * not have (a rule from an answer, or one stated in the prose) follow the document's rows.
     */
    static RequirementSpec apply(RequirementSpec spec, Structure doc) {
        if (doc.isEmpty()) {
            return spec;
        }
        List<RequirementSpec.FunctionalRequirement> requirements = merge(doc.requirements(), spec.requirements(),
                RequirementSpec.FunctionalRequirement::id, r -> r.description() != null ? r.description() : r.title(), (r, d) ->
                        new RequirementSpec.FunctionalRequirement(r.id(), r.title() != null ? r.title() : d == null ? null : d.title(),
                                r.description() != null ? r.description() : d == null ? null : d.description(), r.priority() != null ? r.priority()
                                : d == null ? null : d.priority(), d == null ? List.of() : d.screens()));
        List<RequirementSpec.AcceptanceCriterion> criteria = merge(doc.criteria(), spec.acceptanceCriteria(),
                RequirementSpec.AcceptanceCriterion::id, RequirementSpec.AcceptanceCriterion::description, (c, d) ->
                        c.requirements().isEmpty() && d != null ? new RequirementSpec.AcceptanceCriterion(c.id(), c.description(), d.requirements()) : c);
        List<RequirementSpec.BusinessRule> rules = merge(doc.rules(), spec.businessRules(), RequirementSpec.BusinessRule::id,
                RequirementSpec.BusinessRule::description, (r, d) ->
                        new RequirementSpec.BusinessRule(r.id(), r.description(), d == null ? List.of() : d.screens(), r.reference()));
        // The document's questions first (the analysts asked them), then the model's that are not the same question
        List<RequirementSpec.OpenQuestion> questions = new ArrayList<>(doc.questions().stream()
                .filter(d -> spec.decisions().stream().noneMatch(x -> similar(x.question(), d.question()))).toList());
        for (RequirementSpec.OpenQuestion q : spec.openQuestions()) {
            if (doc.questions().stream().noneMatch(d -> similar(d.question(), q.question()))) {
                questions.add(q);
            }
        }
        return new RequirementSpec(spec.title(), spec.summary(), spec.screens(), rules, spec.roles(), spec.apis(), spec.hostInteractions(),
                spec.messages(), questions, spec.decisions(),
                doc.scope().isEmpty() ? spec.scope() : doc.scope(),
                doc.outOfScope().isEmpty() ? spec.outOfScope() : doc.outOfScope(),
                doc.assumptions().isEmpty() ? spec.assumptions() : doc.assumptions(),
                requirements, criteria, doc.nonFunctional().isEmpty() ? spec.nonFunctional() : doc.nonFunctional());
    }

    /**
     * The document's rows in its order, each joined with the drafted item of the same ID or, failing that, the same
     * text; then the drafted items that match none of them. Without document rows the draft stands as it is.
     */
    private static <T> List<T> merge(List<T> documented, List<T> drafted, Function<T, String> id, Function<T, String> text,
                                     BiFunction<T, T, T> join) {
        if (documented.isEmpty()) {
            return drafted;
        }
        List<T> left = new ArrayList<>(drafted);
        List<T> merged = new ArrayList<>();
        for (T row : documented) {
            T match = left.stream().filter(d -> id.apply(d) != null && key(id.apply(d)).equals(key(id.apply(row)))).findFirst()
                    .orElseGet(() -> left.stream().filter(d -> similar(text.apply(d), text.apply(row))).findFirst().orElse(null));
            left.remove(match);
            merged.add(join.apply(row, match));
        }
        Set<String> ids = new LinkedHashSet<>();
        documented.forEach(row -> ids.add(key(id.apply(row))));
        for (T d : left) {
            // The model's copy of a documented row under its ID, or the same text again, is left out
            if ((id.apply(d) == null || !ids.contains(key(id.apply(d)))) && documented.stream().noneMatch(row -> similar(text.apply(d), text.apply(row)))) {
                merged.add(d);
            }
        }
        return merged;
    }

    /**
     * What a table holds, from the IDs in its first column (most rows FR-…: functional requirements). The one-letter
     * prefixes R and F count only where the header or heading says rules or requirements (R-01 is as often a risk).
     */
    private static String kindOf(List<String> header, String heading, List<List<String>> rows) {
        Map<String, Integer> counts = new LinkedHashMap<>();
        for (List<String> row : rows) {
            Matcher m = ID.matcher(row.getFirst().strip());
            if (m.matches()) {
                counts.merge(m.group(1), 1, Integer::sum);
            }
        }
        String prefix = counts.entrySet().stream().max(Map.Entry.comparingByValue()).map(Map.Entry::getKey).orElse(null);
        if (prefix == null || counts.get(prefix) * 2 < rows.size()) {
            return null;
        }
        String says = (String.join(" ", header) + " " + heading).toLowerCase(Locale.ROOT);
        boolean risks = says.contains("risk");
        return switch (prefix) {
            case "FR", "REQ" -> "FR";
            case "F" -> !risks && says.contains("requirement") ? "FR" : null;
            case "AC", "ACC" -> "AC";
            case "NFR", "NF" -> "NFR";
            case "BR", "RULE" -> "BR";
            case "R" -> !risks && says.contains("rule") ? "BR" : null;
            case "OQ", "Q", "QU" -> "OQ";
            default -> null;
        };
    }

    /** A traceability matrix: a table that links IDs to other IDs (its header names acceptance criteria or tests). */
    private static boolean isTraceability(List<String> header) {
        String h = String.join(" ", header).toLowerCase(Locale.ROOT);
        return h.contains("acceptance") && (h.contains("test") || h.contains("design"));
    }

    private static String cell(List<String> header, List<String> row, String... names) {
        for (String name : names) {
            for (int c = 1; c < header.size() && c < row.size(); c++) {
                if (header.get(c).toLowerCase(Locale.ROOT).contains(name) && !row.get(c).isBlank()) {
                    return row.get(c).strip();
                }
            }
        }
        return null;
    }

    /** The cell of the first matching column name; without one, the longest cell of the row (the statement itself). */
    private static String longest(List<String> header, List<String> row, String... names) {
        String named = null;
        for (String name : names) {
            for (int c = 1; c < header.size() && c < row.size(); c++) {
                if (header.get(c).toLowerCase(Locale.ROOT).contains(name) && !row.get(c).isBlank()
                        && (named == null || row.get(c).length() > named.length())) {
                    named = row.get(c).strip();
                }
            }
            if (named != null) {
                return named;
            }
        }
        String longest = null;
        for (int c = 1; c < row.size(); c++) {
            if (longest == null || row.get(c).length() > longest.length()) {
                longest = row.get(c).strip();
            }
        }
        return longest == null || longest.isBlank() ? null : longest;
    }

    /**
     * The lines under a heading whose title is one of the names, up to the next heading or table. A bold label on its
     * own line ("**Out of scope**") that names one of the document's lists counts as a heading.
     */
    static List<String> listUnder(List<String> lines, String... names) {
        List<String> items = new ArrayList<>();
        boolean inside = false;
        for (String line : lines) {
            Matcher b = LABEL.matcher(line.strip());
            if (b.matches()) {
                String label = b.group(1).toLowerCase(Locale.ROOT).strip();
                if (List.of(names).contains(label)) {
                    inside = true;
                    continue;
                }
                if (LISTS.contains(label)) {
                    if (inside && !items.isEmpty()) {
                        break;
                    }
                    inside = false;
                    continue;
                }
            }
            Matcher h = HEADING.matcher(line);
            if (h.matches()) {
                if (inside && !items.isEmpty()) {
                    break;
                }
                // A heading with nothing under it ("4. Scope" before "4.1 In scope") does not end the search
                inside = false;
                String title = h.group(1).toLowerCase(Locale.ROOT).strip();
                for (String name : names) {
                    if (title.equals(name)) {
                        inside = true;
                        break;
                    }
                }
                continue;
            }
            if (inside) {
                if (isRow(line)) {
                    break;
                }
                String item = line.strip().replaceAll("^([-*•]|\\d+[.)])\\s+", "");
                if (!item.isEmpty()) {
                    items.add(item);
                }
            }
        }
        return items;
    }

    private static boolean isRow(String line) {
        String s = line.strip();
        return s.startsWith("|") && s.endsWith("|") && s.length() > 2;
    }

    private static boolean isSeparator(String line) {
        return line.strip().matches("\\|?\\s*:?-{3,}:?\\s*(\\|\\s*:?-{3,}:?\\s*)*\\|?");
    }

    private static List<String> cells(String line) {
        String s = line.strip();
        s = s.substring(1, s.length() - 1);
        List<String> cells = new ArrayList<>();
        for (String c : s.split("\\|", -1)) {
            cells.add(c.strip());
        }
        return cells;
    }

    /** BR-001, BR-1 and br1 are the same ID. */
    private static String key(String id) {
        return id == null ? "" : id.toUpperCase(Locale.ROOT).replaceAll("[^A-Z0-9]", "").replaceAll("(?<=[A-Z])0+(?=\\d)", "");
    }

    /** The same question in other words: most of the words of the shorter one are in the other. */
    static boolean similar(String a, String b) {
        Set<String> x = words(a);
        Set<String> y = words(b);
        if (x.isEmpty() || y.isEmpty()) {
            return false;
        }
        Set<String> small = x.size() <= y.size() ? x : y;
        Set<String> large = small == x ? y : x;
        long shared = small.stream().filter(large::contains).count();
        return shared * 10 >= small.size() * 7L;
    }

    private static Set<String> words(String s) {
        Set<String> words = new LinkedHashSet<>();
        for (String w : (s == null ? "" : s).toLowerCase(Locale.ROOT).split("[^a-z0-9]+")) {
            if (w.length() > 3) {
                words.add(w.length() > 6 ? w.substring(0, 6) : w);
            }
        }
        return words;
    }
}
