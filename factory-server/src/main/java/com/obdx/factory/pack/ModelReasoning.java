package com.obdx.factory.pack;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Finds the model's own reasoning left in a generated file ("Let's assume the service returns...", "The prompt says
 * ...", "As an AI ..."): it is not code a bank would accept, and the file is written again. Only phrases a developer
 * would not write are taken, in comments (and a few in strings), so "we need to refresh the list" in a comment or a
 * label such as "We need to verify your identity" is not. Comments and strings are found with {@link SourceScan}, in
 * linear time whatever the file holds.
 */
public final class ModelReasoning {

    static final String RULE = "no-model-reasoning";

    static final String STUB_RULE = "no-stub-code";

    static final String SAMPLE_RULE = "no-sample-data";

    /** At most this many findings of one rule; each rule keeps its own, so many of one do not hide another. */
    static final int MAX_PER_RULE = 3;

    private static final Pattern PHRASE = Pattern.compile("(?i)\\b(let'?s assume|let us assume|the prompt (?:says|asks|wants|requires)|"
            + "as an ai\\b|as an ai language model|as per (?:the|your) (?:prompt|instructions)\\b|in this response|the user (?:wants|asked)|"
            + "as you requested|here is the (?:complete|updated|corrected) (?:file|code)|for this exercise|in this isolated artifact|"
            + "not defined in (?:the )?prompt|we model the behaviou?r|since we don'?t have|"
            // "No specific error code defined for Name Format in the provided list": what the model was given
            + "(?:not|no)\\b[^.\\n]{0,60}?\\b(?:defined|given|specified|listed|mentioned)\\b[^.\\n]{0,40}? in the (?:provided|given) "
            + "(?:list|spec|specification|prompt)\\b|"
            // as per instruction "never exception text": a quoted instruction, not "as per instruction frequency"
            + "as per (?:the )?instructions?\\s*[:,]?\\s*[\"'\\u201C\\u2018]|"
            // "For now, we assume ..." and "Assuming the validation response has a way ...": the model guessing aloud
            + "for now,? we assume|assum(?:e|ing) the \\w+ (?:response|request|service|validator) (?:has|returns|marks|will)\\b)"
            // "Assuming the host returns ...": an assumption opening a comment; and the model talking to itself mid-answer
            // ("// Wait, ...", "// Let's check ...", "// But wait, I already wrote that line"), only where a comment starts
            + "|^(?:/[/*]+|\\*|<!--|--|#)?\\s*(assum(?:e|ing) (?:the )?(?:host|standard|default)\\b|(?:but |hmm,? )?wait\\s*[,.!:]"
            + "|let'?s check\\b|i already wrote\\b)");
    /** Code that only pretends: placeholder logic, simulated calls, mock data in the bank's code (not in tests) */
    private static final Pattern STUB = Pattern.compile("(?i)\\b(placeholder logic|simulated (?:host |api |backend )?(?:response|call|delay|data)\\b|"
            + "simulate (?:the )?(?:host|api|call|backend|response)\\b|in a real implementation|todo:?\\s*call|mock (?:response|data))");
    /** Sample people in a string: "JOHN SMITH", "Jane Doe" */
    private static final Pattern SAMPLE_DATA = Pattern.compile("(?i)\\b((?:john|jane) (?:smith|doe)|lorem ipsum)\\b");
    /** A placeholder or hint shows sample text on purpose: placeholder: 'John Smith', hint-text="..." */
    private static final Pattern HINT_BEFORE = Pattern.compile("(?i)(placeholder|hint|example|sample|helptext|help-text)[\\w-]*\\s*[:=]\\s*\\(?\\s*$");
    private static final Pattern IN_STRINGS = Pattern.compile("(?i)\\b(the prompt (?:says|asks|wants)|as an ai\\b|let'?s assume|as per the prompt)");

    private ModelReasoning() {
    }

