package com.obdx.factory.pack;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.yaml.snakeyaml.LoaderOptions;
import org.yaml.snakeyaml.Yaml;
import org.yaml.snakeyaml.constructor.SafeConstructor;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Pattern;
import java.util.regex.PatternSyntaxException;

/**
 * The version packs: built-in YAML files (resources/packs: common.yml and recipes.yml for every version, plus one
 * file per version) and, optionally, the team's own files with the same names in factory.packs.dir. Files are read
 * at startup; a mistake in a rule or recipe stops startup with a message naming it.
 */
@Component
public class VersionPacks {

    public static final List<String> VERSIONS = List.of("22.x", "25.x");
    private static final Logger log = LoggerFactory.getLogger(VersionPacks.class);
    private static final Pattern ID = Pattern.compile("[a-z0-9][a-z0-9-]{1,63}");

    private final Map<String, VersionPack> packs = new LinkedHashMap<>();

    public VersionPacks(PackProperties properties) {
        Path dir = properties.dir() == null || properties.dir().isBlank() ? null : Path.of(properties.dir());
        if (dir != null && !Files.isDirectory(dir)) {
            throw new IllegalStateException("factory.packs.dir is not a folder: " + dir);
        }
        Map<String, Object> common = builtIn("common.yml");
        Map<String, Object> commonRecipes = builtIn("recipes.yml");
        RecipeLoader recipeLoader = new RecipeLoader(dir);
        for (String version : VERSIONS) {
            Map<String, Object> own = builtIn(version + ".yml");
            Map<String, PackRule> rules = new LinkedHashMap<>();
            Map<String, Recipe> recipes = new LinkedHashMap<>();
            merge(rules, common, "packs/common.yml");
            merge(rules, own, "packs/" + version + ".yml");
            recipeLoader.merge(recipes, commonRecipes, "packs/recipes.yml");
            recipeLoader.merge(recipes, own, "packs/" + version + ".yml");
            Object javaLevel = own.get("java");
            String description = (String) own.getOrDefault("description", "OBDX " + version);
            if (dir != null) {
                for (String name : List.of("common.yml", "recipes.yml", version + ".yml")) {
                    Path file = dir.resolve(name);
                    if (Files.isRegularFile(file)) {
                        Map<String, Object> extra = read(file);
                        merge(rules, extra, file.toString());
                        recipeLoader.merge(recipes, extra, file.toString());
                        if (name.equals(version + ".yml") && extra.get("java") != null) {
                            javaLevel = extra.get("java");
                        }
                    }
                }
            }
            packs.put(version, new VersionPack(version, description, javaLevel == null ? 8 : Integer.parseInt(javaLevel.toString()),
                    List.copyOf(rules.values()), List.copyOf(recipes.values())));
        }
        packs.values().forEach(p -> log.info("Version pack {}: {} rule(s), {} recipe(s), Java level {}", p.version(), p.rules().size(),
                p.recipes().size(), p.javaLevel()));
    }

    /** The built-in packs only, for tests and tools. */
    public static VersionPacks builtIn() {
        return new VersionPacks(new PackProperties(null));
    }

    public Optional<VersionPack> find(String version) {
        return Optional.ofNullable(version == null ? null : packs.get(version));
    }

    public List<VersionPack> all() {
        return List.copyOf(packs.values());
    }

    private static Map<String, Object> builtIn(String name) {
        try (InputStream in = VersionPacks.class.getResourceAsStream("/packs/" + name)) {
            if (in == null) {
                throw new IllegalStateException("Built-in pack file missing: packs/" + name);
            }
            return parse(in, "packs/" + name);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    private static Map<String, Object> read(Path file) {
        try (InputStream in = Files.newInputStream(file)) {
            return parse(in, file.toString());
        } catch (IOException e) {
            throw new UncheckedIOException("Cannot read pack file " + file, e);
        }
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> parse(InputStream in, String source) {
        Object document = new Yaml(new SafeConstructor(new LoaderOptions())).load(in);
        if (document == null) {
            return Map.of();
        }
        if (!(document instanceof Map)) {
            throw new IllegalStateException("Pack file " + source + " must be a map with a 'rules' list");
        }
        return (Map<String, Object>) document;
    }

    @SuppressWarnings("unchecked")
    private static void merge(Map<String, PackRule> rules, Map<String, Object> file, String source) {
        Object list = file.get("rules");
        if (list == null) {
            return;
        }
        if (!(list instanceof List)) {
            throw new IllegalStateException("Pack file " + source + ": 'rules' must be a list");
        }
        for (Object entry : (List<Object>) list) {
            if (!(entry instanceof Map)) {
                throw new IllegalStateException("Pack file " + source + ": each rule must be a map");
            }
            Map<String, Object> raw = (Map<String, Object>) entry;
            String id = string(raw, "id");
            if (id == null || !ID.matcher(id).matches()) {
                throw new IllegalStateException("Pack file " + source + ": rule id '" + id + "' must be lowercase letters, digits and dashes");
            }
            if (Boolean.FALSE.equals(raw.get("enabled"))) {
                rules.remove(id);
                continue;
            }
            rules.put(id, rule(raw, id, source));
        }
    }

    @SuppressWarnings("unchecked")
    private static PackRule rule(Map<String, Object> raw, String id, String source) {
        String where = "Pack file " + source + ", rule " + id + ": ";
        String severity = string(raw, "severity");
        if (severity == null || !List.of("error", "warning").contains(severity.toLowerCase(Locale.ROOT))) {
            throw new IllegalStateException(where + "severity must be error or warning");
        }
        String forbid = string(raw, "forbid");
        String require = string(raw, "require");
        if ((forbid == null) == (require == null)) {
            throw new IllegalStateException(where + "give exactly one of 'forbid' or 'require'");
        }
        try {
            Pattern.compile(forbid != null ? forbid : require, Pattern.MULTILINE);
        } catch (PatternSyntaxException e) {
            throw new IllegalStateException(where + "invalid regular expression: " + e.getDescription());
        }
        List<String> files = strings(raw.get("files"));
        if (files.isEmpty()) {
            throw new IllegalStateException(where + "'files' must list at least one path glob");
        }
        String message = string(raw, "message");
        if (message == null || message.isBlank()) {
            throw new IllegalStateException(where + "'message' is required");
        }
        Object minJet = raw.get("minJet");
        Map<String, String> ifProfile = new LinkedHashMap<>();
        if (raw.get("ifProfile") instanceof Map<?, ?> conditions) {
            conditions.forEach((key, value) -> ifProfile.put(String.valueOf(key), String.valueOf(value)));
        } else if (raw.get("ifProfile") != null) {
            throw new IllegalStateException(where + "'ifProfile' must map profile fact keys to regular expressions");
        }
        for (String condition : ifProfile.values()) {
            try {
                Pattern.compile(condition);
            } catch (PatternSyntaxException e) {
                throw new IllegalStateException(where + "invalid regular expression in ifProfile: " + e.getDescription());
            }
        }
        return new PackRule(id, string(raw, "title") == null ? id : string(raw, "title"),
                PackRule.Severity.valueOf(severity.toUpperCase(Locale.ROOT)), files, strings(raw.get("exclude")), forbid, require,
                message.strip(), minJet == null ? null : Integer.parseInt(minJet.toString()), ifProfile);
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
