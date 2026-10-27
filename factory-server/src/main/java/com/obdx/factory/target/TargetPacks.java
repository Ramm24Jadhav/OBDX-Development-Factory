package com.obdx.factory.target;

import com.obdx.factory.design.ComponentCatalog;
import com.obdx.factory.pack.PackProperties;
import com.obdx.factory.pack.PackRule;
import com.obdx.factory.pack.Recipe;
import com.obdx.factory.pack.RecipeLoader;
import com.obdx.factory.pack.VersionPacks;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.TreeMap;
import java.util.stream.Stream;

/**
 * The target packs: built in (target-packs/ on the classpath: jet, react-native, react) and, optionally, the team's
 * own in factory.packs.dir/targets/&lt;id&gt;/. A team target.yml adds to or replaces parts of a built-in pack (or
 * defines a new pack); team templates and starter files win over built-in ones. Read at startup; a mistake stops it.
 */
@Component
public class TargetPacks {

    public static final List<String> BUILT_IN = List.of("jet", "react-native", "react");
    private static final Logger log = LoggerFactory.getLogger(TargetPacks.class);
    private static final String BASE = "target-packs";

    private final Map<String, TargetPack> packs = new LinkedHashMap<>();

    public TargetPacks(PackProperties properties) {
        Path teamRoot = properties.dir() == null || properties.dir().isBlank() ? null : Path.of(properties.dir()).resolve("targets");
        List<String> ids = new ArrayList<>(BUILT_IN);
        if (teamRoot != null && Files.isDirectory(teamRoot)) {
            try (Stream<Path> folders = Files.list(teamRoot)) {
                folders.filter(f -> Files.isRegularFile(f.resolve("target.yml"))).map(f -> f.getFileName().toString())
                        .filter(id -> !ids.contains(id)).sorted().forEach(ids::add);
            } catch (IOException e) {
                throw new UncheckedIOException("Cannot read " + teamRoot, e);
            }
        }
        for (String id : ids) {
            Path teamDir = teamRoot == null ? null : teamRoot.resolve(id);
            packs.put(id, load(id, teamDir != null && Files.isDirectory(teamDir) ? teamDir : null));
        }
        packs.values().forEach(p -> log.info("Target pack {}: {} rule(s), {} recipe(s), {} starter file(s)", p.id(), p.rules().size(),
                p.recipes().size(), p.starter().size()));
    }

    /** The built-in packs only, for tests and tools. */
    public static TargetPacks builtIn() {
        return new TargetPacks(new PackProperties(null));
    }

    public Optional<TargetPack> find(String id) {
        return Optional.ofNullable(id == null ? null : packs.get(id));
    }

    public TargetPack jet() {
        return packs.get(TargetPack.JET);
    }

    public List<TargetPack> all() {
        return List.copyOf(packs.values());
    }

