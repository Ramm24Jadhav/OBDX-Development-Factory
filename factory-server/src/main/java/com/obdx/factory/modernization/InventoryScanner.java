package com.obdx.factory.modernization;

import com.github.javaparser.JavaParser;
import com.github.javaparser.ParseResult;
import com.github.javaparser.ParserConfiguration;
import com.github.javaparser.ast.CompilationUnit;
import com.github.javaparser.ast.body.ClassOrInterfaceDeclaration;
import com.github.javaparser.ast.body.MethodDeclaration;
import com.github.javaparser.ast.expr.AnnotationExpr;
import com.github.javaparser.ast.expr.ArrayInitializerExpr;
import com.github.javaparser.ast.expr.Expression;
import com.github.javaparser.ast.expr.MemberValuePair;
import com.github.javaparser.ast.expr.NormalAnnotationExpr;
import com.github.javaparser.ast.expr.SingleMemberAnnotationExpr;
import com.github.javaparser.ast.expr.StringLiteralExpr;
import com.github.javaparser.ast.nodeTypes.NodeWithAnnotations;
import com.obdx.factory.profile.SourceTree;

import java.time.OffsetDateTime;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.Deque;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.TreeMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Scans a working copy into an {@link Inventory}. Rule-based and repeatable: the same code gives the same inventory,
 * without a model. The heuristics follow common Oracle JET and OBDX patterns; what they cannot see (for example
 * navigation built from variables) is missing rather than guessed.
 */
public final class InventoryScanner {

    private static final JavaParser JAVA = new JavaParser(new ParserConfiguration().setLanguageLevel(ParserConfiguration.LanguageLevel.JAVA_21));

    /** Form elements and the Screen Model type they correspond to. */
    private static final Map<String, String> FIELD_TAGS = Map.ofEntries(
            Map.entry("oj-input-text", "text"), Map.entry("oj-input-password", "text"), Map.entry("oj-text-area", "textarea"),
            Map.entry("oj-input-number", "number"), Map.entry("oj-input-date", "date"), Map.entry("oj-input-date-time", "date"),
            Map.entry("oj-select-single", "select"), Map.entry("oj-select-one", "select"), Map.entry("oj-combobox-one", "select"),
            Map.entry("oj-select-many", "checkbox"), Map.entry("oj-radioset", "radio"), Map.entry("oj-checkboxset", "checkbox"),
            Map.entry("oj-switch", "switch"), Map.entry("input", "text"), Map.entry("select", "select"), Map.entry("textarea", "textarea"));
    private static final Pattern TAG = Pattern.compile("<([a-z][a-z0-9-]*)\\b([^>]*)>", Pattern.CASE_INSENSITIVE);
    private static final Pattern LABEL = Pattern.compile("\\blabel-hint\\s*=\\s*\"([^\"]*)\"|\\bplaceholder\\s*=\\s*\"([^\"]*)\"");
    private static final Pattern VALUE = Pattern.compile("\\bvalue\\s*=\\s*\"\\s*(?:\\{\\{|\\[\\[)\\s*([^}\\]\"]+?)\\s*(?:}}|]])");
    private static final Pattern INPUT_TYPE = Pattern.compile("\\btype\\s*=\\s*\"(\\w+)\"");
    private static final Pattern BUTTON = Pattern.compile("<(oj-button|button)\\b", Pattern.CASE_INSENSITIVE);
    /** A string, or strings and variables joined with +, such as 'payments/transfers/' + id + '/approve'. */
    private static final String PATH_EXPRESSION = "(['\"`][^'\"`]*['\"`](?:\\s*\\+\\s*(?:['\"`][^'\"`]*['\"`]|[\\w.$]+(?:\\([^()]*\\))?))*)";
    private static final Pattern SERVICE_CALL = Pattern.compile(
            "\\b\\w*(?:[sS]ervice|[mM]odel)\\s*\\.\\s*(fetch|get|read|post|add|create|put|update|patch|delete|remove)\\s*\\(\\s*(?:\\{[^}]*?url\\s*:\\s*)?"
                    + PATH_EXPRESSION);
    private static final Pattern URL_PROPERTY = Pattern.compile("\\burl\\s*:\\s*" + PATH_EXPRESSION);
    private static final Pattern PATH_PART = Pattern.compile("['\"`]([^'\"`]*)['\"`]|([\\w.$]+(?:\\([^()]*\\))?)");
    private static final Pattern NAVIGATION = Pattern.compile(
            "\\bloadComponent\\s*\\(\\s*['\"]([\\w-]+)['\"]|\\.go\\s*\\(\\s*\\{?\\s*(?:path\\s*:\\s*)?['\"]([\\w/-]+)['\"]|\\bnavigate\\s*\\(\\s*['\"]([\\w/-]+)['\"]");
    private static final Pattern SEGMENT_CHECK = Pattern.compile("\\b(?:userSegment|segment)\\s*={2,3}\\s*['\"](\\w+)['\"]");
    private static final Pattern QUOTED = Pattern.compile("'([\\w-]+)'");
    private static final Set<String> GENERIC_FOLDERS = Set.of("views", "view", "viewmodels", "viewmodel", "js", "components", "component",
            "src", "ui", "channel", "web", "html", "app", "apps", "pages", "page", "screens", "modules", "scripts", "public", "main",
            "resources", "webapp", "jet", "client");
    private static final Set<String> SEGMENTS = Set.of("retail", "corporate", "admin", "administrator", "business", "sme", "wealth");
    private static final String PRODUCT_PACKAGE = "com.ofss";