    static List<LocalChecks.Finding> findings(String path, String original, String content) {
        if (content == null) {
            return List.of();
        }
        String lower = path.toLowerCase(Locale.ROOT);
        SourceScan.Syntax syntax = lower.matches(".*\\.(java|js|ts|tsx|jsx)") ? SourceScan.Syntax.CODE
                : lower.endsWith(".html") || lower.endsWith(".xml") ? SourceScan.Syntax.MARKUP
                : lower.endsWith(".sql") ? SourceScan.Syntax.SQL
                : lower.endsWith(".properties") ? SourceScan.Syntax.PROPERTIES : null;
        if (syntax == null) {
            return List.of();
        }
        Set<String> before = new HashSet<>();
        if (original != null) {
            original.lines().forEach(l -> before.add(l.strip()));
        }
        String[] lines = content.split("\n", -1);
        List<LocalChecks.Finding> found = new ArrayList<>();
        SourceScan.Parts parts = SourceScan.scan(content, syntax);
        // Comments outside strings ("http://x" or "a // b" in a string is no comment), and for code its strings
        search(content, parts.comments(), PHRASE, RULE, PackRule.Severity.ERROR, REASONING, lines, before, found);
        if (syntax == SourceScan.Syntax.CODE) {
            search(content, parts.strings(), IN_STRINGS, RULE, PackRule.Severity.ERROR, REASONING, lines, before, found);
        }
        // Stubs fail the bank's code; a test, a mock or a story may mock and simulate
        if (!testCode(path)) {
            search(content, parts.comments(), STUB, STUB_RULE, PackRule.Severity.ERROR, STUB_MESSAGE, lines, before, found);
            boolean bundle = lower.contains("/nls/") || lower.contains("/resources/") && lower.endsWith(".js");
            if (syntax == SourceScan.Syntax.CODE && !bundle) {
                // Sample names may be fine (a demo customer): a warning, and not in a placeholder or hint
                List<SourceScan.Range> notHints = parts.strings().stream()
                        .filter(r -> !HINT_BEFORE.matcher(content.substring(Math.max(0, content.lastIndexOf('\n', r.start()) + 1), r.start())).find())
                        .toList();
                search(content, notHints, SAMPLE_DATA, SAMPLE_RULE, PackRule.Severity.WARNING, SAMPLE_MESSAGE, lines, before, found);
            }
        }
        return found;
    }

    /**
     * The first line (from 1) of a piece of code whose comments carry the model's reasoning ("// Wait, ...", "// Let's
     * check ...", "// The prompt says ..."), or 0; only comments are read. For a continued file, whose pieces are checked
     * before they are joined.
     */
    public static int firstReasoningLine(String path, String piece) {
        if (piece == null || piece.isBlank()) {
            return 0;
        }
        String lower = path.toLowerCase(Locale.ROOT);
        SourceScan.Syntax syntax = lower.matches(".*\\.(java|js|ts|tsx|jsx)") ? SourceScan.Syntax.CODE
                : lower.endsWith(".html") || lower.endsWith(".xml") ? SourceScan.Syntax.MARKUP
                : lower.endsWith(".sql") ? SourceScan.Syntax.SQL
                : lower.endsWith(".properties") ? SourceScan.Syntax.PROPERTIES : SourceScan.Syntax.CODE;
        List<LocalChecks.Finding> found = new ArrayList<>();
        search(piece, SourceScan.scan(piece, syntax).comments(), PHRASE, RULE, PackRule.Severity.ERROR, REASONING, piece.split("\n", -1),
                Set.of(), found);
        return found.stream().mapToInt(LocalChecks.Finding::line).min().orElse(0);
    }

    /** A file with the comments that carry the model's reasoning taken out, and how many comments that was. */
    public record Cleaned(String content, int removed) {
    }

