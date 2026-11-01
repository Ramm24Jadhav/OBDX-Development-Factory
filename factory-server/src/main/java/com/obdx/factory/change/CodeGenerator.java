package com.obdx.factory.change;

import com.obdx.factory.model.ModelGateway;
import com.obdx.factory.model.ModelLimitReachedException;
import com.obdx.factory.model.PromptFit;
import com.obdx.factory.pack.JavaCompileChecks;
import com.obdx.factory.pack.LocalChecks;
import com.obdx.factory.pack.ModelReasoning;
import com.obdx.factory.pack.Recipe;
import com.obdx.factory.target.ScreenScaffolder;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/**
 * Writes one file of an approved plan: the complete new content, following the existing code and the Project
 * Profile. Each result gets the quick checks (syntax and version pack rules); a failed check goes back to the model
 * with the findings, a limited number of times.
 */
@Component
public class CodeGenerator {

    private static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(CodeGenerator.class);

    static final String SYSTEM = """
            You are a senior Oracle Banking Digital Experience (OBDX) developer writing one file of a planned change in
            a bank's existing codebase. Write the complete content of the file.

            Rules:
            - Follow the existing code and the example files exactly: package and folder layout, frameworks, naming,
              logging, error handling and error codes, resource bundles for labels, indentation and style.
            - When modifying a file, keep everything that the change does not need to touch exactly as it is.
            - Implement what the plan item says, consistent with the other files of the change (same class, field,
              service and label names).
            - Use only APIs and classes that exist in the code shown, or that this change creates. Import every class
              and annotation you use; a REST method whose @Path has {id} takes it with @PathParam("id").
            - Security, as a bank's review expects:
              - Take the customer or user from the session (as the codebase does), never from the request.
              - The caller and audit identity come from the authenticated user (SecurityContext or Principal, as the
                codebase does), never from a request header such as X-Caller-Id.
              - Check that the customer owns what every lookup by ID returns.
              - Validate amounts and inputs on the server, not only in the UI.
              - Return error codes or messages from the resource bundle, never exception text.
              - Log with placeholders, not +, and never log personal data.
              - Payment initiation goes through OBDX's authorization (2FA) step, as the codebase does it.
              - Encode IDs put in UI URLs (encodeURIComponent), and call the exact service paths the server code defines.
            - Traceability: where the code implements a requirement or business rule the spec numbers (FR-001, BR-003),
              say so in a short comment there. A test checks the acceptance criteria (AC-001) of what it tests, one
              test per criterion, named or commented with the criterion's ID.
            - Answer with only the file content: no explanations, no markdown code fences.
            """;

    public record Result(String content, FileChecks.Result check, int attempts) {
    }

    /** A design element with the designer's own markup, styles or script. */
    private static final Pattern CUSTOM_CODE = Pattern.compile("\"(html|css|script)\":\"");
    /** A design that is part of an OBDX transaction flow. */
    private static final Pattern STAGES = Pattern.compile("\"stage\":\"(initiate|review|confirm)\"");

    private final ModelGateway modelGateway;
    private final ChangeProperties properties;
    private final LocalChecks checks;

    public CodeGenerator(ModelGateway modelGateway, ChangeProperties properties, LocalChecks checks) {
        this.modelGateway = modelGateway;
        this.properties = properties;
        this.checks = checks;
    }

    /**
     * @param current  the file's current content, or null for a new file
     * @param examples existing files to follow (path to content)
     * @param earlier  files already written in this change (path to content)
     * @param note     an extra instruction from the reviewer, or null
     */
    public Result generate(ChangeContext context, ChangePlan plan, ChangePlan.Item item, String current,
                           Map<String, String> examples, Map<String, String> earlier, String note) {
        return generate(context, plan, item, current, current, examples, earlier, note);
    }

    /**
     * @param original the file before the change (null for a new file), which the checks compare with so that only
     *                 lines added by the change are reported; differs from current when an earlier result is fixed
     */
    public Result generate(ChangeContext context, ChangePlan plan, ChangePlan.Item item, String current, String original,
                           Map<String, String> examples, Map<String, String> earlier, String note) {
        return generate(context, plan, item, current, original, examples, earlier, note, null);
    }

    /**
     * @param scaffold for files of a React Native or React app: the starting point generated from the approved Screen
     *                 Model, or null. A screen must then keep every Screen Model id as a testID (parity), which is
     *                 checked like the other checks.
     */
    public Result generate(ChangeContext context, ChangePlan plan, ChangePlan.Item item, String current, String original,
                           Map<String, String> examples, Map<String, String> earlier, String note, ScreenScaffolder.Scaffold scaffold) {
        return generate(context, plan, item, current, original, examples, earlier, note, scaffold, null);
    }

    /**
     * @param partial the part of the file written before the model's limit stopped it (kept with a {@link #PARTIAL}
     *                check), which the model continues from instead of writing the whole file again; null to start
     *                afresh
     * @throws Partial when the model's limit stops the file after part of it was written
     */
    public Result generate(ChangeContext context, ChangePlan plan, ChangePlan.Item item, String current, String original,
                           Map<String, String> examples, Map<String, String> earlier, String note, ScreenScaffolder.Scaffold scaffold,
                           String partial) {
        Recipe.Match recipe = checks.recipeFor(context.checks(), item.path(), item.action(), item.layer()).orElse(null);
        String rules = checks.describeRules(context.checks(), item.path());
        String guidance = checks.targetGuidance(context.checks(), item.path());
        // A small per-minute token limit: the first prompt leaves room for the whole answer, so the file comes in one piece
        Fit fit = partial != null ? new Fit(0, 1) : fitFirstPrompt(item, current, (level, scale) -> prompt(context, plan, item, current,
                examples, earlier, note, rules, recipe, guidance, scaffold, level, scale));
        java.util.function.DoubleFunction<String> prompt = scale -> prompt(context, plan, item, current, examples, earlier, note, rules, recipe,
                guidance, scaffold, fit.trim(), scale);
        // A continuation needs far less: what the file is, its spec, the names of the files it uses, and its own end
        java.util.function.DoubleFunction<String> brief = scale -> continuationPrompt(context, item, current, earlier, note, rules, scale);
        Written written = write(item.path(), prompt, brief, partial, fit.scale());
        String content = written.content();
        FileChecks.Result check = withNotes(checked(context, item, original, content, scaffold, written.cutOff()), written.notes());
        int attempts = 1;
        // A file still cut off after its continuations is not fixed by asking with it again, which is longer still
        while (check.status() == FileChecks.Status.FAILED && !written.cutOff() && attempts <= properties.fixAttempts()) {
            log.info("Writing {} again (attempt {}): it did not pass its checks ({})", item.path(), attempts + 1,
                    check.message() == null ? "no message" : check.message().lines().findFirst().orElse(""));
            String fix = "\n\nYou wrote this content:\n" + content + "\n\nIt did not pass the checks:\n" + check.message()
                    + "\nWrite the complete corrected file.";
            written = write(item.path(), scale -> prompt.apply(scale) + fix, brief, null, written.scale());
            content = written.content();
            check = withNotes(checked(context, item, original, content, scaffold, written.cutOff()), written.notes());
            attempts++;
        }
        return new Result(content, check, attempts);
    }

