package com.obdx.factory.pack;

import com.obdx.factory.common.BadRequestException;
import com.obdx.factory.common.NotFoundException;
import com.obdx.factory.importing.StorageProperties;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/**
 * A workspace's view of the recipes of its version pack, with reference examples from its own code: the files
 * developers pinned, then files the pack's finders pick (customization folders first, Oracle product code last).
 */
@Service
public class RecipeService {

    /** Candidate files larger than this are not used as examples; they would crowd out everything else in a prompt. */
    private static final int MAX_EXAMPLE_BYTES = 40_000;
    private static final int MIN_EXAMPLE_BYTES = 40;
    /** At most this many candidates are opened to test a part's "contains" pattern. */
    private static final int MAX_CANDIDATES_READ = 150;
    private static final Pattern FOLDER = Pattern.compile("([^,]+?/) \\(");
    private static final String PRODUCT_PATH = "com/ofss/";

    public record Example(String path, boolean pinned, String reason) {
    }

    public record PartView(String id, String name, List<String> files, List<String> exclude, String template,
                           String templateContent, List<Example> examples) {
    }

    public record RecipeView(String id, String title, String when, String guidance, List<String> actions, List<String> layers,
                             String source, List<PartView> parts) {
    }

    public record WorkspaceRecipes(String version, int indexedFiles, List<RecipeView> recipes) {
    }

    private record CodeFile(String path, int size) {
    }

    private record Pin(String path, String by) {
    }

    private final VersionPacks packs;
    private final PackService packService;
    private final StorageProperties storage;
    private final JdbcTemplate jdbc;

    public RecipeService(VersionPacks packs, PackService packService, StorageProperties storage, JdbcTemplate jdbc) {
        this.packs = packs;
        this.packService = packService;
        this.storage = storage;
        this.jdbc = jdbc;
    }

    public WorkspaceRecipes get(UUID workspaceId) {
        CheckScope scope = packService.scope(workspaceId);
        VersionPack pack = pack(scope);
        Finder finder = new Finder(workspaceId, scope);
        List<RecipeView> views = pack.recipes().stream().map(recipe -> new RecipeView(recipe.id(), recipe.title(), recipe.when(),
                recipe.guidance(), List.copyOf(recipe.actions()), List.copyOf(recipe.layers()), recipe.source(),
                recipe.parts().stream().map(part -> new PartView(part.id(), part.name(), part.files(), part.exclude(), part.template(),
                        part.content(), finder.examples(recipe, part))).toList())).toList();
        return new WorkspaceRecipes(pack.version(), finder.files.size(), views);
    }

    /** Pins a file of the workspace's code as a reference example of a recipe part. */
    public WorkspaceRecipes pin(UUID workspaceId, String recipeId, String partId, String path, String by) {
        part(workspaceId, recipeId, partId);
        String normalized = path == null ? "" : path.strip().replace('\\', '/');
        Integer known = jdbc.queryForObject("SELECT count(*) FROM code_file WHERE workspace_id = ? AND path = ?", Integer.class,
                workspaceId, normalized);
        if (known == null || known == 0) {
            throw new BadRequestException("No file " + normalized + " in this workspace's indexed code");
        }
        jdbc.update("INSERT INTO workspace_reference_example (workspace_id, recipe_id, part_id, path, pinned_by, pinned_at) "
                + "VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING", workspaceId, recipeId, partId, normalized, by, OffsetDateTime.now());
        return get(workspaceId);
    }

    public WorkspaceRecipes unpin(UUID workspaceId, String recipeId, String partId, String path) {
        part(workspaceId, recipeId, partId);
        jdbc.update("DELETE FROM workspace_reference_example WHERE workspace_id = ? AND recipe_id = ? AND part_id = ? AND path = ?",
                workspaceId, recipeId, partId, path);
        return get(workspaceId);
    }

    /** The reference example paths for a plan item (pinned first), or an empty list when no recipe covers it. */
    public List<String> examplesFor(UUID workspaceId, String path, String action, String layer) {
        CheckScope scope = packService.scope(workspaceId);
        Optional<Recipe.Match> match = packs.find(scope.version()).flatMap(p -> p.recipeFor(path, action, layer));
        if (match.isEmpty()) {
            return List.of();
        }
        return new Finder(workspaceId, scope).examples(match.get().recipe(), match.get().part()).stream().map(Example::path).toList();
    }

    /** A short description of the recipes, with example paths, for the planner. */
    public String planGuide(UUID workspaceId) {
        CheckScope scope = packService.scope(workspaceId);
        VersionPack pack = packs.find(scope.version()).orElse(null);
        if (pack == null || pack.recipes().isEmpty()) {
            return "";
        }
        Finder finder = new Finder(workspaceId, scope);
        StringBuilder guide = new StringBuilder();
        for (Recipe recipe : pack.recipes()) {
            guide.append("- ").append(recipe.title()).append(" (").append(String.join("/", recipe.actions().isEmpty() ? List.of("create", "modify") : recipe.actions().stream().sorted().toList()))
                    .append(recipe.layers().isEmpty() ? "" : ", layer " + String.join("/", recipe.layers().stream().sorted().toList())).append("): ")
                    .append(recipe.when() == null ? "" : recipe.when()).append('\n');
            for (Recipe.Part part : recipe.parts()) {
                List<Example> examples = finder.examples(recipe, part);
                guide.append("  - ").append(part.name())
                        .append(examples.isEmpty() ? "" : "; follow, for example, " + examples.stream().map(Example::path).collect(Collectors.joining(", ")))
                        .append('\n');
            }
        }
        return guide.toString();
    }

