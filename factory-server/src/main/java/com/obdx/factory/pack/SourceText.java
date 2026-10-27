package com.obdx.factory.pack;

import java.util.Locale;

/**
 * Replaces comments with spaces (keeping line breaks, so line numbers stay right) before rules are matched, so
 * commented-out code is not reported. Strings are kept, because some rules look for them.
 */
final class SourceText {

    private SourceText() {
    }

    static String withoutComments(String path, String content) {
        String lower = path.toLowerCase(Locale.ROOT);
        if (lower.endsWith(".java") || lower.endsWith(".js") || lower.endsWith(".ts")) {
            return blank(content, "//", true);
        }
        if (lower.endsWith(".sql")) {
            return blank(content, "--", false);
        }
        if (lower.endsWith(".html") || lower.endsWith(".xml")) {
            return blankBetween(content, "<!--", "-->");
        }
        return content;
    }

    /** Blanks line comments (starting with lineComment) and block comments, outside strings. */
    private static String blank(String content, String lineComment, boolean templateStrings) {
        StringBuilder out = new StringBuilder(content);
        int i = 0;
        while (i < content.length()) {
            char c = content.charAt(i);
            if (content.startsWith(lineComment, i)) {
                int end = content.indexOf('\n', i);
                end = end < 0 ? content.length() : end;
                fill(out, i, end);
                i = end;
            } else if (content.startsWith("/*", i)) {
                int end = content.indexOf("*/", i + 2);
                end = end < 0 ? content.length() : end + 2;
                fill(out, i, end);
                i = end;
            } else if (c == '\'' || c == '"' || (templateStrings && c == '`')) {
                int j = i + 1;
                while (j < content.length() && content.charAt(j) != c && (c == '`' || content.charAt(j) != '\n')) {
                    j += content.charAt(j) == '\\' && !lineComment.equals("--") ? 2 : 1;
                }
                i = j + 1;
            } else {
                i++;
            }
        }
        return out.toString();
    }

    private static String blankBetween(String content, String open, String close) {
        StringBuilder out = new StringBuilder(content);
        int start = content.indexOf(open);
        while (start >= 0) {
            int end = content.indexOf(close, start + open.length());
            end = end < 0 ? content.length() : end + close.length();
            fill(out, start, end);
            start = content.indexOf(open, end);
        }
        return out.toString();
    }

    private static void fill(StringBuilder out, int from, int to) {
        for (int k = from; k < to && k < out.length(); k++) {
            if (out.charAt(k) != '\n' && out.charAt(k) != '\r') {
                out.setCharAt(k, ' ');
            }
        }
    }
}
