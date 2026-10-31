package com.obdx.factory.design;

import com.obdx.factory.common.NotFoundException;
import com.obdx.factory.importing.StorageProperties;
import com.obdx.factory.indexing.IndexingProperties;
import com.obdx.factory.profile.SourceTree;
import com.obdx.factory.workspace.Workspace;
import com.obdx.factory.workspace.WorkspaceRepository;
import org.springframework.stereotype.Service;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * The components a designer can drag onto a screen: the standard form components, and the components found in the
 * workspace's code, grouped as in the OBDX UX Extensibility Toolkit (framework components such as account-input and
 * page-section, the bank's business components, JET composite components, partials, and the JET components the code
 * uses). Found by their folders (a folder with name/name.html and name/name.js, a loader.js, or a component.json) and
 * by how screens use them (custom elements and Knockout component bindings in HTML).
 */
@Service
public class ComponentPalette {

    public static final String FORMS = "Forms";
    public static final String CONTROLS = "Controls";
    public static final String FRAMEWORK = "OBDX framework components";
    public static final String BUSINESS = "Business components";
    public static final String COMPOSITE = "JET composite components";
    public static final String PARTIALS = "Partials";
    public static final String JET = "JET components in this code";
    public static final String OTHER = "Other components used in this code";

    /**
     * One entry of the palette.
     *
     * @param type   the Screen Model component type it creates ("action" adds an action button)
     * @param tag    for type "component": the name the code uses for it (element or component name)
     * @param params parameter names, from its definition and its uses
     * @param uses   how often screens in the code use it
     * @param source where it is defined, or first used
     */
    public record Item(String id, String group, String label, String type, String tag, String module, List<String> params,
                       int uses, String source, String description) {
    }

    /** @param note what to do when the code has not been imported yet; null otherwise */
    public record Palette(List<Item> items, Long revision, String note) {
    }

    /** OBDX framework components named in the toolkit guide; recognized when used even if their code is elsewhere. */
    private static final Set<String> FRAMEWORK_NAMES = Set.of("account-input", "amount-input", "bank-look-up", "help",
            "help-panel", "nav-bar", "navigation-bar", "page-section", "row", "row-control", "modal-window", "search-box",
            "address-input", "virtual-accounts");
    /** JET elements that are layout or binding helpers rather than components to place. */
    private static final Set<String> JET_IGNORED = Set.of("oj-module", "oj-defer", "oj-form-layout", "oj-label",
            "oj-option", "oj-validation-group", "oj-label-value", "oj-highlight-text", "oj-c-form-layout");
    /** JET components that have a standard type of their own. */
    private static final Map<String, String> JET_TYPES = Map.ofEntries(
            Map.entry("oj-input-text", "text"), Map.entry("oj-c-input-text", "text"), Map.entry("oj-text-area", "textarea"),
            Map.entry("oj-c-text-area", "textarea"), Map.entry("oj-input-number", "number"),
            Map.entry("oj-c-input-number", "number"), Map.entry("oj-input-date", "date"), Map.entry("oj-c-input-date-text", "date"),
            Map.entry("oj-select-single", "select"), Map.entry("oj-c-select-single", "select"), Map.entry("oj-select-one", "select"),
            Map.entry("oj-combobox-one", "select"), Map.entry("oj-radioset", "radio"), Map.entry("oj-c-radioset", "radio"),
            Map.entry("oj-checkboxset", "checkbox"), Map.entry("oj-c-checkboxset", "checkbox"), Map.entry("oj-switch", "switch"),
            Map.entry("oj-c-switch", "switch"), Map.entry("oj-table", "table"), Map.entry("oj-c-table", "table"),
            Map.entry("oj-button", "action"), Map.entry("oj-c-button", "action"));
    /** Names a component's code reads from params that every OBDX component gets, not settings of this one. */
    private static final Set<String> COMMON_PARAMS = Set.of("baseModel", "rootModel", "dashboard", "rootData", "data",
            "self", "nls", "id", "params");

