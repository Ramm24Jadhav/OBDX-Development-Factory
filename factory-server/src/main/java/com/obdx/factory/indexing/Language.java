package com.obdx.factory.indexing;

import java.util.Locale;
import java.util.Map;
import java.util.Optional;

/**
 * File types the indexer reads, by extension. Covers OBDX UI (JET), backend (Java) and configuration/data files.
 */
public final class Language {

    private static final Map<String, String> BY_EXTENSION = Map.ofEntries(
            Map.entry("java", "java"),
            Map.entry("js", "javascript"),
            Map.entry("mjs", "javascript"),
            Map.entry("ts", "typescript"),
            Map.entry("tsx", "typescript"),
            Map.entry("html", "html"),
            Map.entry("htm", "html"),
            Map.entry("css", "css"),
            Map.entry("scss", "css"),
            Map.entry("json", "json"),
            Map.entry("xml", "xml"),
            Map.entry("properties", "properties"),
            Map.entry("sql", "sql"),
            Map.entry("yml", "yaml"),
            Map.entry("yaml", "yaml"));

    private Language() {
    }

    public static Optional<String> of(String fileName) {
        String lower = fileName.toLowerCase(Locale.ROOT);
        if (lower.endsWith(".min.js") || lower.endsWith("-min.js") || lower.endsWith(".min.css") || lower.endsWith("-min.css")) {
            return Optional.empty();
        }
        int dot = lower.lastIndexOf('.');
        return dot < 0 ? Optional.empty() : Optional.ofNullable(BY_EXTENSION.get(lower.substring(dot + 1)));
    }
}
