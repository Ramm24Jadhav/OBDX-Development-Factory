package com.obdx.factory.pack;

import java.util.ArrayList;
import java.util.List;

/**
 * Finds the comments and string literals of source code in one pass over its characters. Regular expressions with
 * alternation in a loop ("(?:[^\"]|\\\\.)*") recurse once per character in Java and overflow the stack on a long
 * string, and lazy comment patterns ("/\\*.*?\\*\/") on an unclosed comment take quadratic time; a scanner takes neither.
 */
public final class SourceScan {

    /** How a language writes comments and strings. */
    public enum Syntax {
        /** Java, JavaScript, TypeScript: // and block comments; '...', "..." and `...` strings with \ escapes */
        CODE,
        /** SQL: -- and block comments; '...' strings with '' for a quote */
        SQL,
        /** HTML, XML: <!-- --> comments only */
        MARKUP,
        /** .properties: lines starting with # or ! */
        PROPERTIES
    }

    /** A part of the text: [start, end). */
    public record Range(int start, int end) {
    }

    /** The comments and strings of a text, in order. */
    public record Parts(List<Range> comments, List<Range> strings) {
    }

    private SourceScan() {
    }

    public static Parts scan(String content, Syntax syntax) {
        List<Range> comments = new ArrayList<>();
        List<Range> strings = new ArrayList<>();
        int n = content.length();
        int i = 0;
        while (i < n) {
            char c = content.charAt(i);
            if (syntax == Syntax.MARKUP) {
                if (content.startsWith("<!--", i)) {
                    int end = content.indexOf("-->", i + 4);
                    end = end < 0 ? n : end + 3;
                    comments.add(new Range(i, end));
                    i = end;
                } else {
                    i++;
                }
            } else if (syntax == Syntax.PROPERTIES) {
                int end = content.indexOf('\n', i);
                end = end < 0 ? n : end;
                String line = content.substring(i, end).stripLeading();
                if (line.startsWith("#") || line.startsWith("!")) {
                    comments.add(new Range(i, end));
                }
                i = end + 1;
            } else if (syntax == Syntax.CODE && c == '/' && i + 1 < n && content.charAt(i + 1) == '/'
                    && (i == 0 || content.charAt(i - 1) != ':')
                    || syntax == Syntax.SQL && c == '-' && i + 1 < n && content.charAt(i + 1) == '-') {
                int end = content.indexOf('\n', i);
                end = end < 0 ? n : end;
                comments.add(new Range(i, end));
                i = end;
            } else if (c == '/' && i + 1 < n && content.charAt(i + 1) == '*') {
                int end = content.indexOf("*/", i + 2);
                end = end < 0 ? n : end + 2;
                comments.add(new Range(i, end));
                i = end;
            } else if (syntax == Syntax.SQL && c == '\'') {
                int j = i + 1;
                while (j < n) {
                    if (content.charAt(j) == '\'') {
                        if (j + 1 < n && content.charAt(j + 1) == '\'') {
                            j += 2;
                            continue;
                        }
                        break;
                    }
                    j++;
                }
                int end = Math.min(n, j + 1);
                strings.add(new Range(i, end));
                i = end;
            } else if (syntax == Syntax.CODE && content.startsWith("\"\"\"", i)) {
                // A Java text block: a string over several lines, whose // and /* are text (unterminated: to the end)
                int end = content.indexOf("\"\"\"", i + 3);
                end = end < 0 ? n : end + 3;
                strings.add(new Range(i, end));
                i = end;
            } else if (syntax == Syntax.CODE && (c == '\'' || c == '"' || c == '`')) {
                int j = i + 1;
                while (j < n && content.charAt(j) != c && (c == '`' || content.charAt(j) != '\n')) {
                    j += content.charAt(j) == '\\' ? 2 : 1;
                }
                // A quote not closed on its line (an apostrophe) is no string
                if (j < n && content.charAt(j) == c) {
                    strings.add(new Range(i, j + 1));
                    i = j + 1;
                } else {
                    i++;
                }
            } else {
                i++;
            }
        }
        return new Parts(comments, strings);
    }

    /** The text with the ranges replaced by spaces (line breaks kept, so lines and offsets stay right). */
    public static String blank(String content, List<Range> ranges) {
        StringBuilder out = new StringBuilder(content);
        for (Range r : ranges) {
            for (int k = r.start(); k < r.end() && k < out.length(); k++) {
                if (out.charAt(k) != '\n' && out.charAt(k) != '\r') {
                    out.setCharAt(k, ' ');
                }
            }
        }
        return out.toString();
    }
}