    private InventoryScanner() {
    }

    /**
     * @param excludePrefix a folder to leave out (for example the new React Native app), or null
     */
    public static Inventory scan(SourceTree tree, Long revision, String excludePrefix) {
        Predicate in = path -> excludePrefix == null || !path.startsWith(excludePrefix + "/");
        List<String> notes = new ArrayList<>();

        List<Found> found = findScreens(tree, in);
        Map<String, Found> byBase = new HashMap<>();
        found.forEach(f -> byBase.putIfAbsent(f.base, f));

        // Screens with fields, actions, calls and navigation
        List<Inventory.Screen> screens = new ArrayList<>();
        Map<String, List<String>> callers = new TreeMap<>();
        Map<String, String> callMethods = new HashMap<>();
        Map<String, Set<String>> edges = new LinkedHashMap<>();
        for (Found f : found) {
            String view = tree.read(f.view);
            StringBuilder code = new StringBuilder();
            for (String file : f.code) {
                code.append(tree.read(file)).append('\n');
            }
            List<Inventory.Field> fields = fields(view);
            int actions = count(BUTTON, view);
            Map<String, String> calls = calls(code.toString());
            Set<String> opens = new LinkedHashSet<>();
            Matcher navigation = NAVIGATION.matcher(code);
            while (navigation.find()) {
                String target = navigation.group(1) != null ? navigation.group(1) : navigation.group(2) != null ? navigation.group(2) : navigation.group(3);
                String base = target.contains("/") ? target.substring(target.lastIndexOf('/') + 1) : target;
                Found to = byBase.get(base);
                if (to != null && !to.id.equals(f.id)) {
                    opens.add(to.id);
                }
            }
            int lines = (int) (view.lines().count() + code.toString().lines().count());
            int score = fields.size() + 2 * actions + 3 * calls.size() + 2 * opens.size() + lines / 50;
            List<String> callList = new ArrayList<>();
            calls.forEach((path, method) -> {
                callList.add(method + " " + path);
                callers.computeIfAbsent(path, k -> new ArrayList<>()).add(f.id);
                callMethods.merge(path, method, (a, b) -> a.equals("?") ? b : a);
            });
            edges.put(f.id, opens);
            List<String> files = new ArrayList<>(List.of(f.view));
            files.addAll(f.code);
            files.addAll(f.resources);
            screens.add(new Inventory.Screen(f.id, humanize(f.base), f.module, f.kind, files, lines, fields, actions, callList,
                    List.copyOf(opens), score, score < 12 ? "S" : score < 30 ? "M" : "L"));
        }
        if (screens.isEmpty()) {
            notes.add("No Oracle JET screens were found (views with view models, component folders, composite or VDOM components).");
        }

        // Backend REST services
        List<Inventory.Endpoint> endpoints = new ArrayList<>();
        int unparsed = 0;
        for (String path : tree.withExtension("java")) {
            if (!in.test(path)) {
                continue;
            }
            String source = tree.read(path);
            if (!source.contains("@Path") && !source.contains("Mapping")) {
                continue;
            }
            ParseResult<CompilationUnit> parsed = JAVA.parse(source);
            if (parsed.getResult().isEmpty()) {
                unparsed++;
                continue;
            }
            endpoints.addAll(endpoints(parsed.getResult().get(), path));
        }
        if (unparsed > 0) {
            notes.add(unparsed + " Java file(s) with REST annotations could not be parsed; their services are missing.");
        }

        // UI calls matched to backend services
        Map<String, List<String>> endpointUsers = new HashMap<>();
        List<Inventory.ServiceCall> serviceCalls = new ArrayList<>();
        for (Map.Entry<String, List<String>> call : callers.entrySet()) {
            String method = callMethods.get(call.getKey());
            Inventory.Endpoint match = endpoints.stream().filter(e -> matches(e.path(), call.getKey())
                    && (method.equals("?") || e.method().equals(method))).findFirst()
                    .orElse(endpoints.stream().filter(e -> matches(e.path(), call.getKey())).findFirst().orElse(null));
            String key = match == null ? null : match.method() + " " + match.path();
            if (key != null) {
                endpointUsers.computeIfAbsent(key, k -> new ArrayList<>()).addAll(call.getValue());
            }
            serviceCalls.add(new Inventory.ServiceCall(method, call.getKey(), List.copyOf(new LinkedHashSet<>(call.getValue())), key));
        }
        endpoints = endpoints.stream().map(e -> new Inventory.Endpoint(e.method(), e.path(), e.javaClass(), e.javaMethod(), e.file(),
                        e.product(), List.copyOf(new LinkedHashSet<>(endpointUsers.getOrDefault(e.method() + " " + e.path(), List.of())))))
                .sorted(Comparator.comparing(Inventory.Endpoint::path).thenComparing(Inventory.Endpoint::method)).toList();

        List<Inventory.Role> roles = roles(tree, in, screens);
        List<Inventory.Flow> flows = flows(screens, edges);

        // Modules and summary
        Map<String, List<Inventory.Screen>> byModule = new TreeMap<>();
        screens.forEach(s -> byModule.computeIfAbsent(s.module(), k -> new ArrayList<>()).add(s));
        List<Inventory.Module> modules = byModule.entrySet().stream().map(e -> new Inventory.Module(e.getKey(), e.getValue().size(),
                e.getValue().stream().mapToInt(s -> s.fields().size()).sum(), complexity(e.getValue()))).toList();
        screens.sort(Comparator.comparing(Inventory.Screen::module).thenComparing(Inventory.Screen::name));
        int withoutBackend = (int) serviceCalls.stream().filter(c -> c.endpoint() == null).count();
        if (withoutBackend > 0) {
            notes.add(withoutBackend + " service(s) the UI calls are not in this codebase; they are usually Oracle OBDX product services, "
                    + "which the new app calls as they are.");
        }
        Inventory.Summary summary = new Inventory.Summary(screens.size(), modules.size(), screens.stream().mapToInt(s -> s.fields().size()).sum(),
                endpoints.size(), serviceCalls.size(), withoutBackend, roles.size(), flows.size(), complexity(screens));
        return new Inventory(revision, OffsetDateTime.now(), summary, modules, screens, endpoints, serviceCalls, roles, flows, notes);
    }

