package com.obdx.factory.requirements;

import java.util.ArrayList;
import java.util.HashSet;
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
                     List<RequirementSpec.OpenQuestion> questions, List<RequirementSpec.Message> messages) {

        boolean isEmpty() {
            return scope.isEmpty() && outOfScope.isEmpty() && assumptions.isEmpty() && requirements.isEmpty() && criteria.isEmpty()
                    && nonFunctional.isEmpty() && rules.isEmpty() && questions.isEmpty() && messages.isEmpty();
        }
    }

    /** DIGX_BV_001, ERR-004, E1023, PAY.LIMIT.01: a message code (capitals, digits and separators, with a digit). */
    private static final Pattern CODE = Pattern.compile("^(?=[A-Z0-9_.-]*\\d)[A-Z][A-Z0-9]*(?:[_.-][A-Z0-9]+)*$");

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
        List<RequirementSpec.Message> messages = new ArrayList<>();
        Set<String> messageCodes = new java.util.HashSet<>();
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
            if (kind == null && isMessageTable(header, heading, rows)) {
                // Code | HTTP | Message: the codes and wording the code must return, exactly as the document has them
                String says = (String.join(" ", header) + " " + heading).toLowerCase(Locale.ROOT);
                for (List<String> row : rows) {
                    String code = row.getFirst().strip();
                    String wording = longest(header, row, "message", "text", "description", "meaning");
                    if (messages.size() < MAX_MESSAGES && messageCode(code) && wording != null && messageCodes.add(code)) {
                        String type = cell(header, row, "type", "severity", "level");
                        messages.add(new RequirementSpec.Message(code, wording, type != null ? type.toLowerCase(Locale.ROOT)
                                : says.contains("error") ? "error" : null));
                    }
                }
                continue;
            }
            if (kind == null) {
                continue;
            }
            boolean traceability = isTraceability(header) || onlyIdLists(rows);
            for (List<String> row : rows) {
                String id = row.getFirst().strip();
                if (!ID.matcher(id).matches()) {
                    continue;
                }
                String prefix = ID.matcher(id).replaceAll("$1");
                if (prefix.equals("FR") || prefix.equals("REQ")) {
                    // FR-001 | ... | AC-001, AC-002 | ...: the criteria that verify the requirement, in a traceability matrix or
                    // in a column of ID lists in the requirements table itself
                    for (String cell : row.subList(1, row.size())) {
                        if (traceability || isIdList(cell)) {
                            Matcher m = ANY_ID.matcher(cell);
                            while (m.find()) {
                                if (!m.group(1).startsWith(prefix)) {
                                    criteriaOf.computeIfAbsent(m.group(1), k -> new LinkedHashSet<>()).add(id);
                                }
                            }
                        }
                    }
                }
                if (traceability) {
                    continue;
                }
                switch (kind) {
                    case "FR" -> addOnce(requirements, new RequirementSpec.FunctionalRequirement(id, cell(header, row, "requirement", "name", "title", "feature"),
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
                questions.stream().filter(q -> q.question() != null).toList(), List.copyOf(messages));
    }

    /**
     * A table of message or error codes: its first column is headed code (Code, Error code) and another column holds the
     * message, and most of its rows start with a code (DIGX_BV_001).
     */
    private static boolean isMessageTable(List<String> header, String heading, List<List<String>> rows) {
        if (header.size() < 2 || rows.isEmpty() || !header.getFirst().toLowerCase(Locale.ROOT).contains("code")) {
            return false;
        }
        String says = (String.join(" ", header) + " " + heading).toLowerCase(Locale.ROOT);
        if (String.join(" ", header).toLowerCase(Locale.ROOT).contains("rule")) {
            // Rule code | Rule description: rules, not messages (a heading such as "Validation rules" alone decides nothing)
            return false;
        }
        boolean messageColumn = header.subList(1, header.size()).stream().map(h -> h.toLowerCase(Locale.ROOT))
                .anyMatch(h -> h.contains("message") || h.contains("text"));
        boolean messageHeading = says.contains("error") || says.contains("message") || CODE_HEADING.matcher(says).find();
        boolean describedCodes = messageHeading && header.subList(1, header.size()).stream().map(h -> h.toLowerCase(Locale.ROOT))
                .anyMatch(h -> h.contains("description") || h.contains("meaning"));
        long codes = rows.stream().filter(r -> messageCode(r.getFirst().strip())).count();
        return (messageColumn || describedCodes) && codes * 2 >= rows.size();
    }

    /** "Response codes", "Status code", "Return codes", "Reason codes": a heading of codes the code returns. */
    private static final Pattern CODE_HEADING = Pattern.compile("\\b(response|status|return|reason) codes?\\b");

    /** The most messages read from one document's tables. */
    static final int MAX_MESSAGES = 2_000;
    /** The most of the document's open questions kept, and of the model's compared with them (each with each). */
    static final int MAX_DOCUMENT_QUESTIONS = 200;

    /**
     * What a requirement's status says when the document has more open questions than are kept (see apply): " N of the
     * document's open questions were left out ...", or "" when none was.
     */
    static String questionsLeftOut(Structure doc) {
        Set<String> distinct = new HashSet<>();
        for (RequirementSpec.OpenQuestion q : doc.questions()) {
            distinct.add(SpecMerger.normalize(q.question()));
        }
        int left = distinct.size() - MAX_DOCUMENT_QUESTIONS;
        return left <= 0 ? "" : " " + left + " of the document's open questions were left out (the spec takes at most "
                + MAX_DOCUMENT_QUESTIONS + "): ask them separately.";
    }
    /**
     * ID prefixes the document's ID tables are read by, whatever their header says, which are never message codes; F1001,
     * R-01 or Q12 can be (those prefixes count as IDs only where a header or heading says so).
     */
    private static final Set<String> ID_PREFIXES = Set.of("FR", "REQ", "AC", "ACC", "NFR", "NF", "BR", "RULE", "OQ");

    /** DIGX_BV_001 or ERR-004, but not FR-001 or BR-003. */
    private static boolean messageCode(String code) {
        if (code.length() > 60 || !CODE.matcher(code).matches()) {
            return false;
        }
        Matcher id = ID.matcher(code);
        return !(id.matches() && ID_PREFIXES.contains(id.group(1)));
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
        // The document's questions first (the analysts asked them), with the options and usual answer the model gave for
        // the same question, then the model's other questions
        // Each question's words are read once; the document's are kept apart from each other (only one asked twice word
        // for word is one), and at most MAX_DOCUMENT_QUESTIONS of them; the model's are compared with at most as many
        List<RequirementSpec.OpenQuestion> documented = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        for (RequirementSpec.OpenQuestion d : doc.questions()) {
            if (documented.size() < MAX_DOCUMENT_QUESTIONS && seen.add(SpecMerger.normalize(d.question()))) {
                documented.add(d);
            }
        }
        List<Prepared> documentWords = documented.stream().map(d -> prepare(d.question())).toList();
        List<RequirementSpec.OpenQuestion> drafts = spec.openQuestions().size() > MAX_DOCUMENT_QUESTIONS
                ? spec.openQuestions().subList(0, MAX_DOCUMENT_QUESTIONS) : spec.openQuestions();
        List<Prepared> draftWords = drafts.stream().map(q -> prepare(q.question())).toList();
        List<Prepared> decisionWords = spec.decisions().stream().limit(MAX_DOCUMENT_QUESTIONS).map(x -> prepare(x.question())).toList();
        // Each drafted question restates at most one of the document's: the one it matches best (its ID, then its words,
        // then the same question), the first of equals
        int[] restated = new int[drafts.size()];
        for (int j = 0; j < drafts.size(); j++) {
            int best = 0;
            restated[j] = -1;
            for (int i = 0; i < documented.size() && best < 3; i++) {
                int how = SpecMerger.restatement(documented.get(i), documentWords.get(i), drafts.get(j), draftWords.get(j));
                if (how > best) {
                    best = how;
                    restated[j] = i;
                }
            }
        }
        List<RequirementSpec.OpenQuestion> questions = new ArrayList<>();
        for (int i = 0; i < documented.size(); i++) {
            RequirementSpec.OpenQuestion d = documented.get(i);
            Prepared dw = documentWords.get(i);
            if (decisionWords.stream().anyMatch(x -> sameQuestion(x, dw))) {
                continue;
            }
            RequirementSpec.OpenQuestion drafted = null;
            for (int j = 0; j < drafts.size() && drafted == null; j++) {
                if (restated[j] == i) {
                    drafted = drafts.get(j);
                }
            }
            RequirementSpec.OpenQuestion asked = drafted == null ? d : SpecMerger.joined(d, drafted);
            // the document's reason and usual answer stay when it has options of its own
            questions.add(drafted == null || !d.options().isEmpty() ? new RequirementSpec.OpenQuestion(d.question(), d.reason(), d.reference(),
                    d.options(), d.suggestedAnswer(), asked.answer()) : asked);
        }
        for (int j = 0; j < drafts.size(); j++) {
            if (restated[j] < 0) {
                questions.add(drafts.get(j));
            }
        }
        if (spec.openQuestions().size() > drafts.size()) {
            questions.addAll(spec.openQuestions().subList(drafts.size(), spec.openQuestions().size()));
        }
        // The document's codes with its wording (the type the model gave when the document has none), then the model's others
        List<RequirementSpec.Message> messages = merge(doc.messages(), spec.messages(), RequirementSpec.Message::code,
                RequirementSpec.Message::text, (m, d) -> m.type() == null && d != null ? new RequirementSpec.Message(m.code(), m.text(), d.type()) : m);
        return new RequirementSpec(spec.title(), spec.summary(), spec.screens(), rules, spec.roles(), spec.apis(), spec.hostInteractions(),
                messages, questions, spec.decisions(),
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

    /** "AC-001, AC-002", "TC-01; TC-02", "AC-003": a cell of IDs only. */
    static boolean isIdList(String cell) {
        if (cell == null || cell.isBlank()) {
            return false;
        }
        // Token by token: a repeated group in one regular expression overflows the stack on a cell of a thousand IDs
        int ids = 0;
        for (String token : cell.strip().split("[\\s,;/]+")) {
            if (token.isEmpty() || token.equals("and")) {
                continue;
            }
            if (!ONE_ID.matcher(token).matches()) {
                return false;
            }
            ids++;
        }
        return ids > 0;
    }

    private static final Pattern ONE_ID = Pattern.compile("[A-Z]{1,5}-\\d{1,4}");

    /**
     * A table whose rows map an ID to lists of other IDs only (Requirement ID | Acceptance criteria): a traceability
     * matrix, whatever its header says. Its rows are links, not requirements of their own.
     */
    private static boolean onlyIdLists(List<List<String>> rows) {
        int linking = 0;
        for (List<String> row : rows) {
            List<String> rest = row.subList(1, row.size()).stream().filter(c -> !c.isBlank()).toList();
            if (rest.isEmpty()) {
                continue;
            }
            if (!rest.stream().allMatch(DocumentStructure::isIdList)) {
                return false;
            }
            linking++;
        }
        return linking > 0;
    }

    /** Adds a requirement unless one with its ID is there already; then fills what the first one lacks. */
    private static void addOnce(List<RequirementSpec.FunctionalRequirement> requirements, RequirementSpec.FunctionalRequirement r) {
        for (int k = 0; k < requirements.size(); k++) {
            RequirementSpec.FunctionalRequirement known = requirements.get(k);
            if (key(known.id()).equals(key(r.id()))) {
                requirements.set(k, new RequirementSpec.FunctionalRequirement(known.id(), known.title() != null ? known.title() : r.title(),
                        known.description() != null ? known.description() : r.description(),
                        known.priority() != null ? known.priority() : r.priority(), known.screens()));
                return;
            }
        }
        requirements.add(r);
    }

    /** A traceability matrix: a table that links IDs to other IDs (its header names acceptance criteria or tests). */
    private static boolean isTraceability(List<String> header) {
        String h = String.join(" ", header).toLowerCase(Locale.ROOT);
        return h.contains("acceptance") && (h.contains("test") || h.contains("design"));
    }

    private static String cell(List<String> header, List<String> row, String... names) {
        for (String name : names) {
            for (int c = 1; c < header.size() && c < row.size(); c++) {
                if (header.get(c).toLowerCase(Locale.ROOT).contains(name) && !row.get(c).isBlank() && !isIdList(row.get(c))) {
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
                if (header.get(c).toLowerCase(Locale.ROOT).contains(name) && !row.get(c).isBlank() && !isIdList(row.get(c))
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
            if (!isIdList(row.get(c)) && (longest == null || row.get(c).length() > longest.length())) {
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

    /**
     * Words that say nothing about what a question asks: how it asks (should, which, is), articles, pronouns,
     * prepositions and the like (cut to six letters, as the words are).
     */
    private static final Set<String> QUESTION_WORDS = Set.of("should", "would", "could", "which", "where", "what", "when", "will",
            "does", "there", "shown", "displa", "this", "that", "with", "from", "have", "need", "needs", "needed", "screen", "custom", "user",
            "users", "is", "are", "was", "were", "be", "been", "being", "do", "did", "done", "can", "may", "must", "shall", "how", "who",
            "whom", "whose", "why", "the", "a", "an", "of", "to", "in", "on", "at", "by", "for", "or", "and", "as", "it", "its", "if", "any",
            "into", "than", "then", "these", "those", "they", "their", "them", "we", "our", "you", "your", "so", "such", "also",
            "used", "use", "using", "requir", "allowe", "allow", "suppor", "applie", "apply", "per", "each", "every", "all", "some", "yes",
            "no", "not");
    /** Words that ask about the same thing: where something is placed (above or below, not before or after: that is when). */
    private static final Set<String> PLACEMENT = Set.of("positi", "placed", "placem", "place", "locati", "locate", "above", "below",
            "top", "bottom");
    /** Words that ask about the same thing: how long something is kept. */
    private static final Set<String> RETENTION = Set.of("long", "kept", "keep", "retain", "retent", "period", "durati", "purge", "purged");

    /**
     * The same question in other words: every word that carries the meaning of one is in the other (the shorter one's
     * words in the longer one), at least three of them or two that are half of the longer one's. Placement words count
     * as one ("above or below the account summary" and "Where should the widget be positioned"), and so do retention
     * words ("How long should audit rows be kept?" and "What is the required retention period for audit rows?"). Two
     * questions that each have a word the other lacks ask about different things ("the amount field" and "the remarks
     * field", "by SMS" and "by email", "retail users" and "corporate users"): never the same. Short words count too
     * (SMS, OTP).
     */
    static boolean sameQuestion(String a, String b) {
        return sameQuestion(prepare(a), prepare(b));
    }

    /** A question's words that carry its meaning, read once for comparing it with many others (see sameQuestion). */
    record Prepared(Set<String> meaning) {
    }

    /** The most of a question's text read for its words. */
    static final int MAX_QUESTION_TEXT = 500;

    static Prepared prepare(String question) {
        String text = question == null ? "" : question.length() > MAX_QUESTION_TEXT ? question.substring(0, MAX_QUESTION_TEXT) : question;
        return new Prepared(meaning(text));
    }

    /** {@link #sameQuestion(String, String)} of two questions whose words were read before. */
    static boolean sameQuestion(Prepared a, Prepared b) {
        Set<String> x = a.meaning();
        Set<String> y = b.meaning();
        if (x.isEmpty() || y.isEmpty()) {
            return false;
        }
        Set<String> small = x.size() <= y.size() ? x : y;
        Set<String> large = small == x ? y : x;
        // a word only the shorter one has: each asks about something the other does not
        if (!large.containsAll(small)) {
            return false;
        }
        int shared = small.size();
        return shared >= 3 || (shared >= 2 && shared * 2 >= large.size());
    }

    /** The words of a question that carry its meaning: two letters or more, cut to six, without a plural s. */
    private static Set<String> meaning(String s) {
        Set<String> words = new LinkedHashSet<>();
        for (String raw : (s == null ? "" : s).toLowerCase(Locale.ROOT).split("[^a-z0-9]+")) {
            if (raw.length() < 2) {
                continue;
            }
            String w = raw.length() > 3 && raw.endsWith("s") && !raw.endsWith("ss") ? raw.substring(0, raw.length() - 1) : raw;
            w = w.length() > 6 ? w.substring(0, 6) : w;
            String whole = raw.length() > 6 ? raw.substring(0, 6) : raw;
            if (PLACEMENT.contains(w) || PLACEMENT.contains(whole)) {
                words.add("place");
            } else if (RETENTION.contains(w) || RETENTION.contains(whole)) {
                words.add("retain");
            } else if (!QUESTION_WORDS.contains(w) && !QUESTION_WORDS.contains(whole)) {
                words.add(w);
            }
        }
        return words;
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