    private FileChecks.Result checked(ChangeContext context, ChangePlan.Item item, String original, String content,
                                      ScreenScaffolder.Scaffold scaffold, boolean cutOff) {
        FileChecks.Result check = withParity(checks.check(context.checks(), item.path(), original, content), content, scaffold);
        if (!cutOff) {
            return check;
        }
        String cut = "The model stopped at its output limit, so the file is incomplete even after asking it to continue "
                + continuations() + " times. Use a model or plan with a higher output limit, then write it again, or finish it by hand.";
        return new FileChecks.Result(FileChecks.Status.FAILED, check.message() == null ? cut : cut + "\n" + check.message());
    }

    /** A check with what joining the answer's pieces changed: a passed file then shows it as a warning, for review. */
    static FileChecks.Result withNotes(FileChecks.Result check, List<String> notes) {
        if (notes.isEmpty()) {
            return check;
        }
        String text = String.join("\n", notes);
        FileChecks.Status status = check.status() == FileChecks.Status.PASSED || check.status() == FileChecks.Status.NOT_CHECKED
                ? FileChecks.Status.WARNING : check.status();
        return new FileChecks.Result(status, check.message() == null ? text : check.message() + "\n" + text);
    }

    /** A screen of a React Native or React app must keep every field and action of the approved Screen Model. */
    static FileChecks.Result withParity(FileChecks.Result check, String content, ScreenScaffolder.Scaffold scaffold) {
        List<String> missing = parityGaps(content, scaffold);
        if (missing.isEmpty()) {
            return check;
        }
        String parity = "Parity with the approved Screen Model: no testID for " + String.join(", ", missing)
                + ". Keep every field and action of the design, each with its Screen Model id as testID.";
        return new FileChecks.Result(FileChecks.Status.FAILED, check.message() == null ? parity : check.message() + "\n" + parity);
    }

    /** Screen Model ids the screen does not have as testID. */
    static List<String> parityGaps(String content, ScreenScaffolder.Scaffold scaffold) {
        if (scaffold == null || scaffold.expectedIds().isEmpty() || content == null) {
            return List.of();
        }
        return scaffold.expectedIds().stream()
                .filter(id -> !Pattern.compile("testID=(\"" + Pattern.quote(id) + "\"|\\{\\s*['\"`]" + Pattern.quote(id) + "['\"`]\\s*})")
                        .matcher(content).find())
                .toList();
    }