    // --- screens ---

    private interface Predicate {
        boolean test(String path);
    }

    /** A screen found in the tree, before its files are read. */
    private record Found(String id, String base, String module, String kind, String view, List<String> code, List<String> resources) {
    }

    private static List<Found> findScreens(SourceTree tree, Predicate in) {
        Set<String> paths = new HashSet<>(tree.paths());
        List<Found> found = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        Map<String, String> bundles = new HashMap<>();
        for (String path : tree.paths(p -> p.endsWith(".js") && (p.contains("/nls/") || p.contains("/resources/")))) {
            bundles.putIfAbsent(fileBase(path), path);
        }
        for (String view : tree.withExtension("html")) {
            if (!in.test(view) || view.endsWith("index.html") || isTest(view)) {
                continue;
            }
            String folder = folder(view);
            String base = fileBase(view);
            List<String> code = new ArrayList<>();
            String kind;
            String name = base;
            if (base.equals("view") && paths.contains(join(folder, "component.json"))) {
                kind = "composite";
                name = folderName(folder);
                addIfPresent(paths, code, join(folder, "viewModel.js"), join(folder, "viewModel.ts"));
            } else if (folder.endsWith("/views") || folder.equals("views")) {
                kind = "view";
                String models = folder.substring(0, folder.length() - "views".length()) + "viewModels";
                addIfPresent(paths, code, join(models, base + ".js"), join(models, base + ".ts"));
            } else {
                kind = "component";
                addIfPresent(paths, code, join(folder, base + ".js"), join(folder, base + ".ts"));
            }
            if (code.isEmpty()) {
                continue;
            }
            addIfPresent(paths, code, join(folder, "model.js"), join(folder, "model.ts"));
            String id = view.substring(0, view.lastIndexOf('.'));
            if (!seen.add(id)) {
                continue;
            }
            List<String> resources = new ArrayList<>();
            Optional.ofNullable(bundles.get(name)).ifPresent(resources::add);
            found.add(new Found(id, name, module(view, name), kind, view, code, resources));
        }
        for (String tsx : tree.withExtension("tsx")) {
            if (!in.test(tsx) || isTest(tsx)) {
                continue;
            }
            String source = tree.read(tsx);
            if (source.contains("ojs/ojvcomponent")) {
                String base = fileBase(tsx).equals("index") ? folderName(folder(tsx)) : fileBase(tsx);
                String id = tsx.substring(0, tsx.lastIndexOf('.'));
                if (seen.add(id)) {
                    found.add(new Found(id, base, module(tsx, base), "vdom", tsx, List.of(), List.of()));
                }
            }
        }
        return found;
    }

