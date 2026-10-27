package com.obdx.factory.profile;

import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.TreeSet;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static com.obdx.factory.profile.ProfileFact.Confidence.HIGH;
import static com.obdx.factory.profile.ProfileFact.Confidence.LOW;
import static com.obdx.factory.profile.ProfileFact.Confidence.MEDIUM;
import static com.obdx.factory.profile.ProfileFact.Section.UI;

/**
 * Oracle JET version and architecture, module system, screen structure, resource bundles, styling and libraries.
 */
@Component
@Order(3)
public class UiDetector implements ProfileDetector {

    private static final Pattern PACKAGE_JSON_JET = Pattern.compile("\"@oracle/oraclejet\"\\s*:\\s*\"[~^]?([\\d.]+)\"");
    private static final Pattern COMPONENT_JET = Pattern.compile("\"jetVersion\"\\s*:\\s*\"[~^>=< ]*([\\d.]+)");
    private static final Pattern JET_PATH = Pattern.compile("(?:^|/|')oj/v?(\\d+\\.\\d+\\.\\d+)(?:/|')");
    private static final Pattern JET_BANNER = Pattern.compile("Oracle JET V(\\d+\\.\\d+\\.\\d+)");
    private static final Pattern PACKAGE_DEPENDENCY = Pattern.compile("\"((?:@[\\w.-]+/)?[\\w.-]+)\"\\s*:\\s*\"[~^]?[\\d]");
    private static final Pattern AMD_DEFINE = Pattern.compile("^\\s*define\\s*\\(", Pattern.MULTILINE);
    private static final Pattern ES_IMPORT = Pattern.compile("^\\s*import\\s+[\\w{*].*\\sfrom\\s+['\"]", Pattern.MULTILINE);

    @Override
    public List<ProfileFact> detect(SourceTree tree) {
        List<ProfileFact> facts = new ArrayList<>();
        facts.add(jetVersion(tree));
        facts.addAll(architecture(tree));
        facts.add(screens(tree));
        facts.add(resourceBundles(tree));
        facts.add(styling(tree));
        facts.add(libraries(tree));
        return facts;
    }

    private ProfileFact jetVersion(SourceTree tree) {
        Tally declared = new Tally();
        tree.named("package.json").forEach(path -> find(PACKAGE_JSON_JET, tree.read(path), path, declared));
        if (!declared.isEmpty()) {
            return ProfileFact.of("ui.jetVersion", UI, "Oracle JET version", "JET " + declared.top(1).getFirst(), HIGH, declared.evidence(3));
        }
        Tally inferred = new Tally();
        tree.named("component.json").forEach(path -> find(COMPONENT_JET, tree.read(path), path, inferred));
        for (String path : tree.paths()) {
            Matcher matcher = JET_PATH.matcher(path);
            if (matcher.find()) {
                inferred.add(matcher.group(1), path);
            }
        }
        tree.paths(path -> path.endsWith("main.js") || path.endsWith("index.html") || path.endsWith("path_mapping.json"))
                .forEach(path -> {
                    String content = tree.read(path);
                    find(JET_PATH, content, path, inferred);
                    find(JET_BANNER, content, path, inferred);
                });
        if (inferred.isEmpty()) {
            return ProfileFact.notFound("ui.jetVersion", UI, "Oracle JET version");
        }
        String top = inferred.top(1).getFirst();
        String value = "JET " + top + (inferred.top(3).size() > 1 ? " (also seen: " + String.join(", ", inferred.top(3).subList(1, inferred.top(3).size())) + ")" : "");
        return ProfileFact.of("ui.jetVersion", UI, "Oracle JET version", value, MEDIUM, inferred.evidence(3));
    }

    private List<ProfileFact> architecture(SourceTree tree) {
        Tally architecture = new Tally();
        Tally modules = new Tally();
        for (String path : tree.withExtension("js", "ts", "tsx")) {
            String content = tree.read(path);
            if (content.contains("ko.observable") || content.contains("'knockout'") || content.contains("\"knockout\"")) {
                architecture.add("Knockout MVVM", path);
            }
            if (path.endsWith(".tsx") || content.contains("ojs/ojvcomponent") || content.contains("from \"preact\"") || content.contains("from 'preact'")) {
                architecture.add("VDOM (Preact) components", path);
            }
            if (AMD_DEFINE.matcher(content).find()) {
                modules.add("RequireJS (AMD define)", path);
            } else if (ES_IMPORT.matcher(content).find()) {
                modules.add("ES modules (import/export)", path);
            }
        }
        if (!tree.withExtension("ts", "tsx").isEmpty()) {
            modules.add("TypeScript", tree.withExtension("ts", "tsx").getFirst());
        }
        return List.of(
                ProfileFact.of("ui.architecture", UI, "UI architecture", architecture.describe(2, "file"), architecture.confidenceByCount(10), architecture.evidence(2)),
                ProfileFact.of("ui.moduleSystem", UI, "JavaScript modules", modules.describe(3, "file"), modules.confidenceByCount(10), modules.evidence(3)));
    }