    private static String prompt(ChangeContext context, ChangePlan plan, ChangePlan.Item item, String current,
                                 Map<String, String> examples, Map<String, String> earlier, String note, String rules,
                                 Recipe.Match recipe, String targetGuidance, ScreenScaffolder.Scaffold scaffold, int trim, double scale) {
        StringBuilder user = new StringBuilder();
        user.append("File to write: ").append(item.path()).append(" (").append(item.action()).append(", ").append(item.layer()).append(")\n");
        user.append("Purpose: ").append(nullToDash(item.purpose())).append('\n');
        user.append("Details: ").append(nullToDash(item.details())).append('\n');
        if (note != null && !note.isBlank()) {
            user.append("Reviewer's instruction: ").append(note).append('\n');
        }
        user.append("\nThe whole change (").append(nullToDash(plan.summary())).append("):\n");
        user.append(plan.items().stream().map(i -> "- " + i.action() + " " + i.path() + ": " + nullToDash(i.purpose()))
                .collect(Collectors.joining("\n"))).append("\n\n");
        user.append("Requirement specification (approved):\n").append(ChangeContext.cap(context.specJson(), PromptFit.size(8000, scale))).append("\n\n");
        if (!context.knowledge().isBlank() && trim < TRIM_KNOWLEDGE) {
            user.append("OBDX knowledge (Oracle manuals and approved notes for this OBDX version; follow it where it applies):\n")
                    .append(ChangeContext.cap(context.knowledge(), PromptFit.size(4000, scale))).append("\n\n");
        }
        if (context.designsJson() != null && ("ui".equals(item.layer()) || "test".equals(item.layer())) && trim < TRIM_DESIGNS) {
            user.append("Screen designs (approved):\n").append(ChangeContext.cap(context.designsJson(), PromptFit.size(6000, scale))).append("\n\n");
            String designs = context.designsJson();
            if (designs.contains("\"dataSource\":{")) {
                user.append("Elements with a \"dataSource\" load their values from that API (in the screen's model, as the existing")
                        .append(" components call services), take the list at \"path\" of the response, and use \"valueField\" and")
                        .append(" \"labelField\" for each option; they are not fixed lists.\n\n");
            }
            if (designs.contains("\"visibleWhen\":{") || designs.contains("\"requiredWhen\":{")) {
                user.append("\"visibleWhen\" shows an element only while the other element (by id) meets the condition, and")
                        .append(" \"requiredWhen\" makes it mandatory only then: implement both with the view model's observables and")
                        .append(" the template's conditional rendering and validators, as the existing code does.\n\n");
            }
            if (STAGES.matcher(designs).find()) {
                user.append("Screens with \"stage\" initiate, review and confirm are one OBDX transaction flow: implement them the way")
                        .append(" this codebase builds its flows (for example one component with initiate, review and confirm states,")
                        .append(" or a train), with the initiate screen's data carried to review and the transaction call on confirm.\n\n");
            }
            if (designs.contains("\"channels\":[\"")) {
                user.append("Build each screen only for the \"channels\" it lists (desktop, tablet, mobile-web, mobile-app) and make it")
                        .append(" responsive across them.\n\n");
            }
            if (CUSTOM_CODE.matcher(designs).find()) {
                user.append("Components with \"html\", \"css\" or \"script\" carry the designer's own code: use the html as that element's")
                        .append(" markup in the template (with the code's bindings and resource bundle labels), the css (\"&\" is the element)")
                        .append(" in the component's styles, and the script's behaviour in the view model, following the existing code.\n\n");
            }
            if (context.designsJson().contains("\"type\":\"component\"")) {
                user.append("Components of type \"component\" are existing components of the bank's code: use the component named in")
                        .append(" \"component\" exactly as the code uses it elsewhere, with the \"params\" given, instead of building it again.\n\n");
            }
        }
        user.append("Project profile:\n").append(context.profile().isBlank() ? "(not available)" : context.profile()).append("\n\n");
        if (!targetGuidance.isEmpty()) {
            user.append("How the new app is built (target pack):\n").append(targetGuidance).append("\n\n");
        }
        if (recipe != null) {
            user.append(targetGuidance.isEmpty() ? "How this is built in OBDX (version pack recipe \"" : "How this is built (target pack recipe \"")
                    .append(recipe.recipe().title()).append("\", ")
                    .append(recipe.part().name()).append("):\n").append(recipe.recipe().guidance()).append("\n\n");
        }
        if (!rules.isEmpty()) {
            user.append("Rules for this file (they are checked):\n").append(rules).append("\n\n");
        }
        if (current != null) {
            user.append("Current content of ").append(item.path()).append(":\n").append(current).append("\n\n");
        }
        for (Map.Entry<String, String> example : trim < TRIM_EXAMPLES ? examples.entrySet() : Map.<String, String>of().entrySet()) {
            user.append("Example file to follow, ").append(example.getKey()).append(":\n")
                    .append(ChangeContext.cap(example.getValue(), PromptFit.size(12000, scale))).append("\n\n");
        }
        Map<String, String> related = trim < TRIM_CONTEXT ? related(item, earlier, scale) : named(item, related(item, earlier, scale));
        if (!related.isEmpty()) {
            user.append("Files already written in this change that this file uses (Java as signatures; use these names exactly):\n");
            related.forEach((path, outline) -> user.append("--- ").append(path).append('\n').append(outline).append('\n'));
        }
        if (scaffold != null) {
            user.append(scaffold.kind().equals("texts")
                            ? "The texts file with this change's screens added (keep all existing texts; adjust only what the change needs):\n"
                            : "Starting point generated from the approved Screen Model (keep its testIDs, text keys and structure; complete "
                            + "what its comments ask, such as loading options and calling the API):\n")
                    .append(scaffold.content()).append('\n');
        } else if (current == null && recipe != null && recipe.part().content() != null) {
            user.append("Template to start from (replace every <<...>> placeholder; where the example files differ, follow the examples):\n")
                    .append(recipe.part().content()).append('\n');
        }
        user.append("\nWrite the complete content of ").append(item.path()).append('.');
        return user.toString();
    }

    /** What the first prompt leaves out, from least to most: examples, then knowledge, then designs, then context files. */
    static final int TRIM_EXAMPLES = 1;
    static final int TRIM_KNOWLEDGE = 2;
    static final int TRIM_DESIGNS = 3;
    static final int TRIM_CONTEXT = 4;
    /** Below this many tokens a minute (prompt and answer together), the first prompt is fitted to leave room for the answer. */
    static final int SMALL_TOTAL = 12_000;

    /** How far the first prompt is trimmed (0: not at all), and the scale it starts at. */
    record Fit(int trim, double scale) {
    }

    /**
     * On a server with a small per-minute token limit, the first prompt made small enough that prompt and the expected
     * answer fit in 90% of it, so the file is written in one call rather than in pieces: examples are left out first, then
     * the OBDX knowledge, the designs, and the change's files other than those the plan item names; if that is still too
     * much, the rest of the prompt is scaled down.
     */
    private Fit fitFirstPrompt(ChangePlan.Item item, String current, java.util.function.BiFunction<Integer, Double, String> prompt) {
        int total = modelGateway.tokensPerMinute();
        if (total <= 0 || total >= SMALL_TOTAL) {
            return new Fit(0, 1);
        }
        double perToken = modelGateway.charsPerToken();
        int expected = expectedAnswerTokens(item, current, perToken);
        double room = Math.max(total * 0.9 - expected, total * 0.25);
        int trim = 0;
        double tokens = (SYSTEM.length() + prompt.apply(trim, 1.0).length()) / perToken;
        while (tokens > room && trim < TRIM_CONTEXT) {
            trim++;
            tokens = (SYSTEM.length() + prompt.apply(trim, 1.0).length()) / perToken;
        }
        double scale = tokens > room ? Math.max(PromptFit.MIN_SCALE, room / tokens) : 1;
        if (trim > 0 || scale < 1) {
            log.info("Fitted the prompt of {} to leave about {} tokens for its answer within {} tokens a minute: {}{}", item.path(), expected,
                    total, trim == 0 ? "nothing left out" : "left out " + String.join(", ", List.of("examples", "knowledge", "designs",
                            "other context files").subList(0, trim)), scale < 1 ? ", context at " + Math.round(scale * 100) + "%" : "");
        }
        return new Fit(trim, scale);
    }