    /** The nearest folder above the screen that names a module (not a generic folder or the screen's own folder). */
    static String module(String path, String screenName) {
        String[] parts = path.split("/");
        for (int i = 0; i < parts.length - 1; i++) {
            if (parts[i].equalsIgnoreCase("modules") && i + 1 < parts.length - 1 && !parts[i + 1].equals(screenName)) {
                return parts[i + 1];
            }
        }
        for (int i = parts.length - 2; i >= 0; i--) {
            String part = parts[i];
            if (!GENERIC_FOLDERS.contains(part.toLowerCase(Locale.ROOT)) && !part.equals(screenName)) {
                return part;
            }
        }
        return "general";
    }

    private static List<Inventory.Field> fields(String view) {
        List<Inventory.Field> fields = new ArrayList<>();
        Matcher tag = TAG.matcher(view.replaceAll("(?s)<!--.*?-->", ""));
        while (tag.find()) {
            String name = tag.group(1).toLowerCase(Locale.ROOT);
            String type = FIELD_TAGS.get(name);
            if (type == null) {
                continue;
            }
            String attributes = tag.group(2);
            if (name.equals("input")) {
                Matcher inputType = INPUT_TYPE.matcher(attributes);
                String kind = inputType.find() ? inputType.group(1).toLowerCase(Locale.ROOT) : "text";
                if (Set.of("hidden", "submit", "button", "reset", "image").contains(kind)) {
                    continue;
                }
                type = switch (kind) {
                    case "number" -> "number";
                    case "date", "datetime-local" -> "date";
                    case "checkbox" -> "checkbox";
                    case "radio" -> "radio";
                    default -> "text";
                };
            }
            Matcher label = LABEL.matcher(attributes);
            Matcher value = VALUE.matcher(attributes);
            fields.add(new Inventory.Field(type, label.find() ? (label.group(1) != null ? label.group(1) : label.group(2)) : null,
                    value.find() ? value.group(1) : null));
        }
        return fields;
    }

    /** Services called in view models and models: normalized path to HTTP method (? when unknown). */
    private static Map<String, String> calls(String code) {
        Map<String, String> calls = new TreeMap<>();
        Matcher call = SERVICE_CALL.matcher(code);
        while (call.find()) {
            String path = normalize(pathOf(call.group(2)));
            if (!path.isEmpty()) {
                calls.merge(path, method(call.group(1)), (a, b) -> a.equals("?") ? b : a);
            }
        }
        Matcher url = URL_PROPERTY.matcher(code);
        while (url.find()) {
            String path = normalize(pathOf(url.group(1)));
            if (!path.isEmpty() && !path.endsWith(".html") && !path.endsWith(".js")) {
                calls.putIfAbsent(path, "?");
            }
        }
        return calls;
    }

