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
final class ModelReasoning {

    static final String RULE = "no-model-reasoning";

    private static final Pattern PHRASE = Pattern.compile("(?i)\\b(let'?s assume|let us assume|the prompt (?:says|asks|wants|requires)|"
            + "as an ai\\b|as an ai language model|as per the (?:prompt|instructions)|in this response|the user (?:wants|asked)|"
            + "as you requested|here is the (?:complete|updated|corrected) (?:file|code))");
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
        search(content, parts.comments(), PHRASE, lines, before, found);
        if (syntax == SourceScan.Syntax.CODE) {
            search(content, parts.strings(), IN_STRINGS, lines, before, found);
        }
        return found.size() > 3 ? found.subList(0, 3) : found;
    }

    private static void search(String content, List<SourceScan.Range> ranges, Pattern phrase, String[] lines, Set<String> before,
                               List<LocalChecks.Finding> found) {
        for (SourceScan.Range range : ranges) {
            Matcher p = phrase.matcher(content).region(range.start(), range.end());
            if (p.find()) {
                int line = lineOf(content, p.start());
                if (line <= lines.length && before.contains(lines[line - 1].strip())) {
                    continue;
                }
                if (found.stream().noneMatch(f -> f.line() == line)) {
                    found.add(new LocalChecks.Finding(RULE, PackRule.Severity.ERROR, line, "The model's own reasoning (\"" + p.group(1)
                            + "\") is left in the file. Write code and comments only, as a developer would."));
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