    /** The answer a file is expected to take: the current file for a change to it, else a typical size for its layer. */
    static int expectedAnswerTokens(ChangePlan.Item item, String current, double charsPerToken) {
        if (current != null) {
            return (int) (current.length() / charsPerToken);
        }
        String layer = item.layer() == null ? "" : item.layer().toLowerCase(java.util.Locale.ROOT);
        return switch (layer) {
            case "test" -> 3000;
            case "ui" -> 2500;
            case "service" -> 2000;
            case "data", "database", "sql" -> 1000;
            case "config" -> 700;
            default -> 1500;
        };
    }

    /** The change's files the plan item names (by file name), out of those related to it. */
    private static Map<String, String> named(ChangePlan.Item item, Map<String, String> related) {
        String said = (nullToDash(item.purpose()) + " " + nullToDash(item.details())).toLowerCase(java.util.Locale.ROOT);
        Map<String, String> named = new java.util.LinkedHashMap<>();
        related.forEach((path, outline) -> {
            if (said.contains(baseName(path).toLowerCase(java.util.Locale.ROOT))) {
                named.put(path, outline);
            }
        });
        return named;
    }

    /**
     * The prompt a continuation is built on: the file's path, purpose and rules, an excerpt of the spec, the file's
     * current content when it is modified, and the signatures of the change's files it uses; no examples, designs,
     * knowledge or template, which the first piece already followed. The file's end is added by write().
     */
    static String continuationPrompt(ChangeContext context, ChangePlan.Item item, String current, Map<String, String> earlier, String note,
                                     String rules, double scale) {
        StringBuilder user = new StringBuilder();
        user.append("File being written: ").append(item.path()).append(" (").append(item.action()).append(", ").append(item.layer()).append(")\n");
        user.append("Purpose: ").append(nullToDash(item.purpose())).append('\n');
        user.append("Details: ").append(nullToDash(item.details())).append('\n');
        if (note != null && !note.isBlank()) {
            user.append("Reviewer's instruction: ").append(note).append('\n');
        }
        user.append("\nRequirement specification (excerpt):\n").append(ChangeContext.cap(context.specJson(), PromptFit.size(2500, scale))).append("\n\n");
        if (rules != null && !rules.isEmpty()) {
            user.append("Rules for this file (they are checked):\n").append(rules).append("\n\n");
        }
        if (current != null) {
            user.append("Current content of ").append(item.path()).append(" (keep what the change does not touch):\n").append(current).append("\n\n");
        }
        Map<String, String> related = related(item, earlier, scale * 0.5);
        if (!related.isEmpty()) {
            user.append("Files already written in this change that this file uses (Java as signatures; use these names exactly):\n");
            related.forEach((path, outline) -> user.append("--- ").append(path).append('\n').append(outline).append('\n'));
        }
        return user.toString();
    }

    /**
     * The files already written that this file most likely uses, within a character budget that shrinks with the
     * prompt's scale: those its plan item names (in any language), those that share its name's stem (FundTransferService
     * for FundTransferResource) or its package; for a screen's script, the REST resources it calls (their paths and
     * method signatures); for a REST resource, the resource bundle keys of the change. Java files are given as
     * signatures (fields, method signatures, nested types, no bodies), others as their first lines; a model with a small
     * input limit then still sees every name it must use.
     */
    static Map<String, String> related(ChangePlan.Item item, Map<String, String> earlier, double scale) {
        String self = baseName(item.path());
        String said = (nullToDash(item.purpose()) + " " + nullToDash(item.details())).toLowerCase(java.util.Locale.ROOT);
        String folder = item.path().contains("/") ? item.path().substring(0, item.path().lastIndexOf('/')) : "";
        boolean isJava = item.path().endsWith(".java");
        boolean script = item.path().matches(".*\\.(js|ts|tsx|jsx)");
        boolean resource = isJava && PlanReview.isResource(item.path());
        Map<String, Integer> score = new java.util.LinkedHashMap<>();
        Map<String, String> outline = new java.util.LinkedHashMap<>();
        for (String path : earlier.keySet()) {
            String name = baseName(path);
            boolean named = said.contains(name.toLowerCase(java.util.Locale.ROOT)) || said.contains(path.toLowerCase(java.util.Locale.ROOT));
            boolean otherJava = path.endsWith(".java");
            if (otherJava != isJava && !named) {
                if (script && otherJava && PlanReview.isResource(path)) {
                    // The services a screen calls: their exact paths and methods
                    score.put(path, 2);
                    outline.put(path, JavaOutline.rest(earlier.get(path)));
                } else if (resource && bundle(path)) {
                    // The labels and messages a resource may return, by key
                    score.put(path, 2);
                    outline.put(path, "Keys: " + String.join(", ", bundleKeys(earlier.get(path))));
                }
                continue;
            }
            int s = 0;
            if (named) {
                s += 5;
            }
            if (commonPrefix(self, name) >= Math.min(6, Math.min(self.length(), name.length()))) {
                s += 2;
            }
            String otherFolder = path.contains("/") ? path.substring(0, path.lastIndexOf('/')) : "";
            if (otherFolder.equals(folder) || (isJava && (otherFolder.startsWith(folder) || folder.startsWith(otherFolder)))) {
                s += 1;
            }
            if (s > 0) {
                score.put(path, s);
            }
        }
        Map<String, String> related = new java.util.LinkedHashMap<>();
        int budget = PromptFit.size(12000, scale);
        for (Map.Entry<String, Integer> e : score.entrySet().stream().sorted(Map.Entry.<String, Integer>comparingByValue().reversed()).toList()) {
            if (budget <= 0) {
                break;
            }
            String content = earlier.get(e.getKey());
            String text = outline.containsKey(e.getKey()) ? outline.get(e.getKey())
                    : e.getKey().endsWith(".java") ? JavaOutline.of(content) : head(content, Math.max(6, (int) (20 * scale)));
            String capped = ChangeContext.cap(text, Math.min(budget, PromptFit.size(2500, scale)));
            related.put(e.getKey(), capped);
            budget -= capped.length();
        }
        return related;
    }

    /** A resource bundle: an nls file or a .properties file. */
    private static boolean bundle(String path) {
        String lower = path.toLowerCase(java.util.Locale.ROOT);
        return lower.contains("/nls/") || lower.endsWith(".properties");
    }