    /**
     * The file without its comments that carry the model's reasoning ("// The prompt asks ...", "// Wait, ..."): a comment
     * on a line of its own goes with its line, a comment after code is cut from the line. Comments on lines the file had
     * before the change (original) stay; strings are not touched.
     */
    public static Cleaned withoutReasoningComments(String path, String original, String content) {
        String lower = path.toLowerCase(Locale.ROOT);
        SourceScan.Syntax syntax = lower.matches(".*\\.(java|js|ts|tsx|jsx)") ? SourceScan.Syntax.CODE
                : lower.endsWith(".html") || lower.endsWith(".xml") ? SourceScan.Syntax.MARKUP
                : lower.endsWith(".sql") ? SourceScan.Syntax.SQL
                : lower.endsWith(".properties") ? SourceScan.Syntax.PROPERTIES : null;
        if (content == null || syntax == null) {
            return new Cleaned(content, 0);
        }
        Set<String> before = new HashSet<>();
        if (original != null) {
            original.lines().forEach(l -> before.add(l.strip()));
        }
        boolean[] removed = new boolean[content.length()];
        int count = 0;
        for (SourceScan.Range range : SourceScan.scan(content, syntax).comments()) {
            Matcher p = PHRASE.matcher(content).region(range.start(), range.end());
            p.useAnchoringBounds(true);
            if (!p.find()) {
                continue;
            }
            int lineStart = content.lastIndexOf('\n', range.start() - 1) + 1;
            int lineEnd = content.indexOf('\n', range.start());
            String line = content.substring(lineStart, lineEnd < 0 ? content.length() : lineEnd).strip();
            if (before.contains(line)) {
                continue;
            }
            java.util.Arrays.fill(removed, range.start(), range.end(), true);
            count++;
        }
        if (count == 0) {
            return new Cleaned(content, 0);
        }
        StringBuilder out = new StringBuilder();
        int start = 0;
        while (start <= content.length()) {
            int end = content.indexOf('\n', start);
            int stop = end < 0 ? content.length() : end;
            StringBuilder kept = new StringBuilder();
            boolean touched = false;
            for (int i = start; i < stop; i++) {
                if (removed[i]) {
                    touched = true;
                } else {
                    kept.append(content.charAt(i));
                }
            }
            // a line that was only the comment goes; a line with code keeps its code
            if (!(touched && kept.toString().isBlank())) {
                out.append(touched ? kept.toString().stripTrailing() : kept);
                if (end >= 0) {
                    out.append('\n');
                }
            }
            if (end < 0) {
                break;
            }
            start = end + 1;
        }
        return new Cleaned(out.toString(), count);
    }

    /** Tests, mocks and stories, where simulated data belongs. */
    static boolean testCode(String path) {
        String lower = path.toLowerCase(Locale.ROOT);
        return lower.matches(".*/(tests?|__tests__|__mocks__|mocks)/.*") || lower.startsWith("mocks/") || lower.startsWith("test/")
                || path.matches(".*(Test|Tests|IT)\\.java") || lower.matches(".*\\.(spec|test|stories)\\.(js|ts|jsx|tsx|mjs)");
    }

    private static final String REASONING = "The model's own reasoning (\"%s\") is left in the file. Write code and comments only, as a "
            + "developer would.";
    private static final String STUB_MESSAGE = "Stub code (\"%s\"): placeholder, simulated or sample data instead of the real call. Call "
            + "the service or host the way the codebase does.";

    private static final String SAMPLE_MESSAGE = "Sample data (\"%s\") in the code: take the value from the service, or say why it "
            + "is fixed.";

    private static void search(String content, List<SourceScan.Range> ranges, Pattern phrase, String rule, PackRule.Severity severity,
                               String message, String[] lines, Set<String> before, List<LocalChecks.Finding> found) {
        for (SourceScan.Range range : ranges) {
            if (found.stream().filter(f -> f.ruleId().equals(rule)).count() >= MAX_PER_RULE) {
                return;
            }
            Matcher p = phrase.matcher(content).region(range.start(), range.end());
            p.useAnchoringBounds(true);
            if (p.find()) {
                int line = lineOf(content, p.start());
                if (line <= lines.length && before.contains(lines[line - 1].strip())) {
                    continue;
                }
                String said = p.group(1) != null ? p.group(1) : p.groupCount() > 1 && p.group(2) != null ? p.group(2) : p.group();
                if (found.stream().noneMatch(f -> f.line() == line && f.ruleId().equals(rule))) {
                    found.add(new LocalChecks.Finding(rule, severity, line, message.formatted(said)));
                }
            }
        }
    }

    private static int lineOf(String text, int offset) {
        int line = 1;
        for (int i = 0; i < offset; i++) {
            if (text.charAt(i) == '\n') {
                line++;
            }
        }
        return line;
    }
}
