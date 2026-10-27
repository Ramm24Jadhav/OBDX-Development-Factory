package com.obdx.factory.jenkins;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Finds errors with file and line in a build log: Maven and javac compiler errors, and the "file:line" errors of
 * JavaScript tools.
 */
public final class BuildLogParser {

    /** file is the path as the build printed it, often absolute on the build agent. */
    public record BuildError(String file, int line, String message) {
    }

    private static final List<Pattern> PATTERNS = List.of(
            // Maven: [ERROR] /work/backend/src/com/bank/A.java:[12,5] cannot find symbol
            Pattern.compile("^\\[ERROR]\\s+(?<file>\\S+\\.\\w+):\\[(?<line>\\d+),\\d+]\\s*(?<msg>.*)$"),
            // javac and Ant: backend/src/com/bank/A.java:12: error: cannot find symbol
            Pattern.compile("^(?:\\s*\\[javac]\\s+)?(?<file>\\S+\\.java):(?<line>\\d+):\\s*error:\\s*(?<msg>.*)$"),
            // ESLint, TypeScript and similar: ui/js/a.js:10:5: error message   or   ui/js/a.ts(10,5): error TS...
            Pattern.compile("^(?<file>\\S+\\.(?:js|ts|tsx|html|json|xml)):(?<line>\\d+):\\d+:?\\s*(?<msg>.*)$"),
            Pattern.compile("^(?<file>\\S+\\.(?:ts|tsx|js))\\((?<line>\\d+),\\d+\\):\\s*(?<msg>.*)$"));

    private BuildLogParser() {
    }

    public static List<BuildError> errors(String log) {
        Set<BuildError> errors = new LinkedHashSet<>();
        for (String raw : log.split("\\R")) {
            String line = raw.replaceAll("\\u001B\\[[;\\d]*m", "").strip();
            for (Pattern pattern : PATTERNS) {
                Matcher matcher = pattern.matcher(line);
                if (matcher.matches()) {
                    errors.add(new BuildError(matcher.group("file").replace('\\', '/'), Integer.parseInt(matcher.group("line")),
                            matcher.group("msg").strip()));
                    break;
                }
            }
        }
        return new ArrayList<>(errors);
    }

    /** The changed file an error refers to, if any: the build's path ends with the change's path, or the reverse. */
    public static String matchFile(String buildPath, List<String> changedPaths) {
        String normalized = buildPath.replace('\\', '/');
        for (String path : changedPaths) {
            if (normalized.equals(path) || normalized.endsWith("/" + path)) {
                return path;
            }
        }
        for (String path : changedPaths) {
            if (path.endsWith("/" + normalized)) {
                return path;
            }
        }
        return null;
    }

    /** The last lines of the log, where builds summarize what failed. */
    public static String tail(String log, int lines) {
        String[] all = log.split("\\R");
        int from = Math.max(0, all.length - lines);
        return String.join("\n", java.util.Arrays.copyOfRange(all, from, all.length));
    }
}
