package com.obdx.factory.change;

import com.obdx.factory.pack.SourceScan;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * A light syntax check of JavaScript without a JavaScript engine on the server: brackets, strings, template literals,
 * regular expressions and comments must be closed and balanced (else the file fails), and in an AMD module
 * (define([...], function (a, b) {...})) the function cannot take more parameters than the modules listed. Names used
 * as X.something that the module neither receives, declares nor gets from the browser are warnings: often a module the
 * define list lacks.
 */
final class JavaScriptCheck {

    private static final Pattern DEFINE = Pattern.compile("\\bdefine\\s*\\(\\s*\\[([^\\]]*)]\\s*,\\s*(?:async\\s+)?function\\s*\\w*\\s*\\(([^)]*)\\)");
    private static final Pattern MODULE = Pattern.compile("['\"]([^'\"]+)['\"]");
    private static final Pattern MEMBER_USE = Pattern.compile("(?<![\\w$.])([A-Za-z_$][\\w$]*)\\s*\\.(?!\\.)");
    private static final Pattern DECLARED = Pattern.compile("\\b(?:var|let|const|function|class)\\s+([A-Za-z_$][\\w$]*)"
            + "|\\bcatch\\s*\\(\\s*([A-Za-z_$][\\w$]*)|([A-Za-z_$][\\w$]*)\\s*=>");
    private static final Pattern PARAMS = Pattern.compile("(?:\\bfunction\\s*[\\w$]*\\s*|(?<![\\w$])(?:async\\s*)?)\\(([^()]*)\\)\\s*(?:=>|\\{)");
    private static final Pattern DESTRUCTURED = Pattern.compile("\\b(?:var|let|const)\\s*[{\\[]([^}\\]]*)[}\\]]");
    private static final Set<String> GLOBALS = Set.of("window", "document", "console", "Math", "JSON", "Object", "Array", "Promise",
            "String", "Number", "Boolean", "Date", "RegExp", "Error", "TypeError", "navigator", "location", "history", "localStorage",
            "sessionStorage", "Intl", "Symbol", "Map", "Set", "WeakMap", "Reflect", "Proxy", "require", "define", "this", "super",
            "arguments", "globalThis", "self", "event", "performance", "crypto", "URL", "URLSearchParams", "FormData", "Blob",
            "File", "FileReader", "Headers", "Request", "Response", "AbortController", "customElements", "Node", "Element",
            "HTMLElement", "Event", "CustomEvent", "KeyboardEvent", "MouseEvent", "setTimeout", "oj", "exports", "module");

    private JavaScriptCheck() {
    }

    static FileChecks.Result check(String content) {
        String structure = structure(content);
        if (structure != null) {
            return new FileChecks.Result(FileChecks.Status.FAILED, "JavaScript does not parse: " + structure);
        }
        String code = codeOnly(content);
        // The module names are strings: matched where only the comments are taken out
        Matcher define = DEFINE.matcher(withoutComments(content));
        if (!define.find()) {
            return new FileChecks.Result(FileChecks.Status.PASSED, null);
        }
        List<String> modules = new ArrayList<>();
        Matcher m = MODULE.matcher(define.group(1));
        while (m.find()) {
            modules.add(m.group(1));
        }
        List<String> params = names(define.group(2));
        if (params.size() > modules.size()) {
            return new FileChecks.Result(FileChecks.Status.FAILED, "define lists " + modules.size() + " module(s) but its function takes "
                    + params.size() + " parameter(s) (" + String.join(", ", params) + "): the last ones are undefined. List a module for "
                    + "each parameter, in the same order.");
        }
        Set<String> known = new LinkedHashSet<>(params);
        known.addAll(GLOBALS);
        Matcher d = DECLARED.matcher(code);
        while (d.find()) {
            for (int g = 1; g <= d.groupCount(); g++) {
                if (d.group(g) != null) {
                    known.add(d.group(g));
                }
            }
        }
        Matcher p = PARAMS.matcher(code);
        while (p.find()) {
            known.addAll(names(p.group(1)));
        }
        Matcher s = DESTRUCTURED.matcher(code);
        while (s.find()) {
            known.addAll(names(s.group(1)));
        }
        Set<String> unknown = new LinkedHashSet<>();
        Matcher use = MEMBER_USE.matcher(code);
        while (use.find()) {
            String name = use.group(1);
            if (!known.contains(name) && !name.matches("\\d.*")) {
                unknown.add(name);
            }
        }
        if (!unknown.isEmpty()) {
            return new FileChecks.Result(FileChecks.Status.WARNING, "Uses names the module does not define or receive: "
                    + String.join(", ", unknown) + ". Add the module to the define list and the function's parameters, or declare them.");
        }
        return new FileChecks.Result(FileChecks.Status.PASSED, null);
    }

