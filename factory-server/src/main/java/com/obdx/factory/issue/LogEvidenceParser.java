package com.obdx.factory.issue;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/**
 * Finds the evidence in logs, stack traces and text read from screenshots without a model: exceptions and their
 * causes, stack frames outside the Java and server platform, HTTP status codes, error codes, URLs, correlation ids,
 * configuration keys and error lines, each with its line number. Only these lines reach the model, so large logs never
 * go to it whole.
 */
public final class LogEvidenceParser {

    /** @param screenshot the text was read from a screenshot */
    public record Source(String name, String text, boolean screenshot) {
    }

    private static final int MAX_TEXT = 300;
    private static final Map<String, Integer> LIMITS = Map.of("EXCEPTION", 10, "CAUSE", 10, "FRAME", 12, "HTTP_STATUS", 5,
            "ERROR_CODE", 10, "URL", 8, "KEY", 10, "CORRELATION_ID", 3, "ERROR_LINE", 15, "SCREENSHOT", 10);

    private static final Pattern ANSI = Pattern.compile("\\u001B\\[[;\\d]*m");
    private static final Pattern FRAME = Pattern.compile("^\\s*at\\s+((?:[\\w$]+\\.)+)([\\w$<>]+)\\(([^)]*)\\)");
    private static final Pattern CAUSED_BY = Pattern.compile("^\\s*Caused by:\\s*(.+)$");
    private static final Pattern EXCEPTION = Pattern.compile(
            "((?:[a-zA-Z_$][\\w$]*\\.)+[A-Z][\\w$]*(?:Exception|Error|Fault|Throwable))(?::\\s*(.*))?");
    private static final Pattern HTTP_STATUS = Pattern.compile(
            "(?i)\\b(?:http(?:/\\d(?:\\.\\d)?)?\\s+|status(?:\\s*code)?\\s*[:=]?\\s*|response\\s+code\\s*[:=]?\\s*)([45]\\d\\d)\\b");
    private static final Pattern ERROR_CODE = Pattern.compile(
            "\\b(?:(?:[A-Z][A-Z0-9]{1,6}_){1,3}\\d{2,5}|(?:ORA|BEA|JBO|OSB|JPS|OWS|SSL|DIGX)-\\d{3,6})\\b");
    private static final Pattern URL = Pattern.compile("https?://[^\\s\"'<>)\\]]+");
    private static final Pattern CORRELATION = Pattern.compile(
            "(?i)\\b(?:correlation[-_ ]?id|x-request-id|request[-_ ]?id|ecid|trace[-_ ]?id)\\b[\"']?\\s*[:=\\[]?\\s*[\"']?([\\w.:-]{6,})");
    private static final Pattern CONFIG_WORDS = Pattern.compile(
            "(?i)\\b(property|properties|config|configuration|parameter|preference|key|not configured|missing|undefined)\\b");
    private static final Pattern DOTTED_KEY = Pattern.compile("(?<![\\w.])[a-z][\\w-]*(?:\\.[\\w-]+)+(?![\\w.])");
    private static final Pattern SNAKE_KEY = Pattern.compile("\\b[A-Z][A-Z0-9]+(?:_[A-Z0-9]+)+\\b");
    private static final Pattern FILE_NAME = Pattern.compile("(?i).*\\.(java|xml|properties|log|txt|jsp|js|json|html|class|jar|ear|war|sql)$");
    private static final Pattern ERROR_LEVEL = Pattern.compile("\\b(ERROR|SEVERE|FATAL)\\b|<Error>|<Critical>|<Alert>|<Emergency>");

    /** Frames of these packages are the platform, not the bank's or the product's code. */
    private static final List<String> PLATFORM = List.of("java.", "javax.", "jakarta.", "sun.", "jdk.", "com.sun.",
            "org.springframework.", "org.apache.", "org.glassfish.", "org.eclipse.", "weblogic.", "oracle.jdbc.",
            "oracle.ucp.", "org.hibernate.", "com.fasterxml.", "tools.jackson.", "io.netty.", "reactor.", "org.jboss.",
            "kotlin.", "scala.", "groovy.", "com.google.", "org.junit.");

    private LogEvidenceParser() {
    }

    public static Evidence parse(List<Source> sources) {
        Collector collector = new Collector();
        for (Source source : sources) {
            if (source.text() == null || source.text().isBlank()) {
                continue;
            }
            if (source.screenshot()) {
                collector.add("SCREENSHOT", source.name(), null, source.text().strip(), Function.identity(), 600);
            }
            String[] lines = source.text().split("\\R");
            for (int i = 0; i < lines.length; i++) {
                parseLine(collector, source.name(), source.screenshot() ? null : i + 1, ANSI.matcher(lines[i]).replaceAll(""));
            }
        }
        if (collector.topFrame != null) {
            collector.signature.add(collector.topFrame);
        }
        return new Evidence(collector.items, collector.signature.stream().limit(8).collect(Collectors.joining(" ")));
    }

