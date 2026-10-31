package com.obdx.factory.change;

import com.obdx.factory.common.BadRequestException;
import tools.jackson.core.JacksonException;
import tools.jackson.core.json.JsonReadFeature;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.json.JsonMapper;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.function.Predicate;

/**
 * Reads a change plan written by the model or edited by a person, and makes it safe to act on: paths stay inside
 * the repository, "modify" only for files that exist and "create" only for files that do not, known layers only.
 */
public final class PlanParser {

    static final Set<String> LAYERS = Set.of("data", "integration", "service", "ui", "test", "config");
    /** Order in which files are generated: what other files depend on comes first. */
    static final List<String> LAYER_ORDER = List.of("data", "integration", "service", "config", "ui", "test");

    private static final JsonMapper LENIENT = JsonMapper.builder()
            .enable(JsonReadFeature.ALLOW_JAVA_COMMENTS, JsonReadFeature.ALLOW_TRAILING_COMMA,
                    JsonReadFeature.ALLOW_SINGLE_QUOTES, JsonReadFeature.ALLOW_UNQUOTED_PROPERTY_NAMES)
            .disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
            .build();

    private PlanParser() {
    }

    public static ChangePlan parse(String text, Predicate<String> fileExists, int maxItems) {
        int start = text.indexOf('{');
        int end = text.lastIndexOf('}');
        if (start < 0 || end <= start) {
            throw new BadRequestException("No JSON object found in the plan");
        }
        ChangePlan raw;
        try {
            raw = LENIENT.readValue(text.substring(start, end + 1), ChangePlan.class);
        } catch (JacksonException e) {
            throw new BadRequestException("The plan is not valid JSON: " + e.getOriginalMessage());
        }
        return normalize(raw, fileExists, maxItems);
    }

    public static ChangePlan normalize(ChangePlan plan, Predicate<String> fileExists, int maxItems) {
        Map<String, ChangePlan.Item> items = new LinkedHashMap<>();
        for (ChangePlan.Item item : plan.items() == null ? List.<ChangePlan.Item>of() : plan.items()) {
            String path = cleanPath(item.path());
            if (path == null || items.containsKey(path)) {
                continue;
            }
            String action = fileExists.test(path) ? "modify" : "create";
            String layer = item.layer() == null ? guessLayer(path) : item.layer().toLowerCase(Locale.ROOT).trim();
            if (!LAYERS.contains(layer)) {
                layer = guessLayer(path);
            }
            List<String> basedOn = new ArrayList<>();
            for (String reference : item.basedOn() == null ? List.<String>of() : item.basedOn()) {
                String clean = cleanPath(reference);
                if (clean != null && fileExists.test(clean) && !clean.equals(path)) {
                    basedOn.add(clean);
                }
            }
            String purpose = blankToNull(item.purpose());
            if (isBuildFile(path) && (purpose == null || !purpose.startsWith(BUILD_FILE_MARK))) {
                purpose = BUILD_FILE_MARK + (purpose == null ? "" : " " + purpose);
            }
            items.put(path, new ChangePlan.Item(path, action, layer, purpose, basedOn, blankToNull(item.details())));
        }
        if (items.isEmpty()) {
            throw new BadRequestException("The plan has no files to change");
        }
        if (items.size() > maxItems) {
            throw new BadRequestException("The plan has " + items.size() + " files; at most " + maxItems + " are allowed in one change");
        }
        List<ChangePlan.Item> ordered = new ArrayList<>(items.values());
        ordered.sort((a, b) -> Integer.compare(LAYER_ORDER.indexOf(a.layer()), LAYER_ORDER.indexOf(b.layer())));
        List<String> risks = new ArrayList<>(plan.risks() == null ? List.of() : plan.risks().stream().filter(r -> r != null && !r.isBlank()).toList());
        List<String> buildFiles = ordered.stream().map(ChangePlan.Item::path).filter(PlanParser::isBuildFile).toList();
        risks.removeIf(r -> r.startsWith(BUILD_FILE_RISK));
        if (!buildFiles.isEmpty()) {
            // A requirement document could steer the model into a build step that runs code on the build agent
            risks.add(BUILD_FILE_RISK + String.join(", ", buildFiles) + ". The build runs them on the build agent: check every "
                    + "line before approving, or remove them from the plan.");
        }
        return new ChangePlan(blankToNull(plan.summary()), ordered, risks);
    }

    static final String BUILD_FILE_MARK = "[Build or CI file]";
    static final String BUILD_FILE_RISK = "The plan changes build or CI files: ";
    private static final java.util.Set<String> BUILD_FILES = java.util.Set.of("jenkinsfile", "pom.xml", "build.gradle", "build.gradle.kts",
            "settings.gradle", "settings.gradle.kts", "gradlew", "build.xml", "makefile", "dockerfile", "docker-compose.yml",
            "package.json", "package-lock.json", "gulpfile.js", "gruntfile.js", ".gitlab-ci.yml", "azure-pipelines.yml");

    /** Files the build or CI runs: build scripts, pipelines, shell scripts, container files, npm manifests. */
    static boolean isBuildFile(String path) {
        String lower = path.toLowerCase(Locale.ROOT);
        String name = lower.substring(lower.lastIndexOf('/') + 1);
        return BUILD_FILES.contains(name) || name.startsWith("dockerfile") || name.startsWith("jenkinsfile")
                || name.matches(".*\\.(sh|bat|cmd|ps1|bash)") || lower.startsWith(".github/") || lower.contains("/.github/");
    }

    /** A relative path with forward slashes that cannot leave the repository; null if unusable. */
    static String cleanPath(String path) {
        if (path == null) {
            return null;
        }
        String clean = path.trim().replace('\\', '/').replaceAll("/{2,}", "/");
        while (clean.startsWith("./") || clean.startsWith("/")) {
            clean = clean.startsWith("./") ? clean.substring(2) : clean.substring(1);
        }
        if (clean.isEmpty() || clean.endsWith("/") || clean.contains("..") || clean.contains(":") || clean.startsWith(".svn")
                || clean.contains("/.svn/")) {
            return null;
        }
        return clean;
    }

    static String guessLayer(String path) {
        String lower = path.toLowerCase(Locale.ROOT);
        if (lower.endsWith(".sql")) {
            return "data";
        }
        if (lower.contains("/test/") || lower.contains("test.") || lower.endsWith("spec.js")) {
            return "test";
        }
        if (lower.contains("adapter")) {
            return "integration";
        }
        if (lower.endsWith(".java")) {
            return "service";
        }
        if (lower.endsWith(".js") || lower.endsWith(".ts") || lower.endsWith(".html") || lower.endsWith(".css") || lower.endsWith(".scss")) {
            return "ui";
        }
        return "config";
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}
