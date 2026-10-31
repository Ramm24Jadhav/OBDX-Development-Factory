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
 * label such as "We need to verify your identity" is not.
 */
final class ModelReasoning {

    static final String RULE = "no-model-reasoning";

    private static final Pattern PHRASE = Pattern.compile("(?i)\\b(let'?s assume|let us assume|the prompt (?:says|asks|wants|requires)|"
            + "as an ai\\b|as an ai language model|as per the (?:prompt|instructions)|in this response|the user (?:wants|asked)|"
            + "as you requested|here is the (?:complete|updated|corrected) (?:file|code))");
    private static final Pattern IN_STRINGS = Pattern.compile("(?i)\\b(the prompt (?:says|asks|wants)|as an ai\\b|let'?s assume|as per the prompt)");
    private static final Pattern CODE_STRING = Pattern.compile("\"(?:[^\"\\\\\\n]|\\\\.)*\"|'(?:[^'\\\\\\n]|\\\\.)*'|`(?:[^`\\\\]|\\\\.)*`");
    private static final Pattern SQL_STRING = Pattern.compile("'(?:[^']|'')*'");
    /** // after a colon is a URL (http://), not a comment */
    private static final Pattern CODE_COMMENT = Pattern.compile("(?s)(?<!:)//[^\\n]*|/\\*.*?\\*/");
    private static final Pattern MARKUP_COMMENT = Pattern.compile("(?s)<!--.*?-->");
    private static final Pattern SQL_COMMENT = Pattern.compile("(?s)--[^\\n]*|/\\*.*?\\*/");
    private static final Pattern PROPERTIES_COMMENT = Pattern.compile("(?m)^\\s*[#!][^\\n]*");

    private ModelReasoning() {
    }

    static List<LocalChecks.Finding> findings(String path, String original, String content) {
        if (content == null) {
            return List.of();
        }
        String lower = path.toLowerCase(Locale.ROOT);
        Set<String> before = new HashSet<>();
        if (original != null) {
            original.lines().forEach(l -> before.add(l.strip()));
        }
        String[] lines = content.split("\n", -1);
        List<LocalChecks.Finding> found = new ArrayList<>();
        if (lower.matches(".*\\.(java|js|ts|tsx|jsx)")) {
            // Comments found outside strings: "http://x" or "a // b" in a string is no comment
            search(content, codeComments(content), CODE_COMMENT, PHRASE, lines, before, found);
            search(content, blank(content, CODE_COMMENT), CODE_STRING, IN_STRINGS, lines, before, found);
        } else if (lower.endsWith(".html") || lower.endsWith(".xml")) {
            search(content, content, MARKUP_COMMENT, PHRASE, lines, before, found);
        } else if (lower.endsWith(".sql")) {
            search(content, blank(content, SQL_STRING), SQL_COMMENT, PHRASE, lines, before, found);
        } else if (lower.endsWith(".properties")) {
            search(content, content, PROPERTIES_COMMENT, PHRASE, lines, before, found);
        }
        return found.size() > 3 ? found.subList(0, 3) : found;
    }

    /**
     * The code with everything but its comments blanked (keeping the length, so lines stay right): strings are skipped
     * as a compiler would, so a quote inside a comment ("Let's") does not hide it.
     */
    static String codeComments(String content) {
        StringBuilder out = new StringBuilder(" ".repeat(content.length()));
        int i = 0;
        while (i < content.length()) {
            char c = content.charAt(i);
            if (c == '/' && i + 1 < content.length() && content.charAt(i + 1) == '/' && (i == 0 || content.charAt(i - 1) != ':')) {
                int end = content.indexOf('\n', i);
                end = end < 0 ? content.length() : end;
                out.replace(i, end, content.substring(i, end));
                i = end;
            } else if (c == '/' && i + 1 < content.length() && content.charAt(i + 1) == '*') {
                int end = content.indexOf("*/", i + 2);
                end = end < 0 ? content.length() : end + 2;
                out.replace(i, end, content.substring(i, end));
                i = end;
            } else if (c == '"' || c == '\'' || c == '`') {
                int j = i + 1;
                while (j < content.length() && content.charAt(j) != c && (c == '`' || content.charAt(j) != '\n')) {
                    j += content.charAt(j) == '\\' ? 2 : 1;
                }
                i = j + 1;
            } else {
                i++;
            }
        }
        for (int k = 0; k < content.length(); k++) {
            if (content.charAt(k) == '\n') {
                out.setCharAt(k, '\n');
            }
        }
        return out.toString();
    }

    /** The text with every match replaced by spaces of the same length. */
    private static String blank(String text, Pattern pattern) {
        StringBuilder out = new StringBuilder(text);
        Matcher m = pattern.matcher(text);
        while (m.find()) {
            for (int i = m.start(); i < m.end(); i++) {
                if (out.charAt(i) != '\n') {
                    out.setCharAt(i, ' ');
                }
            }
        }
        return out.toString();
    }

    /** Finds the parts in searched (same length as content), and the phrase in the content's text of each part. */
    private static void search(String content, String searched, Pattern part, Pattern phrase, String[] lines, Set<String> before,
                               List<LocalChecks.Finding> found) {
        Matcher m = part.matcher(searched);
        while (m.find()) {
            Matcher p = phrase.matcher(content.substring(m.start(), m.end()));
            if (p.find()) {
                int line = lineOf(content, m.start() + p.start());
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