    private static final Pattern BUNDLE_KEY = Pattern.compile("(?m)(?:^|[{,])\\s*[\"']?([A-Za-z_][\\w.-]*)[\"']?\\s*[:=]");

    /** The keys a bundle defines (label: 'Amount', amount.label=Amount), at most 100. */
    static List<String> bundleKeys(String content) {
        java.util.Set<String> keys = new java.util.LinkedHashSet<>();
        Matcher m = BUNDLE_KEY.matcher(content == null ? "" : content);
        while (m.find() && keys.size() < 100) {
            if (!m.group(1).equals("root")) {
                keys.add(m.group(1));
            }
        }
        return List.copyOf(keys);
    }

    private static String baseName(String path) {
        String name = path.substring(path.lastIndexOf('/') + 1);
        return name.contains(".") ? name.substring(0, name.indexOf('.')) : name;
    }

    private static int commonPrefix(String a, String b) {
        int n = 0;
        while (n < a.length() && n < b.length() && a.charAt(n) == b.charAt(n)) {
            n++;
        }
        return n;
    }

    /** How many times a file cut off at the model's output limit is continued. */
    static final int MAX_CONTINUATIONS = 6;

    /** On Ollama each continuation takes minutes on the factory's own hardware: fewer of them. */
    static final int LOCAL_CONTINUATIONS = 2;

    private int continuations() {
        return modelGateway.local() ? LOCAL_CONTINUATIONS : MAX_CONTINUATIONS;
    }

    /** A file as written, whether it is still cut off at the model's output limit, and the scale its prompt needed. */
    record Written(String content, boolean cutOff, double scale, List<String> notes) {
    }

    /** How the check of a file the model's limit stopped part-way starts: the file is kept, but counts as not written. */
    public static final String PARTIAL = "Cut off: the model's limit stopped this file part-way.";

    /** The model's limit stopped a file after part of it was written: that part, to keep and continue from later. */
    public static final class Partial extends ModelLimitReachedException {
        private final String content;

        Partial(ModelLimitReachedException limit, String content) {
            super(limit.getMessage(), limit.daily(), limit.retryIn(), limit);
            this.content = content;
        }

        public String content() {
            return content;
        }
    }

    /** The most of the file's end a continuation prompt carries. */
    static final int TAIL = 3000;

    /**
     * Asks for the file and, while the answer stops at the model's output limit (a server that writes little per
     * request), asks the model to go on where it stopped and joins the pieces, so a large file is still written whole.
     * <ul>
     * <li>A continuation is a short prompt (the file, its spec excerpt and the signatures it uses, at the scale the first
     * piece needed or smaller) plus the file's last 3000 characters, cut back to its last complete line; the model
     * repeats that line first, and the piece is joined on it.</li>
     * <li>Each piece is read for the model's reasoning in comments ("// Wait, ..."): a piece that is mostly reasoning is
     * asked for again once, more strictly; otherwise it is cut back to the line before the reasoning.</li>
     * <li>The joined file must still parse (Java, JavaScript): a seam that lost text fails it, so it is written again.</li>
     * </ul>
     *
     * @param partial what was written of the file before (continued from at once), or null
     * @throws JoinFailed when the joined pieces do not parse
     */
    private Written write(String path, java.util.function.DoubleFunction<String> prompt, java.util.function.DoubleFunction<String> brief,
                          String partial, double start) {
        double scale = start;
        String sofar;
        if (partial == null) {
            PromptFit.Fitted first = PromptFit.chatFrom(modelGateway, SYSTEM, prompt, scale);
            scale = first.scale();
            ModelGateway.ChatResult reply = first.result();
            if (reply.reply() == null || reply.reply().isBlank()) {
                log.info("The model's answer for {} was empty", path);
            }
            if (!reply.cutOff()) {
                return new Written(clean(reply.reply()), false, scale, List.of());
            }
            sofar = withoutReasoning(path, withoutFences(reply.reply()));
        } else {
            sofar = withoutReasoning(path, partial);
        }
        boolean cut = true;
        boolean warned = false;
        boolean strict = false;
        boolean repeatAsked = false;
        boolean joined = false;
        int continuations = continuations();
        for (int i = 0; cut && i < continuations; i++) {
            // A fresh line: the cut-off end of a line is left out, so the model writes that line whole
            sofar = completeLines(sofar);
            if (!sofar.isBlank()) {
                // and no blank lines after it, which the model would write again after repeating the last line
                sofar = sofar.stripTrailing() + "\n";
            }
            String last = lastLine(sofar);
            String end = sofar.length() > TAIL ? sofar.substring(sofar.length() - TAIL) : sofar;
            String more = "\n\nYou are writing " + path + " and your answer stopped at your output limit. The file so far ends with:\n"
                    + end + "\n\nContinue the file. Begin your answer by repeating its last line exactly as it is:\n" + last
                    + "\nthen write the rest of the file after it. Write only the file's code and its normal comments, without code fences."
                    + (warned ? " Do NOT start the file again: no package line, no imports, no class header; only what comes after the "
                    + "last line above." : "")
                    + (strict ? " Do not write notes to yourself or remarks about the prompt (no \"Wait\", \"Let's check\" or \"I already "
                    + "wrote\"); if a line is already written, simply go on after it." : "")
                    + (repeatAsked ? " Your answer MUST begin with that exact line, repeated in full, so the two parts join." : "")
                    + writtenSoFar(path, sofar);
            PromptFit.Fitted fitted;
            try {
                log.info("Continuing {} (continuation {} of at most {}): {}", path, i + 1, continuations,
                        strict ? "the last piece was the model's reasoning" : warned ? "the last piece started the file again"
                        : repeatAsked ? "the last piece did not begin with the file's last line" : "the answer stopped at the output limit");
                fitted = PromptFit.chatFrom(modelGateway, SYSTEM, s -> brief.apply(s) + more, scale);
            } catch (ModelLimitReachedException e) {
                if (sofar.isBlank()) {
                    throw e;
                }
                // Keep what was written (whole lines, no reasoning): Continue goes on from it instead of paying for the whole file again
                throw new Partial(e, sofar.strip() + "\n");
            }
            scale = fitted.scale();
            ModelGateway.ChatResult next = fitted.result();
            if (next.reply() == null || next.reply().isBlank()) {
                log.info("The model's continuation of {} was empty; the file stays cut off", path);
                break;
            }
            // A Markdown file whose last line is its own fence: the repeated fence is the file's, not the answer's
            String piece = last.strip().startsWith("```") && next.reply().stripLeading().startsWith(last.strip())
                    ? next.reply().stripLeading() : withoutFences(next.reply());
            int reasoning = ModelReasoning.firstReasoningLine(path, piece);
            if (reasoning > 0) {
                String kept = String.join("\n", java.util.Arrays.asList(piece.split("\n", -1)).subList(0, reasoning - 1));
                if (kept.lines().filter(l -> !l.isBlank()).count() < 3) {
                    if (strict) {
                        log.info("The model's continuation of {} was its reasoning again; the file stays cut off", path);
                        break;
                    }
                    // Mostly the model talking to itself: asked once more, strictly
                    log.info("Dropped a continuation of {} that was the model's reasoning; asking again", path);
                    strict = true;
                    continue;
                }
                log.info("Cut a continuation of {} back to the {} line(s) before the model's reasoning", path, kept.lines().count());
                piece = kept + "\n";
                sofar = joinOn(sofar, last, piece);
                joined = true;
                // the rest of the file is still to come
                cut = true;
                continue;
            }
            if (restarts(sofar, piece)) {
                if (compact(piece).startsWith(compact(sofar))) {
                    // The whole file again and further: that is the file now
                    sofar = piece;
                    cut = next.cutOff();
                    continue;
                }
                if (warned) {
                    log.info("The model started {} again a second time; the file stays cut off", path);
                    break;
                }
                // Started the file again: ask once more, more strictly, and keep what was written
                log.info("Dropped a continuation of {} that started the file again; asking again", path);
                warned = true;
                continue;
            }
            if (!seamless(sofar, last, piece)) {
                if (!repeatAsked) {
                    // It went on without the line it was to repeat: perhaps in the middle of a line it never saw whole
                    log.info("Dropped a continuation of {} that did not begin with the file's last line; asking again", path);
                    repeatAsked = true;
                    continue;
                }
                log.info("A continuation of {} again did not begin with the file's last line; joined as it came", path);
            }
            sofar = joinOn(sofar, last, piece);
            joined = true;
            cut = next.cutOff();
        }
        String content = sofar.strip() + "\n";
        List<String> notes = new java.util.ArrayList<>();
        if ((joined || partial != null) && !cut) {
            String problem = brief(joinProblem(path, content));
            if (problem != null) {
                log.info("The pieces of {} did not join cleanly: {}", path, problem);
                throw new JoinFailed("The model's answer came in pieces that did not join cleanly (" + problem + "); write it again.");
            }
            // A piece that wrote a method again, or a helper no piece wrote
            content = completeJoined(path, content, brief, scale, notes).strip() + "\n";
        }
        // The pieces are joined without their fences already; clean() would cut at a ``` inside the file (a template string)
        return new Written(content, cut, scale, notes);
    }