    @SuppressWarnings("unchecked")
    private static TargetPack load(String id, Path teamDir) {
        boolean builtIn = BUILT_IN.contains(id);
        String source = builtIn ? BASE + "/" + id + "/target.yml" : teamDir.resolve("target.yml").toString();
        Map<String, Object> file = new LinkedHashMap<>(builtIn ? builtInFile(id, source) : read(teamDir.resolve("target.yml")));
        if (builtIn && teamDir != null && Files.isRegularFile(teamDir.resolve("target.yml"))) {
            Map<String, Object> team = read(teamDir.resolve("target.yml"));
            for (String key : List.of("title", "description", "preview", "defaultAppFolder", "guidance")) {
                if (team.get(key) != null) {
                    file.put(key, team.get(key));
                }
            }
            for (String key : List.of("structure", "components", "templates")) {
                if (team.get(key) instanceof Map<?, ?> values) {
                    Map<String, Object> merged = new LinkedHashMap<>(file.get(key) instanceof Map<?, ?> m ? (Map<String, Object>) m : Map.of());
                    values.forEach((k, v) -> merged.put(String.valueOf(k), v));
                    file.put(key, merged);
                }
            }
        }
        String where = "Target pack " + id + ": ";
        if (!id.equals(file.get("id"))) {
            throw new IllegalStateException(where + "target.yml must say id: " + id);
        }

        Map<String, PackRule> rules = new LinkedHashMap<>();
        Map<String, Recipe> recipes = new LinkedHashMap<>();
        RecipeLoader recipeLoader = new RecipeLoader(teamDir, BASE + "/" + id);
        VersionPacks.merge(rules, file, source);
        recipeLoader.merge(recipes, file, source);
        if (builtIn && teamDir != null && Files.isRegularFile(teamDir.resolve("target.yml"))) {
            Map<String, Object> team = read(teamDir.resolve("target.yml"));
            VersionPacks.merge(rules, team, teamDir.resolve("target.yml").toString());
            recipeLoader.merge(recipes, team, teamDir.resolve("target.yml").toString());
        }

        Map<String, TargetPack.ComponentMapping> components = new LinkedHashMap<>();
        if (file.get("components") instanceof Map<?, ?> raw) {
            raw.forEach((type, value) -> {
                if (!(value instanceof Map<?, ?> m) || m.get("component") == null) {
                    throw new IllegalStateException(where + "component mapping for " + type + " needs a 'component'");
                }
                String valueType = m.get("value") == null ? "string" : m.get("value").toString();
                if (!List.of("string", "list", "boolean").contains(valueType)) {
                    throw new IllegalStateException(where + "value of " + type + " must be string, list or boolean");
                }
                components.put(type.toString(), new TargetPack.ComponentMapping(m.get("component").toString(), valueType,
                        Boolean.TRUE.equals(m.get("options")), m.get("props") == null ? null : m.get("props").toString()));
            });
        }
        Map<String, String> templates = new LinkedHashMap<>();
        if (file.get("templates") instanceof Map<?, ?> raw) {
            raw.forEach((name, path) -> templates.put(name.toString(), recipeLoader.template(path.toString(), where)));
        }
        Map<String, String> structure = new LinkedHashMap<>();
        if (file.get("structure") instanceof Map<?, ?> raw) {
            raw.forEach((kind, path) -> structure.put(kind.toString(), path.toString()));
        }
        Map<String, String> starter = starter(id, teamDir);
        if (!TargetPack.JET.equals(id)) {
            for (ComponentCatalog.ComponentType type : ComponentCatalog.TYPES) {
                if (!components.containsKey(type.type())) {
                    throw new IllegalStateException(where + "no component mapping for the Screen Model type " + type.type());
                }
            }
            for (String kind : List.of("screen", "test", "texts", "navigation", "api")) {
                if (!structure.containsKey(kind)) {
                    throw new IllegalStateException(where + "structure." + kind + " is missing");
                }
            }
            for (String name : List.of("screen", "test")) {
                if (!templates.containsKey(name)) {
                    throw new IllegalStateException(where + "templates." + name + " is missing");
                }
            }
        }
        return new TargetPack(id, string(file, "title", id), string(file, "description", ""), string(file, "preview", id),
                string(file, "defaultAppFolder", null), structure, components, templates, string(file, "guidance", "").strip(),
                List.copyOf(rules.values()), List.copyOf(recipes.values()), starter);
    }

    /** The starter project: built-in files, then the team's starter/ files on top. Sorted by path. */
    private static Map<String, String> starter(String id, Path teamDir) {
        Map<String, String> files = new TreeMap<>();
        String prefix = BASE + "/" + id + "/starter/";
        try {
            for (Resource resource : new PathMatchingResourcePatternResolver().getResources("classpath*:" + prefix + "**/*")) {
                String url = resource.getURL().toString();
                int at = url.lastIndexOf(prefix);
                if (at < 0 || url.endsWith("/") || !resource.isReadable()) {
                    continue;
                }
                try (InputStream in = resource.getInputStream()) {
                    files.put(url.substring(at + prefix.length()), new String(in.readAllBytes(), StandardCharsets.UTF_8));
                }
            }
            Path teamStarter = teamDir == null ? null : teamDir.resolve("starter");
            if (teamStarter != null && Files.isDirectory(teamStarter)) {
                try (Stream<Path> walk = Files.walk(teamStarter)) {
                    for (Path file : walk.filter(Files::isRegularFile).toList()) {
                        files.put(teamStarter.relativize(file).toString().replace('\\', '/'), Files.readString(file, StandardCharsets.UTF_8));
                    }
                }
            }
        } catch (IOException e) {
            throw new UncheckedIOException("Cannot read the starter project of target pack " + id, e);
        }
        return files;
    }

    private static Map<String, Object> builtInFile(String id, String source) {
        try (InputStream in = TargetPacks.class.getResourceAsStream("/" + source)) {
            if (in == null) {
                throw new IllegalStateException("Built-in target pack missing: " + source);
            }
            return VersionPacks.parse(in, source);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    private static Map<String, Object> read(Path file) {
        try (InputStream in = Files.newInputStream(file)) {
            return VersionPacks.parse(in, file.toString());
        } catch (IOException e) {
            throw new UncheckedIOException("Cannot read " + file, e);
        }
    }

    private static String string(Map<String, Object> file, String key, String fallback) {
        Object value = file.get(key);
        return value == null ? fallback : value.toString();
    }
}
