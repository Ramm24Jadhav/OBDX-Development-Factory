package com.obdx.factory.pack;

import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * What the quick checks of one workspace depend on: its OBDX version (which pack), its Project Profile facts (key to
 * value, confirmed or corrected values first) and the rules turned off for it.
 */
public record CheckScope(String version, Map<String, String> facts, Set<String> disabled) {

    private static final Pattern NUMBER = Pattern.compile("(\\d+)");
    /** "1.8" is Java 8. */
    private static final Pattern JAVA = Pattern.compile("(?:\\b1\\.)?(\\d+)");

    public CheckScope {
        facts = facts == null ? Map.of() : Map.copyOf(facts);
        disabled = disabled == null ? Set.of() : Set.copyOf(disabled);
    }

    /** No pack: only the syntax checks run. */
    public static CheckScope none() {
        return new CheckScope(null, Map.of(), Set.of());
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