    /** Views and view models (the classic JET pattern) and JET composite components (component.json). */
    private ProfileFact screens(SourceTree tree) {
        Tally viewFolders = new Tally();
        for (String path : tree.paths(p -> p.endsWith(".html") && p.contains("/views/"))) {
            viewFolders.add(path.substring(0, path.lastIndexOf("/views/") + "/views".length()), path);
        }
        int viewModels = tree.paths(p -> p.contains("/viewModels/") && (p.endsWith(".js") || p.endsWith(".ts"))).size();
        List<String> components = tree.named("component.json");
        List<String> parts = new ArrayList<>();
        if (!viewFolders.isEmpty()) {
            parts.add(viewFolders.total() + " views and " + viewModels + " view models, mostly in " + viewFolders.top(1).getFirst() + "/");
        }
        if (!components.isEmpty()) {
            TreeSet<String> names = new TreeSet<>();
            components.forEach(path -> {
                String dir = path.contains("/") ? path.substring(0, path.lastIndexOf('/')) : "";
                names.add(dir.substring(dir.lastIndexOf('/') + 1));
            });
            parts.add(components.size() + " JET composite components (component.json), for example "
                    + String.join(", ", names.stream().limit(5).toList()));
        }
        List<String> evidence = new ArrayList<>(viewFolders.evidence(2));
        evidence.addAll(components.stream().limit(3).toList());
        int total = viewFolders.total() + components.size();
        return ProfileFact.of("ui.screenStructure", UI, "Screen structure", String.join("; ", parts),
                total >= 10 ? MEDIUM : LOW, evidence);
    }

    private ProfileFact resourceBundles(SourceTree tree) {
        List<String> bundles = tree.paths(p -> p.contains("/nls/") && (p.endsWith(".js") || p.endsWith(".json")));
        if (bundles.isEmpty()) {
            return ProfileFact.notFound("ui.resourceBundles", UI, "Labels (resource bundles)");
        }
        Tally folders = new Tally();
        TreeSet<String> locales = new TreeSet<>();
        for (String path : bundles) {
            int nls = path.indexOf("/nls/");
            folders.add(path.substring(0, nls + 4), path);
            String rest = path.substring(nls + 5);
            if (rest.contains("/")) {
                locales.add(rest.substring(0, rest.indexOf('/')));
            }
        }
        String value = bundles.size() + " bundle files, mostly in " + folders.top(1).getFirst() + "/"
                + (locales.isEmpty() ? "; no translations" : "; translations: " + String.join(", ", locales));
        return ProfileFact.of("ui.resourceBundles", UI, "Labels (resource bundles)", value, MEDIUM, folders.evidence(2));
    }

    private ProfileFact styling(SourceTree tree) {
        Tally styles = new Tally();
        tree.withExtension("scss").forEach(path -> styles.add("SCSS", path));
        tree.withExtension("less").forEach(path -> styles.add("LESS", path));
        tree.withExtension("css").forEach(path -> styles.add("CSS", path));
        Tally themes = new Tally();
        for (String path : tree.withExtension("css", "scss", "html")) {
            String lower = path.toLowerCase(Locale.ROOT);
            if (lower.contains("redwood")) {
                themes.add("Redwood", path);
            } else if (lower.contains("alta")) {
                themes.add("Alta", path);
            }
        }
        String value = styles.describe(3, "file") + (themes.isEmpty() ? "" : "; theme: " + String.join(", ", themes.top(2)));
        return ProfileFact.of("ui.styling", UI, "Styling", value, styles.confidenceByCount(10), styles.evidence(3));
    }

    private ProfileFact libraries(SourceTree tree) {
        TreeSet<String> libraries = new TreeSet<>();
        List<String> evidence = new ArrayList<>();
        for (String path : tree.named("package.json")) {
            String content = tree.read(path);
            int deps = content.indexOf("\"dependencies\"");
            if (deps < 0) {
                continue;
            }
            int end = content.indexOf('}', deps);
            Matcher matcher = PACKAGE_DEPENDENCY.matcher(content.substring(deps, end < 0 ? content.length() : end));
            while (matcher.find()) {
                if (!matcher.group(1).startsWith("@oracle/oraclejet")) {
                    libraries.add(matcher.group(1));
                }
            }
            evidence.add(path);
        }
        for (String path : tree.paths(p -> p.contains("/libs/"))) {
            String rest = path.substring(path.indexOf("/libs/") + 6);
            if (rest.contains("/") && !rest.startsWith("oj/") && !rest.startsWith("oj-")) {
                if (libraries.add(rest.substring(0, rest.indexOf('/'))) && evidence.size() < 5) {
                    evidence.add(path);
                }
            }
        }
        String value = libraries.isEmpty() ? null : String.join(", ", libraries.stream().limit(20).toList())
                + (libraries.size() > 20 ? " and " + (libraries.size() - 20) + " more" : "");
        return ProfileFact.of("ui.libraries", UI, "Third-party JavaScript libraries", value, MEDIUM, evidence);
    }

    private static void find(Pattern pattern, String content, String path, Tally tally) {
        Matcher matcher = pattern.matcher(content);
        while (matcher.find()) {
            tally.add(matcher.group(1), path);
        }
    }
}