    private static final Pattern ELEMENT = Pattern.compile("<([a-z][a-z0-9]*(?:-[a-z0-9]+)+)\\b([^>]*)>");
    private static final Pattern PARAMS_ATTRIBUTE = Pattern.compile("\\bparams\\s*=\\s*\"([^\"]*)\"");
    private static final Pattern KO_COMPONENT = Pattern.compile(
            "component\\s*:\\s*\\{\\s*name\\s*:\\s*['\"]([a-z][\\w-]*)['\"](?:\\s*,\\s*params\\s*:\\s*\\{([^}]*)})?");
    private static final Pattern KO_COMPONENT_SHORT = Pattern.compile("component\\s*:\\s*['\"]([a-z][\\w-]*)['\"]");
    private static final Pattern KEY = Pattern.compile("([A-Za-z_$][\\w$]*)\\s*:");
    private static final Pattern PARAM_READ = Pattern.compile("\\b(?:params|rootParams)\\.([A-Za-z_$][\\w$]*)");
    private static final int MAX_PARAMS = 16;

    private final WorkspaceRepository workspaces;
    private final StorageProperties storage;
    private final IndexingProperties indexing;
    private final ObjectMapper json;
    /** The palette of each workspace, for the revision it was built from. */
    private final Map<UUID, Palette> cache = new ConcurrentHashMap<>();

    public ComponentPalette(WorkspaceRepository workspaces, StorageProperties storage, IndexingProperties indexing, ObjectMapper json) {
        this.workspaces = workspaces;
        this.storage = storage;
        this.indexing = indexing;
        this.json = json;
    }