    /**
     * For a Java file: what its part so far declares (not to be written again) and the methods it calls but has not
     * written yet, so a model that sees only the file's end does not repeat a test or forget a helper.
     */
    static String writtenSoFar(String path, String sofar) {
        if (!path.toLowerCase(java.util.Locale.ROOT).endsWith(".java") || sofar.isBlank()) {
            return "";
        }
        JavaCompileChecks.Outline outline = JavaCompileChecks.outline(sofar);
        StringBuilder text = new StringBuilder();
        if (!outline.methods().isEmpty() || !outline.fields().isEmpty()) {
            text.append("\n\nAlready written, do not write these again:");
            if (!outline.methods().isEmpty()) {
                text.append(" methods ").append(String.join(", ", outline.methods().stream().limit(80).toList())).append(';');
            }
            if (!outline.fields().isEmpty()) {
                text.append(" fields ").append(String.join(", ", outline.fields().stream().limit(40).toList())).append(';');
            }
        }
        if (!outline.missing().isEmpty()) {
            text.append("\nMethods called but not yet written (write each of them once, in this file): ")
                    .append(String.join(", ", outline.missing().stream().limit(40).toList())).append('.');
        }
        return text.toString();
    }

    /**
     * A continued Java file put right after its pieces were joined: a method a later piece wrote again with the same
     * parameters is left out (the first is kept), and methods it calls but no piece wrote are asked for once and added
     * before the class's closing brace (kept only if the file still parses and needs fewer). What was done goes to notes.
     */
    private String completeJoined(String path, String content, java.util.function.DoubleFunction<String> brief, double scale,
                                  List<String> notes) {
        if (!path.toLowerCase(java.util.Locale.ROOT).endsWith(".java")) {
            return content;
        }
        String deduplicated = withoutLaterDuplicates(content, notes);
        Map<String, Integer> missing = JavaCompileChecks.undeclaredCalls(deduplicated);
        if (missing.isEmpty()) {
            return deduplicated;
        }
        String names = String.join(", ", missing.keySet());
        String uses = deduplicated.lines().filter(l -> missing.keySet().stream().anyMatch(n -> l.contains(n + "("))).limit(8)
                .map(String::strip).collect(Collectors.joining("\n"));
        String ask = "\n\nThe file " + path + " is complete except that it calls methods it does not declare: " + names
                + ". Write only these missing methods, complete, as members of its class, each once; nothing else, without code fences."
                + "\nThe file's outline:\n" + JavaOutline.of(deduplicated) + "\nWhere they are called:\n" + uses;
        log.info("Asking for the missing methods of {}: {}", path, names);
        String added;
        try {
            ModelGateway.ChatResult reply = PromptFit.chatFrom(modelGateway, SYSTEM, s -> brief.apply(s) + ask, scale).result();
            added = reply.reply() == null || reply.cutOff() ? "" : withoutFences(reply.reply()).strip();
        } catch (ModelLimitReachedException e) {
            log.info("Could not ask for the missing methods of {} ({}): the model's limit", path, names);
            return deduplicated;
        }
        int close = deduplicated.lastIndexOf('}');
        if (added.isEmpty() || close < 0) {
            return deduplicated;
        }
        String completed = deduplicated.substring(0, close).stripTrailing() + "\n\n" + indent(added) + "\n" + deduplicated.substring(close);
        Map<String, Integer> still = JavaCompileChecks.undeclaredCalls(completed);
        if (joinProblem(path, completed) != null || still.size() >= missing.size()) {
            log.info("The missing methods of {} the model wrote did not fit; the file is kept without them", path);
            return deduplicated;
        }
        log.info("Added the missing methods of {}: {}", path, names);
        notes.add("Methods called but not written in the answer's pieces were asked for and added: " + names + ".");
        return withoutLaterDuplicates(completed, notes);
    }

