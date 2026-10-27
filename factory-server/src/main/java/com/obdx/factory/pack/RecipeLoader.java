package com.obdx.factory.pack;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;
import java.util.regex.PatternSyntaxException;

/**
 * Reads the "recipes" list of a pack file. Templates are read from the team's pack folder first, then from the
 * built-in packs. A recipe with the same id as an earlier one replaces it; "enabled: false" removes it.
 */
final class RecipeLoader {

    static final Set<String> ACTIONS = Set.of("create", "modify");
    static final Set<String> LAYERS = Set.of("data", "integration", "service", "ui", "test", "config");
    private static final Pattern ID = Pattern.compile("[a-z0-9][a-z0-9-]{1,63}");

    private final Path teamDir;

    RecipeLoader(Path teamDir) {
        this.teamDir = teamDir;
    }

    @SuppressWarnings("unchecked")
    void merge(Map<String, Recipe> recipes, Map<String, Object> file, String source) {
        Object list = file.get("recipes");
        if (list == null) {
            return;
        }
        if (!(list instanceof List)) {
            throw new IllegalStateException("Pack file " + source + ": 'recipes' must be a list");
        }
        for (Object entry : (List<Object>) list) {
            if (!(entry instanceof Map)) {
                throw new IllegalStateException("Pack file " + source + ": each recipe must be a map");
            }
            Map<String, Object> raw = (Map<String, Object>) entry;
            String id = string(raw, "id");
            if (id == null || !ID.matcher(id).matches()) {
                throw new IllegalStateException("Pack file " + source + ": recipe id '" + id + "' must be lowercase letters, digits and dashes");
            }
            if (Boolean.FALSE.equals(raw.get("enabled"))) {
                recipes.remove(id);
                continue;
            }
            recipes.put(id, recipe(raw, id, source));
        }
    }

    @SuppressWarnings("unchecked")
    private Recipe recipe(Map<String, Object> raw, String id, String source) {
        String where = "Pack file " + source + ", recipe " + id + ": ";
        String title = string(raw, "title");
        String guidance = string(raw, "guidance");
        if (title == null || guidance == null || guidance.isBlank()) {
            throw new IllegalStateException(where + "'title' and 'guidance' are required");
        }
        Map<String, Object> match = raw.get("match") instanceof Map<?, ?> m ? (Map<String, Object>) m : Map.of();
        Set<String> actions = lowercase(strings(match.get("action")));
        Set<String> layers = lowercase(strings(match.get("layer")));
        if (!ACTIONS.containsAll(actions)) {
            throw new IllegalStateException(where + "match.action must be create and/or modify");
        }
        if (!LAYERS.containsAll(layers)) {
            throw new IllegalStateException(where + "match.layer must be among " + LAYERS);
        }
        List<Recipe.Part> parts = new ArrayList<>();
        Object rawParts = raw.get("parts");
        if (!(rawParts instanceof List<?> partList) || partList.isEmpty()) {
            throw new IllegalStateException(where + "'parts' must list at least one kind of file");
        }
        Set<String> partIds = new LinkedHashSet<>();
        for (Object item : partList) {
            if (!(item instanceof Map)) {
                throw new IllegalStateException(where + "each part must be a map");
            }
            Recipe.Part part = part((Map<String, Object>) item, where);
            if (!partIds.add(part.id())) {
                throw new IllegalStateException(where + "part id " + part.id() + " is used twice");
            }
            parts.add(part);
        }
        return new Recipe(id, title, string(raw, "when"), guidance.strip(), actions, layers, parts, source);
    }

    @SuppressWarnings("unchecked")
    private Recipe.Part part(Map<String, Object> raw, String where) {
        String id = string(raw, "id");
        if (id == null || !ID.matcher(id).matches()) {
            throw new IllegalStateException(where + "part id '" + id + "' must be lowercase letters, digits and dashes");
        }
        List<String> files = strings(raw.get("files"));
        if (files.isEmpty()) {
            throw new IllegalStateException(where + "part " + id + ": 'files' must list at least one path glob");
        }
        String template = string(raw, "template");
        String content = template == null ? null : template(template, where);
        Map<String, Object> examples = raw.get("examples") instanceof Map<?, ?> e ? (Map<String, Object>) e : Map.of();
        String contains = string(examples, "contains");
        if (contains != null) {
            try {
                Pattern.compile(contains);
            } catch (PatternSyntaxException ex) {
                throw new IllegalStateException(where + "part " + id + ": invalid regular expression in examples.contains: " + ex.getDescription());
            }
        }
        List<String> exampleFiles = strings(examples.get("files"));
        Object count = examples.get("count");
        Recipe.ExampleFinder finder = new Recipe.ExampleFinder(exampleFiles.isEmpty() ? files : exampleFiles,
                strings(examples.get("exclude")), contains, count == null ? 2 : Integer.parseInt(count.toString()));
        return new Recipe.Part(id, string(raw, "name") == null ? id : string(raw, "name"), files, strings(raw.get("exclude")),
                template, content, finder);
    }

    private String template(String name, String where) {
        if (name.contains("..") || name.startsWith("/")) {
            throw new IllegalStateException(where + "template '" + name + "' must be a path inside the pack folder");
        }
        if (teamDir != null) {
            Path file = teamDir.resolve(name);
            if (Files.isRegularFile(file)) {
                try {
                    return Files.readString(file, StandardCharsets.UTF_8);
                } catch (IOException e) {
                    throw new UncheckedIOException("Cannot read template " + file, e);
                }
            }
        }
        try (InputStream in = RecipeLoader.class.getResourceAsStream("/packs/" + name)) {
            if (in == null) {
                throw new IllegalStateException(where + "template not found: " + name);
            }
            return new String(in.readAllBytes(), StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    private static Set<String> lowercase(List<String> values) {
        Set<String> result = new LinkedHashSet<>();
        values.forEach(v -> result.add(v.toLowerCase(Locale.ROOT)));
        return result;
    }

    private static String string(Map<String, Object> raw, String key) {
        Object value = raw.get(key);
        return value == null ? null : value.toString();
    }

    private static List<String> strings(Object value) {
        if (value == null) {
            return List.of();
        }
        if (value instanceof List<?> list) {
            List<String> result = new ArrayList<>();
            list.forEach(item -> result.add(String.valueOf(item)));
            return result;
        }
        return List.of(value.toString());
    }
}