    private Recipe.Part part(UUID workspaceId, String recipeId, String partId) {
        VersionPack pack = pack(packService.scope(workspaceId));
        Recipe recipe = pack.recipe(recipeId).orElseThrow(() -> new NotFoundException("No recipe " + recipeId + " in the OBDX " + pack.version() + " pack"));
        Recipe.Part part = recipe.part(partId);
        if (part == null) {
            throw new NotFoundException("No part " + partId + " in recipe " + recipeId);
        }
        return part;
    }

    private VersionPack pack(CheckScope scope) {
        return packs.find(scope.version()).orElseThrow(() -> new NotFoundException("No version pack for OBDX " + scope.version()));
    }

    /** Finds examples in one workspace's code; reads the file list and pins once. */
    private final class Finder {

        private final List<CodeFile> files;
        private final List<String> customizationFolders = new ArrayList<>();
        private final Map<String, List<Pin>> pins = new LinkedHashMap<>();
        private final Path workingCopy;

        Finder(UUID workspaceId, CheckScope scope) {
            this.files = jdbc.query("SELECT path, size_bytes FROM code_file WHERE workspace_id = ?",
                    (rs, row) -> new CodeFile(rs.getString("path"), rs.getInt("size_bytes")), workspaceId);
            String folders = scope.facts().get("conventions.customizationFolders");
            if (folders != null) {
                Matcher matcher = FOLDER.matcher(folders);
                while (matcher.find()) {
                    customizationFolders.add(matcher.group(1).strip());
                }
            }
            jdbc.query("SELECT recipe_id, part_id, path, pinned_by FROM workspace_reference_example WHERE workspace_id = ? ORDER BY pinned_at",
                    rs -> {
                        pins.computeIfAbsent(rs.getString("recipe_id") + "/" + rs.getString("part_id"), k -> new ArrayList<>())
                                .add(new Pin(rs.getString("path"), rs.getString("pinned_by")));
                    }, workspaceId);
            this.workingCopy = storage.workingCopy(workspaceId);
        }

        List<Example> examples(Recipe recipe, Recipe.Part part) {
            List<Example> result = new ArrayList<>();
            for (Pin pin : pins.getOrDefault(recipe.id() + "/" + part.id(), List.of())) {
                result.add(new Example(pin.path(), true, "Pinned" + (pin.by() == null ? "" : " by " + pin.by())));
            }
            int wanted = Math.max(part.examples().count(), result.size());
            Pattern contains = part.examples().contains() == null ? null : Pattern.compile(part.examples().contains(), Pattern.MULTILINE);
            List<CodeFile> candidates = files.stream()
                    .filter(f -> f.size() >= MIN_EXAMPLE_BYTES && f.size() <= MAX_EXAMPLE_BYTES && part.examples().accepts(f.path()))
                    .filter(f -> result.stream().noneMatch(e -> e.path().equals(f.path())))
                    .sorted(Comparator.comparingInt(this::score).reversed()
                            .thenComparingInt(f -> Math.abs(f.size() - 4000))
                            .thenComparing(CodeFile::path))
                    .limit(MAX_CANDIDATES_READ).toList();
            for (CodeFile candidate : candidates) {
                if (result.size() >= wanted) {
                    break;
                }
                if (contains != null && !contains.matcher(read(candidate.path())).find()) {
                    continue;
                }
                result.add(new Example(candidate.path(), false, reason(candidate.path())));
            }
            return result;
        }

        private int score(CodeFile file) {
            int score = 0;
            if (folder(file.path()) != null) {
                score += 3;
            }
            if (file.path().contains(PRODUCT_PATH)) {
                score -= 3;
            }
            if (file.size() >= 1000 && file.size() <= 15000) {
                score += 1;
            }
            return score;
        }

        private String folder(String path) {
            return customizationFolders.stream().filter(path::startsWith).findFirst().orElse(null);
        }

        private String reason(String path) {
            String folder = folder(path);
            if (folder != null) {
                return "In the customization folder " + folder;
            }
            return path.contains(PRODUCT_PATH) ? "Oracle product code (no bank example found)" : "Bank code of this kind";
        }

        private String read(String path) {
            try {
                // Latin-1 never fails to decode; the patterns only look for ASCII text.
                return new String(Files.readAllBytes(workingCopy.resolve(path)), StandardCharsets.ISO_8859_1);
            } catch (IOException | RuntimeException e) {
                return "";
            }
        }
    }
}