    private static void parseLine(Collector collector, String source, Integer line, String text) {
        Matcher frame = FRAME.matcher(text);
        if (frame.find()) {
            String className = frame.group(1).substring(0, frame.group(1).length() - 1);
            if (PLATFORM.stream().noneMatch(className::startsWith)) {
                String method = className + "." + frame.group(2);
                collector.add("FRAME", source, line, method + "(" + frame.group(3) + ")", Function.identity(), MAX_TEXT);
                if (collector.topFrame == null) {
                    collector.topFrame = method.toLowerCase(Locale.ROOT);
                }
            }
            return;
        }
        Matcher cause = CAUSED_BY.matcher(text);
        if (cause.find()) {
            Matcher exception = EXCEPTION.matcher(cause.group(1));
            if (exception.find()) {
                collector.signature.add(exception.group(1).toLowerCase(Locale.ROOT));
            }
            collector.add("CAUSE", source, line, cause.group(1).strip(), Function.identity(), MAX_TEXT);
        } else {
            Matcher exception = EXCEPTION.matcher(text);
            if (exception.find()) {
                collector.signature.add(exception.group(1).toLowerCase(Locale.ROOT));
                String message = exception.group(2) == null ? "" : ": " + exception.group(2).strip();
                collector.add("EXCEPTION", source, line, exception.group(1) + message, Function.identity(), MAX_TEXT);
            }
        }
        Matcher http = HTTP_STATUS.matcher(text);
        while (http.find()) {
            collector.add("HTTP_STATUS", source, line, "HTTP " + http.group(1) + " in: " + text.strip(), t -> t.substring(0, 8), MAX_TEXT);
        }
        Matcher code = ERROR_CODE.matcher(text);
        while (code.find()) {
            collector.signature.add(code.group().toLowerCase(Locale.ROOT));
            String found = code.group();
            collector.add("ERROR_CODE", source, line, found + " in: " + text.strip(), t -> found, MAX_TEXT);
        }
        Matcher url = URL.matcher(text);
        while (url.find()) {
            collector.add("URL", source, line, url.group(), Function.identity(), MAX_TEXT);
        }
        Matcher correlation = CORRELATION.matcher(text);
        if (correlation.find()) {
            collector.add("CORRELATION_ID", source, line, correlation.group(1), Function.identity(), MAX_TEXT);
        }
        if (CONFIG_WORDS.matcher(text).find()) {
            for (String key : keys(text)) {
                collector.add("KEY", source, line, key + " in: " + text.strip(), t -> key, MAX_TEXT);
            }
        }
        if (ERROR_LEVEL.matcher(text).find()) {
            collector.add("ERROR_LINE", source, line, text.strip(), Function.identity(), MAX_TEXT);
        }
    }

    /** Configuration-like keys in a line: dotted lower-case names and UPPER_SNAKE names, not classes, files or URLs. */
    static List<String> keys(String text) {
        String withoutUrls = URL.matcher(text).replaceAll(" ");
        Set<String> keys = new LinkedHashSet<>();
        Matcher dotted = DOTTED_KEY.matcher(withoutUrls);
        while (dotted.find()) {
            String key = dotted.group();
            boolean className = List.of(key.split("\\.")).stream().anyMatch(part -> !part.isEmpty() && Character.isUpperCase(part.charAt(0)));
            if (!className && !FILE_NAME.matcher(key).matches() && PLATFORM.stream().noneMatch(key::startsWith)
                    && !key.startsWith("com.") && !key.startsWith("org.") && !key.matches("[\\d.]+")) {
                keys.add(key);
            }
        }
        Matcher snake = SNAKE_KEY.matcher(withoutUrls);
        while (snake.find()) {
            if (!ERROR_CODE.matcher(snake.group()).matches()) {
                keys.add(snake.group());
            }
        }
        return new ArrayList<>(keys);
    }

    private static final class Collector {
        final List<Evidence.Item> items = new ArrayList<>();
        final Set<String> seen = new LinkedHashSet<>();
        final Set<String> signature = new LinkedHashSet<>();
        String topFrame;

        /** Adds an item unless one with the same kind and key exists or the kind has reached its limit. */
        void add(String kind, String source, Integer line, String text, Function<String, String> key, int maxText) {
            if (!seen.add(kind + "|" + key.apply(text))) {
                return;
            }
            long count = items.stream().filter(item -> item.kind().equals(kind)).count();
            if (count >= LIMITS.get(kind)) {
                return;
            }
            String capped = text.length() > maxText ? text.substring(0, maxText) + "..." : text;
            items.add(new Evidence.Item("E" + (items.size() + 1), kind, source, line, capped));
        }
    }
}