    /** The path of a joined expression: strings as they are, variables as {}. */
    static String pathOf(String expression) {
        StringBuilder path = new StringBuilder();
        Matcher part = PATH_PART.matcher(expression);
        while (part.find()) {
            path.append(part.group(1) != null ? part.group(1) : "{}");
        }
        return path.toString();
    }

    private static String method(String function) {
        return switch (function) {
            case "fetch", "get", "read" -> "GET";
            case "post", "add", "create" -> "POST";
            case "put", "update" -> "PUT";
            case "patch" -> "PATCH";
            default -> "DELETE";
        };
    }

    /** "/digx/v1/payments/transfers/{id}?x=1" and "payments/transfers/" + id give payments/transfers/{} ... (prefixes kept). */
    static String normalize(String raw) {
        String path = raw.strip();
        int query = path.indexOf('?');
        if (query >= 0) {
            path = path.substring(0, query);
        }
        if (path.matches("(?i)https?://.*")) {
            path = path.replaceFirst("(?i)https?://[^/]+", "");
        }
        List<String> segments = new ArrayList<>();
        for (String segment : path.split("/")) {
            if (segment.isBlank()) {
                continue;
            }
            segments.add(segment.matches("\\{.*}|\\$\\{.*}|:\\w+|\\d+") ? "{}" : segment);
        }
        return String.join("/", segments);
    }

    /**
     * Whether a backend path and a called path are the same service: equal segments with {} matching anything, aligned
     * at the end (either may have a prefix such as digx/v1). Calls that append an id ("transfers/" + id) are compared
     * without trailing {} segments too.
     */
    static boolean matches(String backend, String called) {
        List<String> b = segments(backend);
        List<String> c = segments(called);
        return aligned(b, c) || aligned(withoutTrailingIds(b), withoutTrailingIds(c));
    }

    private static List<String> segments(String path) {
        String normalized = normalize(path);
        return normalized.isEmpty() ? List.of() : List.of(normalized.split("/"));
    }

    private static List<String> withoutTrailingIds(List<String> segments) {
        int end = segments.size();
        while (end > 0 && segments.get(end - 1).equals("{}")) {
            end--;
        }
        return segments.subList(0, end);
    }

    private static boolean aligned(List<String> b, List<String> c) {
        if (b.isEmpty() || c.isEmpty()) {
            return false;
        }
        List<String> shorter = b.size() <= c.size() ? b : c;
        List<String> longer = b.size() <= c.size() ? c : b;
        int offset = longer.size() - shorter.size();
        for (int i = 0; i < shorter.size(); i++) {
            String x = shorter.get(i);
            String y = longer.get(offset + i);
            if (!x.equals("{}") && !y.equals("{}") && !x.equalsIgnoreCase(y)) {
                return false;
            }
        }
        return shorter.size() >= 2 || shorter.size() == longer.size();
    }

    // --- backend ---

    private static List<Inventory.Endpoint> endpoints(CompilationUnit unit, String file) {
        List<Inventory.Endpoint> endpoints = new ArrayList<>();
        String pkg = unit.getPackageDeclaration().map(p -> p.getNameAsString()).orElse("");
        for (ClassOrInterfaceDeclaration type : unit.findAll(ClassOrInterfaceDeclaration.class)) {
            String base = first(annotationValues(type, "Path", "RequestMapping")).orElse("");
            for (MethodDeclaration method : type.getMethods()) {
                String httpMethod = null;
                String path = null;
                for (AnnotationExpr annotation : method.getAnnotations()) {
                    String name = annotation.getNameAsString();
                    switch (name) {
                        case "GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS" -> httpMethod = name;
                        case "GetMapping", "PostMapping", "PutMapping", "DeleteMapping", "PatchMapping" -> {
                            httpMethod = name.substring(0, name.length() - "Mapping".length()).toUpperCase(Locale.ROOT);
                            path = first(values(annotation)).orElse("");
                        }
                        case "RequestMapping" -> {
                            path = first(values(annotation)).orElse("");
                            httpMethod = requestMethod(annotation);
                        }
                        default -> {
                        }
                    }
                }
                if (httpMethod == null) {
                    continue;
                }
                if (path == null) {
                    path = first(annotationValues(method, "Path")).orElse("");
                }
                String full = "/" + normalizeKeep(base) + (path.isBlank() ? "" : "/" + normalizeKeep(path));
                endpoints.add(new Inventory.Endpoint(httpMethod, full.replaceAll("/+", "/").replaceAll("(.)/$", "$1"), type.getNameAsString(),
                        method.getNameAsString(), file, pkg.startsWith(PRODUCT_PACKAGE), List.of()));
            }
        }
        return endpoints;
    }

