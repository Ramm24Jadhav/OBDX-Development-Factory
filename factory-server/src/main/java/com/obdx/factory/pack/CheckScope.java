package com.obdx.factory.pack;

import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * What the quick checks and recipes of one workspace depend on: its OBDX version (which version pack), its Project
 * Profile facts (key to value, confirmed or corrected values first), the rules turned off for it, and its target pack
 * with the folder of the new app (files there follow the target pack instead of the version pack).
 */
public record CheckScope(String version, Map<String, String> facts, Set<String> disabled, String target, String appFolder) {

    private static final Pattern NUMBER = Pattern.compile("(\\d+)");
    /** "1.8" is Java 8. */
    private static final Pattern JAVA = Pattern.compile("(?:\\b1\\.)?(\\d+)");

    public CheckScope {
        facts = facts == null ? Map.of() : Map.copyOf(facts);
        disabled = disabled == null ? Set.of() : Set.copyOf(disabled);
        target = target == null ? "jet" : target;
        appFolder = appFolder == null || appFolder.isBlank() || "jet".equals(target) ? null : appFolder.replaceAll("^/+|/+$", "");
    }

    /** A workspace that enhances the bank's existing OBDX UI (the jet target). */
    public CheckScope(String version, Map<String, String> facts, Set<String> disabled) {
        this(version, facts, disabled, "jet", null);
    }

    /** No pack: only the syntax checks run. */
    public static CheckScope none() {
        return new CheckScope(null, Map.of(), Set.of());
    }

    /** True for files of the new app (a React Native or React target), which follow the target pack. */
    public boolean inApp(String path) {
        return appFolder != null && path != null && path.replace('\\', '/').startsWith(appFolder + "/");
    }

    /** The Java version from the profile ("Java 8 (also: ...)" gives 8), or null. */
    public Integer javaVersion() {
        return firstNumber(facts.get("backend.javaVersion"), JAVA);
    }

    /** The Oracle JET major version from the profile ("JET 11.1.0" gives 11), or null. */
    public Integer jetMajor() {
        return firstNumber(facts.get("ui.jetVersion"), NUMBER);
    }

    private static Integer firstNumber(String value, Pattern pattern) {
        if (value == null) {
            return null;
        }
        Matcher matcher = pattern.matcher(value);
        return matcher.find() ? Integer.valueOf(matcher.group(1)) : null;
    }
}