    /** Members written without indentation get four spaces, as a class's members have. */
    private static String indent(String members) {
        boolean flush = members.lines().filter(l -> !l.isBlank()).anyMatch(l -> !Character.isWhitespace(l.charAt(0)));
        return flush ? members.lines().map(l -> l.isBlank() ? "" : "    " + l).collect(Collectors.joining("\n")) : members;
    }

    /** The file without the second (and later) declarations of a method with the same parameters, noted in notes. */
    static String withoutLaterDuplicates(String content, List<String> notes) {
        List<JavaCompileChecks.Duplicate> duplicates = JavaCompileChecks.duplicates(content);
        if (duplicates.isEmpty()) {
            return content;
        }
        List<String> lines = new java.util.ArrayList<>(java.util.Arrays.asList(content.split("\n", -1)));
        // from the bottom, so the line numbers above stay right
        duplicates.stream().sorted(java.util.Comparator.comparingInt(JavaCompileChecks.Duplicate::fromLine).reversed()).forEach(d -> {
            for (int line = d.endLine(); line >= d.fromLine(); line--) {
                lines.remove(line - 1);
            }
            notes.add("The method " + d.signature() + " was written twice across the answer's pieces; the second one (line " + d.line()
                    + ") was left out.");
        });
        log.info("Left out {} method(s) written twice in the pieces of a file", duplicates.size());
        return String.join("\n", lines);
    }

    /** The pieces of a continued file do not parse once joined: text was lost or repeated at a seam. */
    public static final class JoinFailed extends RuntimeException {
        JoinFailed(String message) {
            super(message);
        }
    }

    /** The text up to its last line break: a line cut off in the middle is left out (unless there is no whole line). */
    static String completeLines(String text) {
        int end = text.lastIndexOf('\n');
        return end < 0 || end == text.length() - 1 ? text : text.substring(0, end + 1);
    }

    /** The last line that is not blank. */
    static String lastLine(String text) {
        List<String> lines = text.lines().filter(l -> !l.isBlank()).toList();
        return lines.isEmpty() ? "" : lines.getLast();
    }

    /**
     * A continuation joined on the line the model was asked to repeat first: that line is written once. A continuation
     * that does not start with it is joined on an exact overlap, or appended (see stitch).
     */
    static String joinOn(String sofar, String last, String piece) {
        String base = sofar.isEmpty() || sofar.endsWith("\n") ? sofar : sofar + "\n";
        if (!last.isBlank()) {
            int at = 0;
            while (at < piece.length() && (piece.charAt(at) == '\n' || piece.charAt(at) == '\r')) {
                at++;
            }
            int lineEnd = piece.indexOf('\n', at);
            String first = lineEnd < 0 ? piece.substring(at) : piece.substring(at, lineEnd);
            if (first.strip().equals(last.strip())) {
                return base + (lineEnd < 0 ? "" : piece.substring(lineEnd + 1));
            }
        }
        return stitch(base, piece);
    }

    /**
     * A kept partial made fit to continue from: the model's reasoning cut off, then everything from the line before the
     * first parse error that is not just the cut-off end (a seam that lost text, as Java or JavaScript sees it). Null
     * when too little is left to be worth continuing (under a fifth of it, or a Java file without its class): the file
     * is then written whole.
     */
    static String cleanPartial(String path, String partial) {
        if (partial == null || partial.isBlank()) {
            return null;
        }
        String cleaned = withoutReasoning(path, partial);
        int broken = brokenLine(path, cleaned);
        if (broken > 0) {
            log.info("Cut the kept part of {} back to before its line {}, where it does not parse", path, broken);
            List<String> lines = java.util.Arrays.asList(cleaned.split("\n", -1));
            cleaned = String.join("\n", lines.subList(0, Math.max(0, Math.min(lines.size(), broken - 2)))) + "\n";
        }
        String name = path.substring(path.lastIndexOf('/') + 1).replaceAll("\\.\\w+$", "");
        boolean typeKept = !path.toLowerCase(java.util.Locale.ROOT).endsWith(".java")
                || Pattern.compile("\\b(?:class|interface|enum|record)\\s+" + Pattern.quote(name) + "\\b").matcher(cleaned).find();
        if (cleaned.strip().length() < partial.strip().length() / 5 || !typeKept) {
            log.info("Dropped the kept part of {}: too little of it is usable; the file is written whole", path);
            return null;
        }
        return cleaned.strip() + "\n";
    }

    /**
     * The line (from 1) of a partial's first parse error before its last line, or 0: Java's first problem as JavaParser
     * places it, JavaScript's bracket that closes nothing or the wrong thing. An error at the end is the file being cut off.
     */
    static int brokenLine(String path, String partial) {
        String lower = path.toLowerCase(java.util.Locale.ROOT);
        long lastLine = partial.stripTrailing().lines().count();
        int line = 0;
        if (lower.endsWith(".java")) {
            var result = new com.github.javaparser.JavaParser(new com.github.javaparser.ParserConfiguration()
                    .setLanguageLevel(com.github.javaparser.ParserConfiguration.LanguageLevel.JAVA_21)).parse(partial);
            line = result.getProblems().stream().findFirst().flatMap(com.github.javaparser.Problem::getLocation)
                    .flatMap(r -> r.getBegin().getRange()).map(r -> r.begin.line).orElse(0);
        } else if (lower.endsWith(".js") && !FileChecks.looksLikeJsx(partial)) {
            String problem = JavaScriptCheck.structure(partial);
            Matcher m = Pattern.compile("on line (\\d+) (?:closes nothing|does not match)").matcher(problem == null ? "" : problem);
            line = m.find() ? Integer.parseInt(m.group(1)) : 0;
        }
        return line > 0 && line < lastLine ? line : 0;
    }