    public Palette palette(UUID workspaceId) {
        Workspace workspace = workspaces.findById(workspaceId).orElseThrow(() -> new NotFoundException("Workspace not found: " + workspaceId));
        Path workingCopy = storage.workingCopy(workspaceId);
        if (!Files.isDirectory(workingCopy)) {
            return new Palette(standard(), null, "Import the workspace's code (Code page) to add its components to the palette.");
        }
        Palette cached = cache.get(workspaceId);
        if (cached != null && Objects.equals(cached.revision(), workspace.getIndexedRevision())) {
            return cached;
        }
        try {
            SourceTree tree = SourceTree.scan(workingCopy, indexing.excludeDirs(), indexing.maxFileSize().toBytes());
            List<Item> items = new ArrayList<>(standard());
            items.addAll(scan(tree));
            Palette palette = new Palette(List.copyOf(items), workspace.getIndexedRevision(), null);
            cache.put(workspaceId, palette);
            return palette;
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    /** The standard form components and the action button. */
    static List<Item> standard() {
        List<Item> items = new ArrayList<>();
        for (ComponentCatalog.ComponentType t : ComponentCatalog.TYPES) {
            if (!"component".equals(t.type())) {
                items.add(new Item("type:" + t.type(), FORMS, t.label(), t.type(), null, null, List.of(), 0, null, t.jetComponent()));
            }
        }
        items.add(new Item("action:button", CONTROLS, "Button", "action", null, null, List.of(), 0, null, "An action button of the screen"));
        return items;
    }

    /** The components defined and used in the code. */
    List<Item> scan(SourceTree tree) {
        Map<String, Found> found = new LinkedHashMap<>();
        Set<String> paths = new LinkedHashSet<>(tree.paths());

        // Definitions: component.json (JET composite components)
        for (String path : tree.named("component.json")) {
            String folder = parent(path);
            try {
                JsonNode node = json.readTree(tree.read(path));
                String name = node.path("name").asString(fileName(folder));
                if (name == null || name.isBlank()) {
                    continue;
                }
                Found f = found.computeIfAbsent(name, n -> new Found(n, path.contains("/framework/") ? FRAMEWORK : COMPOSITE));
                f.define(path, fileName(parent(folder)));
                node.path("properties").propertyNames().forEach(f.params::add);
                f.description = node.path("description").asString(null);
            } catch (JacksonException | IllegalArgumentException e) {
                // not a component manifest
            }
        }
        // Definitions: name/name.html with name/name.js, or a folder with a loader.js (OBDX components)
        for (String path : tree.withExtension("html")) {
            String folder = parent(path);
            String name = fileName(folder);
            boolean component = path.endsWith("/" + name + "/" + name + ".html")
                    && (paths.contains(folder + "/" + name + ".js") || paths.contains(folder + "/loader.js"));
            if (!component || name.isEmpty()) {
                continue;
            }
            Found f = found.computeIfAbsent(name, n -> new Found(n, path.contains("/framework/") ? FRAMEWORK : BUSINESS));
            if (f.source == null) {
                f.define(path, fileName(parent(folder)));
            }
            String script = paths.contains(folder + "/" + name + ".js") ? tree.read(folder + "/" + name + ".js") : "";
            Matcher reads = PARAM_READ.matcher(script);
            while (reads.find()) {
                f.params.add(reads.group(1));
            }
        }
        // Definitions: partials (reusable HTML templates)
        for (String path : tree.withExtension("html")) {
            if (path.contains("/partials/")) {
                String name = fileName(path).replaceFirst("\\.html$", "");
                found.computeIfAbsent(name, n -> new Found(n, PARTIALS)).define(path, fileName(parent(path)));
            }
        }
        // Uses: custom elements and Knockout component bindings
        Map<String, Integer> jetUses = new LinkedHashMap<>();
        Map<String, String> jetFirst = new LinkedHashMap<>();
        for (String path : tree.withExtension("html")) {
            String html = tree.read(path);
            Matcher element = ELEMENT.matcher(html);
            while (element.find()) {
                String tag = element.group(1);
                if (tag.startsWith("oj-")) {
                    if (!tag.startsWith("oj-bind") && !JET_IGNORED.contains(tag)) {
                        jetUses.merge(tag, 1, Integer::sum);
                        jetFirst.putIfAbsent(tag, path);
                    }
                    continue;
                }
                Found f = found.computeIfAbsent(tag, n -> new Found(n, FRAMEWORK_NAMES.contains(n) ? FRAMEWORK : OTHER));
                f.use(path);
                Matcher params = PARAMS_ATTRIBUTE.matcher(element.group(2));
                if (params.find()) {
                    f.addKeys(params.group(1));
                }
            }
            Matcher binding = KO_COMPONENT.matcher(html);
            while (binding.find()) {
                Found f = found.computeIfAbsent(binding.group(1), n -> new Found(n, FRAMEWORK_NAMES.contains(n) ? FRAMEWORK : OTHER));
                f.use(path);
                if (binding.group(2) != null) {
                    f.addKeys(binding.group(2));
                }
            }
            Matcher shortBinding = KO_COMPONENT_SHORT.matcher(html);
            while (shortBinding.find()) {
                found.computeIfAbsent(shortBinding.group(1), n -> new Found(n, FRAMEWORK_NAMES.contains(n) ? FRAMEWORK : OTHER)).use(path);
            }
        }

        List<Item> items = new ArrayList<>();
        for (Found f : found.values()) {
            List<String> params = f.params.stream().filter(p -> !COMMON_PARAMS.contains(p)).limit(MAX_PARAMS).toList();
            String description = f.description != null ? f.description
                    : f.uses > 0 ? "Used " + f.uses + (f.uses == 1 ? " time" : " times") + (f.source != null ? "; defined in " + f.source : ", for example in " + f.firstUse)
                    : "Defined in " + f.source + "; not used by other screens";
            items.add(new Item("component:" + f.name, f.group, ScreenModels.humanize(f.name), "component", f.name, f.module,
                    params, f.uses, f.source != null ? f.source : f.firstUse, description));
        }
        jetUses.forEach((tag, uses) -> {
            String type = JET_TYPES.getOrDefault(tag, "component");
            items.add(new Item("jet:" + tag, JET, ScreenModels.humanize(tag.replaceFirst("^oj-(c-)?", "")), type,
                    "component".equals(type) ? tag : null, null, List.of(), uses, jetFirst.get(tag),
                    "<" + tag + ">, used " + uses + (uses == 1 ? " time" : " times")));
        });
        items.sort(Comparator.comparing(Item::group).thenComparing(Comparator.comparingInt(Item::uses).reversed()).thenComparing(Item::label));
        return items;
    }

    private static String parent(String path) {
        int slash = path.lastIndexOf('/');
        return slash < 0 ? "" : path.substring(0, slash);
    }

    private static String fileName(String path) {
        return path.substring(path.lastIndexOf('/') + 1);
    }

    /** A component while the code is scanned. */
    private static final class Found {
        final String name;
        final String group;
        final Set<String> params = new LinkedHashSet<>();
        String source;
        String module;
        String firstUse;
        String description;
        int uses;

        Found(String name, String group) {
            this.name = name;
            this.group = group;
        }

        void define(String path, String module) {
            this.source = path;
            this.module = module.isEmpty() ? null : module;
        }

        void use(String path) {
            uses++;
            if (firstUse == null) {
                firstUse = path;
            }
        }

        void addKeys(String text) {
            Matcher key = KEY.matcher(text);
            while (key.find()) {
                params.add(key.group(1));
            }
        }
    }
}
