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

    private static final java.util.regex.Pattern ITEMS = java.util.regex.Pattern.compile("[\"']?items[\"']?\\s*:\\s*\\[");
    private static final java.util.regex.Pattern RISKS = java.util.regex.Pattern.compile("[\"']?risks[\"']?\\s*:\\s*\\[");
    private static final java.util.regex.Pattern SUMMARY = java.util.regex.Pattern.compile("[\"']?summary[\"']?\\s*+:\\s*+\"");
    /** The longest summary read from a cut-off plan. */
    static final int MAX_SUMMARY = 2_000;

    /**
     * What can be used of a plan the model's output limit stopped part-way, not yet made safe (see normalize): its
     * summary, the files it planned whole (an item cut off in the middle is left out) and its complete risks. A whole
     * answer is read as it is; an answer with nothing usable gives an empty plan.
     */
    static ChangePlan partial(String text) {
        if (text == null) {
            return new ChangePlan(null, List.of(), List.of());
        }
        int start = text.indexOf('{');
        int end = text.lastIndexOf('}');
        if (start >= 0 && end > start) {
            try {
                ChangePlan whole = LENIENT.readValue(text.substring(start, end + 1), ChangePlan.class);
                return new ChangePlan(whole.summary(), whole.items() == null ? List.of() : whole.items(),
                        whole.risks() == null ? List.of() : whole.risks());
            } catch (JacksonException e) {
                // cut off: read it piece by piece below
            }
        }
        java.util.regex.Matcher summary = SUMMARY.matcher(text);
        String summaryText = null;
        if (summary.find()) {
            // read by hand up to its closing quote (a regular expression recurses per character and overflows on a long one)
            int stop = summary.end();
            while (stop < text.length() && text.charAt(stop) != '"' && stop - summary.end() < MAX_SUMMARY) {
                stop += text.charAt(stop) == '\\' ? 2 : 1;
            }
            String raw = text.substring(summary.end(), Math.min(stop, text.length()));
            // the text ends in the middle of an escape (its backslash is the last character): the backslash goes; a summary
            // that closes, or stops at the cap (always after a whole escape), keeps all it has
            if (stop > text.length() && raw.endsWith("\\")) {
                raw = raw.substring(0, raw.length() - 1);
            }
            try {
                summaryText = LENIENT.readValue("\"" + raw + "\"", String.class);
            } catch (JacksonException e) {
                summaryText = raw;
            }
        }
        List<ChangePlan.Item> items = new ArrayList<>();
        java.util.regex.Matcher list = ITEMS.matcher(text);
        if (list.find()) {
            for (String element : wholeElements(text, list.end())) {
                try {
                    items.add(LENIENT.readValue(element, ChangePlan.Item.class));
                } catch (JacksonException e) {
                    // not an item: left out
                }
            }
        }
        List<String> risks = new ArrayList<>();
        java.util.regex.Matcher riskList = RISKS.matcher(text);
        if (riskList.find()) {
            for (String element : wholeElements(text, riskList.end())) {
                try {
                    risks.add(LENIENT.readValue(element, String.class));
                } catch (JacksonException e) {
                    // not a risk: left out
                }
            }
        }
        return new ChangePlan(summaryText, items, risks);
    }

    /**
     * The complete elements (objects or strings) of the JSON array that starts at {@code from}, up to where the array
     * ends or the text stops; an element the text stops inside is left out.
     */
    static List<String> wholeElements(String text, int from) {
        List<String> elements = new ArrayList<>();
        int depth = 0;
        int begin = -1;
        boolean inString = false;
        char quote = 0;
        for (int i = from; i < text.length(); i++) {
            char c = text.charAt(i);
            if (inString) {
                if (c == '\\') {
                    i++;
                } else if (c == quote) {
                    inString = false;
                    if (depth == 0 && begin >= 0) {
                        elements.add(text.substring(begin, i + 1));
                        begin = -1;
                    }
                }
                continue;
            }
            if (c == '"' || c == '\'') {
                inString = true;
                quote = c;
                if (depth == 0) {
                    begin = i;
                }
            } else if (c == '{' || c == '[') {
                if (depth == 0) {
                    begin = i;
                }
                depth++;
            } else if (c == '}' || c == ']') {
                if (depth == 0) {
                    // the array's own end
                    break;
                }
                depth--;
                if (depth == 0 && begin >= 0) {
                    elements.add(text.substring(begin, i + 1));
                    begin = -1;
                }
            }
        }
        return elements;
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
        // By layer, and within a layer what others use first: DTOs and models, then services, then REST resources
        ordered.sort(java.util.Comparator.comparingInt((ChangePlan.Item i) -> LAYER_ORDER.indexOf(i.layer()))
                .thenComparingInt(i -> dependencyRank(i.path())));
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

    /**
     * Where a file stands among those it depends on: data types (DTOs, models, entities, requests, responses) 0, data
     * access and adapters 1, services and other classes 2, REST resources and controllers 3; in a UI, resource bundles
     * 0, models 1, view models 2, views 3. Files the model writes later see the earlier ones' names.
     */
    static int dependencyRank(String path) {
        String lower = path.toLowerCase(Locale.ROOT);
        String name = lower.substring(lower.lastIndexOf('/') + 1);
        if (lower.endsWith(".java")) {
            if (name.matches(".*(dto|model|entity|request|response|vo|enum|constants)\\.java") || lower.contains("/dto/") || lower.contains("/model/")) {
                return 0;
            }
            if (name.matches(".*(dao|repository|assembler|adapter|mapper)\\.java")) {
                return 1;
            }
            if (name.matches(".*(resource|controller|endpoint|restservice)\\.java") || lower.contains("/rest/")) {
                return 3;
            }
            return 2;
        }
        if (lower.contains("/nls/") || lower.contains("/resources/")) {
            return 0;
        }
        if (name.equals("model.js")) {
            return 1;
        }
        return lower.endsWith(".html") ? 3 : 2;
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
