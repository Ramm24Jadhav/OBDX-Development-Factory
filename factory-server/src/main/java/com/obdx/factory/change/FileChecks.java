package com.obdx.factory.change;

import com.github.javaparser.JavaParser;
import com.github.javaparser.ParseResult;
import com.github.javaparser.ParserConfiguration;
import com.github.javaparser.ast.CompilationUnit;
import org.xml.sax.InputSource;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.json.JsonMapper;

import javax.xml.XMLConstants;
import javax.xml.parsers.DocumentBuilderFactory;
import java.io.StringReader;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/**
 * Quick checks of generated files before anyone builds them. Java, JSON and XML are parsed; a failure is sent back
 * to the model to fix. JavaScript and HTML get a basic bracket and tag balance check whose result is only a warning,
 * because a simple check can be wrong. A real build (Jenkins) remains the final check.
 */
public final class FileChecks {

    public enum Status { PASSED, FAILED, WARNING, NOT_CHECKED }

    public record Result(Status status, String message) {
    }

    private static final JavaParser JAVA = new JavaParser(new ParserConfiguration().setLanguageLevel(ParserConfiguration.LanguageLevel.JAVA_21));
    private static final JsonMapper JSON = JsonMapper.builder().build();
    private static final Pattern HTML_TAG = Pattern.compile("<(/?)((?:oj-[a-z-]+)|div|template|table|tr|td|ul|li|form|span|section)(?=[\\s>/])[^>]*?(/?)>",
            Pattern.CASE_INSENSITIVE);

    private FileChecks() {
    }

    public static Result check(String path, String content) {
        String lower = path.toLowerCase(Locale.ROOT);
        if (content == null || content.isBlank()) {
            return new Result(Status.FAILED, "The file is empty");
        }
        if (lower.endsWith(".java")) {
            return java(content);
        }
        if (lower.endsWith(".json")) {
            return json(content);
        }
        if (lower.endsWith(".xml")) {
            return xml(content);
        }
        if (lower.endsWith(".js") || lower.endsWith(".ts")) {
            return brackets(content);
        }
        if (lower.endsWith(".html")) {
            return html(content);
        }
        return new Result(Status.NOT_CHECKED, null);
    }

    private static Result java(String content) {
        ParseResult<CompilationUnit> result = JAVA.parse(content);
        if (result.isSuccessful()) {
            return new Result(Status.PASSED, null);
        }
        String problems = result.getProblems().stream().limit(3).map(p -> p.getVerboseMessage().lines().findFirst().orElse(""))
                .collect(Collectors.joining("; "));
        return new Result(Status.FAILED, "Java does not parse: " + problems);
    }

    private static Result json(String content) {
        try {
            JSON.readTree(content);
            return new Result(Status.PASSED, null);
        } catch (JacksonException e) {
            return new Result(Status.FAILED, "Invalid JSON: " + e.getOriginalMessage());
        }
    }

    private static Result xml(String content) {
        try {
            DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
            factory.setFeature(XMLConstants.FEATURE_SECURE_PROCESSING, true);
            factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
            var builder = factory.newDocumentBuilder();
            builder.setErrorHandler(null);
            builder.parse(new InputSource(new StringReader(content)));
            return new Result(Status.PASSED, null);
        } catch (Exception e) {
            return new Result(Status.FAILED, "Invalid XML: " + e.getMessage());
        }
    }

    /** Brackets must balance outside strings and comments. */
    static Result brackets(String content) {
        Deque<Character> open = new ArrayDeque<>();
        int line = 1;
        for (int i = 0; i < content.length(); i++) {
            char c = content.charAt(i);
            if (c == '\n') {
                line++;
            } else if (c == '/' && i + 1 < content.length() && content.charAt(i + 1) == '/') {
                while (i < content.length() && content.charAt(i) != '\n') {
                    i++;
                }
                line++;
            } else if (c == '/' && i + 1 < content.length() && content.charAt(i + 1) == '*') {
                int endComment = content.indexOf("*/", i + 2);
                if (endComment < 0) {
                    return new Result(Status.WARNING, "Unclosed comment starting on line " + line);
                }
                line += (int) content.substring(i, endComment).chars().filter(ch -> ch == '\n').count();
                i = endComment + 1;
            } else if (c == '\'' || c == '"' || c == '`') {
                int j = i + 1;
                while (j < content.length() && content.charAt(j) != c) {
                    if (content.charAt(j) == '\\') {
                        j++;
                    } else if (content.charAt(j) == '\n') {
                        line++;
                        if (c != '`') {
                            break;
                        }
                    }
                    j++;
                }
                i = j;
            } else if (c == '(' || c == '[' || c == '{') {
                open.push(c);
            } else if (c == ')' || c == ']' || c == '}') {
                char expected = c == ')' ? '(' : c == ']' ? '[' : '{';
                if (open.isEmpty() || open.pop() != expected) {
                    return new Result(Status.WARNING, "Unbalanced '" + c + "' on line " + line + " (basic check)");
                }
            }
        }
        return open.isEmpty() ? new Result(Status.PASSED, null)
                : new Result(Status.WARNING, open.size() + " bracket(s) not closed (basic check)");
    }

    /** Common container elements and JET components must be closed. */
    static Result html(String content) {
        Deque<String> open = new ArrayDeque<>();
        Matcher matcher = HTML_TAG.matcher(content.replaceAll("(?s)<!--.*?-->", ""));
        while (matcher.find()) {
            String tag = matcher.group(2).toLowerCase(Locale.ROOT);
            boolean closing = !matcher.group(1).isEmpty();
            boolean selfClosing = !matcher.group(3).isEmpty();
            if (selfClosing) {
                continue;
            }
            if (!closing) {
                open.push(tag);
            } else if (open.isEmpty() || !open.pop().equals(tag)) {
                return new Result(Status.WARNING, "</" + tag + "> does not match an open tag (basic check)");
            }
        }
        return open.isEmpty() ? new Result(Status.PASSED, null)
                : new Result(Status.WARNING, "<" + open.peek() + "> is not closed (basic check)");
    }
}