    /** Whether a continuation begins with the line it was to repeat, or with an exact repeat of the file's end. */
    static boolean seamless(String sofar, String last, String piece) {
        String base = sofar.isEmpty() || sofar.endsWith("\n") ? sofar : sofar + "\n";
        return last.isBlank() || !joinOn(sofar, last, piece).equals(stitch(base, piece)) || !stitch(base, piece).equals(base + piece);
    }

    /** The comments of a piece before the model's reasoning starts (the whole piece when there is none). */
    static String withoutReasoning(String path, String text) {
        int reasoning = ModelReasoning.firstReasoningLine(path, text);
        if (reasoning <= 0) {
            return text;
        }
        log.info("Cut the model's reasoning from the written part of {} (from its line {})", path, reasoning);
        List<String> lines = java.util.Arrays.asList(text.split("\n", -1)).subList(0, reasoning - 1);
        return lines.isEmpty() ? "" : String.join("\n", lines) + "\n";
    }

    /** A parser's message without its list of what it expected, at most 200 characters. */
    private static String brief(String problem) {
        if (problem == null) {
            return null;
        }
        int expected = problem.indexOf(", expected one of");
        String shorter = expected > 0 ? problem.substring(0, expected) : problem;
        return shorter.length() > 200 ? shorter.substring(0, 200) + "..." : shorter;
    }

    /** Why a joined file does not parse (Java, or JavaScript that is not React), or null. */
    static String joinProblem(String path, String content) {
        String lower = path.toLowerCase(java.util.Locale.ROOT);
        if (lower.endsWith(".java")) {
            FileChecks.Result java = FileChecks.check(path, content);
            return java.status() == FileChecks.Status.FAILED ? java.message() : null;
        }
        if (lower.endsWith(".js") && !FileChecks.looksLikeJsx(content)) {
            return JavaScriptCheck.structure(content);
        }
        return null;
    }

    /** The least repeated text that counts as an overlap: shorter matches are chance. */
    static final int MIN_OVERLAP = 20;

    /**
     * The file so far with a continuation joined on. The longest end of the file so far (at least 20 characters that are
     * not spaces, at most 3000) that the continuation starts with is written once; otherwise the continuation is
     * appended exactly as it came, so a closing brace or a line break the model wrote is never lost.
     */
    static String stitch(String sofar, String continuation) {
        String b = continuation;
        int max = Math.min(Math.min(sofar.length(), b.length()), 3000);
        for (int k = max; k > 0; k--) {
            if (sofar.regionMatches(sofar.length() - k, b, 0, k)) {
                if (nonSpace(b, k) >= MIN_OVERLAP) {
                    return sofar + b.substring(k);
                }
                break;
            }
        }
        return sofar + b;
    }

    private static int nonSpace(String text, int end) {
        int n = 0;
        for (int i = 0; i < end; i++) {
            if (!Character.isWhitespace(text.charAt(i))) {
                n++;
            }
        }
        return n;
    }

    /**
     * Whether a continuation starts the file again: it begins (spaces aside) with the file's own first 40 characters
     * (its package line, imports, class header), or with all of a shorter file so far.
     */
    static boolean restarts(String sofar, String continuation) {
        String a = compact(sofar);
        String b = compact(continuation);
        int shorter = Math.min(a.length(), b.length());
        if (shorter < 20) {
            return false;
        }
        int same = 0;
        while (same < shorter && same < 200 && a.charAt(same) == b.charAt(same)) {
            same++;
        }
        return same >= Math.min(40, shorter);
    }

    private static String compact(String text) {
        return text.replaceAll("\\s+", "");
    }

    /** The text without a markdown fence line at its start and a closing fence at its end. */
    static String withoutFences(String text) {
        String t = text == null ? "" : text;
        int fence = t.indexOf("```");
        // An opening fence, possibly after up to two short lines of prose ("Continuing from where it stopped:")
        if (fence >= 0 && fence < 400 && prose(t.substring(0, fence))) {
            int line = t.indexOf('\n', fence);
            t = line < 0 ? "" : t.substring(line + 1);
        }
        String trail = t.stripTrailing();
        if (trail.endsWith("```")) {
            t = trail.substring(0, trail.length() - 3);
        }
        return t;
    }

    /** Up to two short lines of prose (no code characters), blank lines allowed: what a model writes before a fence. */
    static boolean prose(String text) {
        List<String> lines = text.lines().filter(l -> !l.isBlank()).toList();
        // A markdown heading is the file's own content (a .md file's first fence belongs to it)
        return lines.size() <= 2 && lines.stream().allMatch(l -> l.length() <= 200 && !l.matches(".*[{};=<>()\\[\\]].*")
                && !l.stripLeading().startsWith("#"));
    }

    /** Removes markdown fences and text around them if the model added them anyway. */
    static String clean(String reply) {
        String text = reply == null ? "" : reply.strip();
        int fence = text.indexOf("```");
        if (fence >= 0) {
            int bodyStart = text.indexOf('\n', fence);
            int close = text.lastIndexOf("```");
            if (bodyStart > 0 && close > bodyStart) {
                text = text.substring(bodyStart + 1, close).strip();
            }
        }
        return text.isEmpty() ? text : text + "\n";
    }

    private static String head(String content, int lines) {
        return content.lines().limit(lines).collect(Collectors.joining("\n"));
    }

    private static String nullToDash(String value) {
        return value == null ? "-" : value;
    }
}
