package com.obdx.factory.profile;

import java.util.List;

/**
 * One detected fact about a bank's OBDX codebase, with the files it was detected from.
 *
 * @param key        stable identifier, for example "ui.jetVersion"
 * @param section    group shown in the UI
 * @param label      readable name
 * @param value      detected value, or null when nothing was found
 * @param confidence how sure the detection is
 * @param evidence   files (relative paths) that support the value, at most a handful
 */
public record ProfileFact(String key, Section section, String label, String value, Confidence confidence,
                          List<String> evidence) {

    public enum Section { OBDX, UI, BACKEND, DATA, INTEGRATION, CONVENTIONS }

    /** HIGH: declared explicitly (build file, manifest). MEDIUM: inferred from many files. LOW: few hints. NONE: not found. */
    public enum Confidence { HIGH, MEDIUM, LOW, NONE }

    public static ProfileFact notFound(String key, Section section, String label) {
        return new ProfileFact(key, section, label, null, Confidence.NONE, List.of());
    }

    public static ProfileFact of(String key, Section section, String label, String value, Confidence confidence,
                                 List<String> evidence) {
        return value == null || value.isBlank()
                ? notFound(key, section, label)
                : new ProfileFact(key, section, label, value, confidence, evidence.stream().distinct().limit(5).toList());
    }
}