    private static String normalizeKeep(String path) {
        return path.strip().replaceAll("^/+|/+$", "");
    }

    private static String requestMethod(AnnotationExpr annotation) {
        if (annotation instanceof NormalAnnotationExpr normal) {
            for (MemberValuePair pair : normal.getPairs()) {
                if (pair.getNameAsString().equals("method")) {
                    String text = pair.getValue().toString();
                    return text.substring(text.lastIndexOf('.') + 1).replaceAll("[^A-Z]", "");
                }
            }
        }
        return "?";
    }

    private static List<String> annotationValues(NodeWithAnnotations<?> node, String... names) {
        for (String name : names) {
            Optional<AnnotationExpr> annotation = node.getAnnotationByName(name);
            if (annotation.isPresent()) {
                return values(annotation.get());
            }
        }
        return List.of();
    }

    private static List<String> values(AnnotationExpr annotation) {
        List<String> values = new ArrayList<>();
        if (annotation instanceof SingleMemberAnnotationExpr single) {
            strings(single.getMemberValue(), values);
        } else if (annotation instanceof NormalAnnotationExpr normal) {
            normal.getPairs().stream().filter(p -> p.getNameAsString().equals("value") || p.getNameAsString().equals("path"))
                    .forEach(p -> strings(p.getValue(), values));
        }
        return values;
    }

    private static void strings(Expression expression, List<String> into) {
        if (expression instanceof StringLiteralExpr literal) {
            into.add(literal.getValue());
        } else if (expression instanceof ArrayInitializerExpr array) {
            array.getValues().forEach(v -> strings(v, into));
        }
    }

    private static Optional<String> first(List<String> values) {
        return values.isEmpty() ? Optional.empty() : Optional.of(values.getFirst());
    }

    // --- roles ---

    private static List<Inventory.Role> roles(SourceTree tree, Predicate in, List<Inventory.Screen> screens) {
        Map<String, Inventory.Role> roles = new TreeMap<>();
        for (String path : tree.withExtension("java")) {
            if (!in.test(path)) {
                continue;
            }
            String source = tree.read(path);
            if (!source.contains("@RolesAllowed") && !source.contains("@PreAuthorize") && !source.contains("@Secured")) {
                continue;
            }
            Matcher annotation = Pattern.compile("@(RolesAllowed|Secured)\\s*\\(([^)]*)\\)|@PreAuthorize\\s*\\(\\s*\"([^\"]*)\"").matcher(source);
            while (annotation.find()) {
                String text = annotation.group(2) != null ? annotation.group(2) : annotation.group(3);
                Matcher names = annotation.group(2) != null ? Pattern.compile("\"([\\w-]+)\"").matcher(text) : QUOTED.matcher(text);
                while (names.find()) {
                    add(roles, names.group(1).replaceFirst("^ROLE_", ""), "Java security annotation", path);
                }
            }
        }
        for (String path : tree.withExtension("js", "ts")) {
            if (!in.test(path) || path.contains("/libs/") || path.endsWith(".min.js")) {
                continue;
            }
            Matcher segment = SEGMENT_CHECK.matcher(tree.read(path));
            while (segment.find()) {
                add(roles, segment.group(1), "User segment check in the UI", path);
            }
        }
        for (Inventory.Screen screen : screens) {
            for (String part : screen.id().split("/")) {
                if (SEGMENTS.contains(part.toLowerCase(Locale.ROOT))) {
                    add(roles, part.toLowerCase(Locale.ROOT), "User segment folder in the UI", screen.files().getFirst());
                }
            }
        }
        return List.copyOf(roles.values());
    }

    private static void add(Map<String, Inventory.Role> roles, String name, String source, String evidence) {
        String key = name.toLowerCase(Locale.ROOT);
        Inventory.Role existing = roles.get(key);
        if (existing == null) {
            roles.put(key, new Inventory.Role(name, source, List.of(evidence)));
        } else if (existing.evidence().size() < 5 && !existing.evidence().contains(evidence)) {
            List<String> evidenceList = new ArrayList<>(existing.evidence());
            evidenceList.add(evidence);
            roles.put(key, new Inventory.Role(existing.name(), existing.source(), evidenceList));
        }
    }