    /** "a, b = 1, ...rest, {x, y}" -> a, b, rest, x, y */
    private static List<String> names(String list) {
        List<String> names = new ArrayList<>();
        for (String part : list.replaceAll("=[^,]*", "").split("[,{}\\[\\]:]")) {
            String n = part.strip().replaceAll("^\\.\\.\\.", "");
            if (n.matches("[A-Za-z_$][\\w$]*")) {
                names.add(n);
            }
        }
        return names;
    }

    /** Where the structure breaks (an unbalanced bracket, an unclosed string or comment), or null. */
    static String structure(String content) {
        Deque<Character> open = new ArrayDeque<>();
        Deque<Integer> openLines = new ArrayDeque<>();
        int line = 1;
        char previous = '(';
        for (int i = 0; i < content.length(); i++) {
            char c = content.charAt(i);
            if (c == '\n') {
                line++;
                continue;
            }
            if (Character.isWhitespace(c)) {
                continue;
            }
            if (c == '/' && i + 1 < content.length() && content.charAt(i + 1) == '/') {
                while (i + 1 < content.length() && content.charAt(i + 1) != '\n') {
                    i++;
                }
                continue;
            }
            if (c == '/' && i + 1 < content.length() && content.charAt(i + 1) == '*') {
                int end = content.indexOf("*/", i + 2);
                if (end < 0) {
                    return "a comment starting on line " + line + " is not closed";
                }
                line += count(content, i, end);
                i = end + 1;
                continue;
            }
            if (c == '\'' || c == '"' || c == '`') {
                int start = line;
                int j = i + 1;
                while (j < content.length() && content.charAt(j) != c) {
                    if (content.charAt(j) == '\\') {
                        j++;
                    } else if (content.charAt(j) == '\n') {
                        if (c != '`') {
                            return "a string starting on line " + start + " is not closed";
                        }
                        line++;
                    }
                    j++;
                }
                if (j >= content.length()) {
                    return "a string starting on line " + start + " is not closed";
                }
                i = j;
                previous = 'a';
                continue;
            }
            if (c == '/' && "(,=:[!&|?{};+-*%<>~^".indexOf(previous) >= 0 || c == '/' && endsWithKeyword(content, i)) {
                // A regular expression literal: up to the closing / outside a [...] class
                boolean inClass = false;
                int j = i + 1;
                for (; j < content.length() && content.charAt(j) != '\n'; j++) {
                    char r = content.charAt(j);
                    if (r == '\\') {
                        j++;
                    } else if (r == '[') {
                        inClass = true;
                    } else if (r == ']') {
                        inClass = false;
                    } else if (r == '/' && !inClass) {
                        break;
                    }
                }
                if (j >= content.length() || content.charAt(j) != '/') {
                    return "a regular expression on line " + line + " is not closed";
                }
                i = j;
                previous = 'a';
                continue;
            }
            if (c == '(' || c == '[' || c == '{') {
                open.push(c);
                openLines.push(line);
            } else if (c == ')' || c == ']' || c == '}') {
                char expected = c == ')' ? '(' : c == ']' ? '[' : '{';
                if (open.isEmpty()) {
                    return "'" + c + "' on line " + line + " closes nothing";
                }
                if (open.peek() != expected) {
                    return "'" + c + "' on line " + line + " does not match the '" + open.peek() + "' opened on line " + openLines.peek();
                }
                open.pop();
                openLines.pop();
            }
            previous = c;
        }
        return open.isEmpty() ? null : "the '" + open.peek() + "' opened on line " + openLines.peek() + " is not closed";
    }

    private static boolean endsWithKeyword(String content, int i) {
        String before = content.substring(Math.max(0, i - 12), i).stripTrailing();
        return before.matches("(?s).*\\b(return|typeof|case|in|of|delete|void|throw|new)$");
    }

    private static int count(String content, int from, int to) {
        int n = 0;
        for (int k = from; k < to; k++) {
            if (content.charAt(k) == '\n') {
                n++;
            }
        }
        return n;
    }

    /** The content with its comments blanked (found by scanning, in linear time; strings kept). */
    private static String withoutComments(String content) {
        return SourceScan.blank(content, SourceScan.scan(content, SourceScan.Syntax.CODE).comments());
    }

    /** The content with comments, strings and template literals blanked, so names inside them are not taken as code. */
    static String codeOnly(String content) {
        SourceScan.Parts parts = SourceScan.scan(content, SourceScan.Syntax.CODE);
        List<SourceScan.Range> both = new ArrayList<>(parts.comments());
        both.addAll(parts.strings());
        return SourceScan.blank(content, both);
    }
}