    // --- flows ---

    /** Groups of screens connected by navigation; each in the order reached from screens nothing navigates to. */
    private static List<Inventory.Flow> flows(List<Inventory.Screen> screens, Map<String, Set<String>> edges) {
        Map<String, Inventory.Screen> byId = new HashMap<>();
        screens.forEach(s -> byId.put(s.id(), s));
        Map<String, Set<String>> undirected = new HashMap<>();
        Set<String> targets = new HashSet<>();
        edges.forEach((from, tos) -> tos.forEach(to -> {
            undirected.computeIfAbsent(from, k -> new HashSet<>()).add(to);
            undirected.computeIfAbsent(to, k -> new HashSet<>()).add(from);
            targets.add(to);
        }));
        List<Inventory.Flow> flows = new ArrayList<>();
        Set<String> done = new HashSet<>();
        for (Inventory.Screen screen : screens) {
            if (done.contains(screen.id()) || !undirected.containsKey(screen.id())) {
                continue;
            }
            // The connected group
            Set<String> group = new LinkedHashSet<>();
            Deque<String> queue = new ArrayDeque<>(List.of(screen.id()));
            while (!queue.isEmpty()) {
                String id = queue.poll();
                if (group.add(id)) {
                    queue.addAll(undirected.getOrDefault(id, Set.of()));
                }
            }
            done.addAll(group);
            // Order: breadth first along navigation, from screens nothing in the group opens
            List<String> starts = group.stream().filter(id -> !targets.contains(id)).sorted().toList();
            List<String> order = new ArrayList<>();
            Deque<String> next = new ArrayDeque<>(starts.isEmpty() ? List.of(group.iterator().next()) : starts);
            while (!next.isEmpty()) {
                String id = next.poll();
                if (!order.contains(id)) {
                    order.add(id);
                    edges.getOrDefault(id, Set.of()).stream().sorted().forEach(next::add);
                }
            }
            group.stream().filter(id -> !order.contains(id)).sorted().forEach(order::add);
            List<String> steps = new ArrayList<>();
            for (String from : order) {
                for (String to : edges.getOrDefault(from, Set.of())) {
                    steps.add(byId.get(from).name() + " → " + byId.get(to).name());
                }
            }
            flows.add(new Inventory.Flow(byId.get(order.getFirst()).name(), order, steps));
        }
        return flows;
    }

    // --- helpers ---

    private static Map<String, Integer> complexity(List<Inventory.Screen> screens) {
        Map<String, Integer> sizes = new LinkedHashMap<>();
        for (String size : List.of("S", "M", "L")) {
            sizes.put(size, (int) screens.stream().filter(s -> s.complexity().equals(size)).count());
        }
        return sizes;
    }

    private static int count(Pattern pattern, String text) {
        Matcher matcher = pattern.matcher(text);
        int n = 0;
        while (matcher.find()) {
            n++;
        }
        return n;
    }

    /** "fund-transfer" and "fundTransfer" give "Fund transfer". */
    static String humanize(String base) {
        String spaced = base.replaceAll("([a-z0-9])([A-Z])", "$1 $2").replaceAll("[-_.]+", " ").strip().toLowerCase(Locale.ROOT);
        return spaced.isEmpty() ? base : Character.toUpperCase(spaced.charAt(0)) + spaced.substring(1);
    }

    private static boolean isTest(String path) {
        return path.contains("/test/") || path.contains("/tests/") || path.contains("__tests__") || path.contains(".spec.") || path.contains(".test.");
    }

    private static void addIfPresent(Set<String> paths, List<String> into, String... candidates) {
        for (String candidate : candidates) {
            if (paths.contains(candidate)) {
                into.add(candidate);
                return;
            }
        }
    }

    private static String folder(String path) {
        return path.contains("/") ? path.substring(0, path.lastIndexOf('/')) : "";
    }

    private static String folderName(String folder) {
        return folder.contains("/") ? folder.substring(folder.lastIndexOf('/') + 1) : folder;
    }

    private static String fileBase(String path) {
        String name = path.substring(path.lastIndexOf('/') + 1);
        return name.contains(".") ? name.substring(0, name.indexOf('.')) : name;
    }

    private static String join(String folder, String name) {
        return folder.isEmpty() ? name : folder + "/" + name;
    }
}
