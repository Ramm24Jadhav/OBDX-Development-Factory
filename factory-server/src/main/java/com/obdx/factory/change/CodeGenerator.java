package com.obdx.factory.change;

import com.obdx.factory.model.ModelGateway;
import com.obdx.factory.model.ModelLimitReachedException;
import com.obdx.factory.model.PromptFit;
import com.obdx.factory.pack.LocalChecks;
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
        java.util.function.DoubleFunction<String> prompt = scale -> prompt(context, plan, item, current, examples, earlier, note, rules, recipe,
                guidance, scaffold, scale);
        Written written = write(prompt, partial, 1);
        String content = written.content();
        FileChecks.Result check = checked(context, item, original, content, scaffold, written.cutOff());
        int attempts = 1;
        // A file still cut off after its continuations is not fixed by asking with it again, which is longer still
        while (check.status() == FileChecks.Status.FAILED && !written.cutOff() && attempts <= properties.fixAttempts()) {
            String fix = "\n\nYou wrote this content:\n" + content + "\n\nIt did not pass the checks:\n" + check.message()
                    + "\nWrite the complete corrected file.";
            written = write(scale -> prompt.apply(scale) + fix, null, written.scale());
            content = written.content();
            check = checked(context, item, original, content, scaffold, written.cutOff());
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
                                 Recipe.Match recipe, String targetGuidance, ScreenScaffolder.Scaffold scaffold, double scale) {
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
        if (!context.knowledge().isBlank()) {
            user.append("OBDX knowledge (Oracle manuals and approved notes for this OBDX version; follow it where it applies):\n")
                    .append(ChangeContext.cap(context.knowledge(), PromptFit.size(4000, scale))).append("\n\n");
        }
        if (context.designsJson() != null && ("ui".equals(item.layer()) || "test".equals(item.layer()))) {
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
        for (Map.Entry<String, String> example : examples.entrySet()) {
            user.append("Example file to follow, ").append(example.getKey()).append(":\n")
                    .append(ChangeContext.cap(example.getValue(), PromptFit.size(12000, scale))).append("\n\n");
        }
        Map<String, String> related = related(item, earlier, scale);
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
    record Written(String content, boolean cutOff, double scale) {
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
     * A continuation is the same prompt, at the scale the first piece needed or smaller, plus only the file's last
     * 3000 characters.
     *
     * @param partial what was written of the file before (continued from at once), or null
     */
    private Written write(java.util.function.DoubleFunction<String> prompt, String partial, double start) {
        double scale = start;
        String sofar;
        if (partial == null) {
            PromptFit.Fitted first = PromptFit.chatFrom(modelGateway, SYSTEM, prompt, scale);
            scale = first.scale();
            ModelGateway.ChatResult reply = first.result();
            if (!reply.cutOff()) {
                return new Written(clean(reply.reply()), false, scale);
            }
            sofar = withoutFences(reply.reply());
        } else {
            sofar = partial;
        }
        boolean cut = true;
        boolean warned = false;
        int continuations = continuations();
        for (int i = 0; cut && i < continuations; i++) {
            String end = sofar.length() > TAIL ? sofar.substring(sofar.length() - TAIL) : sofar;
            String more = "\n\nYour answer stopped at your output limit. It ended with:\n" + end + "\n\nContinue exactly where it stopped: "
                    + "answer with only the rest of the file, starting with the next characters, repeating nothing, without code fences."
                    + (warned ? " Do NOT start the file again: no package line, no imports, no class header; only what comes after the "
                    + "last characters above." : "");
            PromptFit.Fitted fitted;
            try {
                fitted = PromptFit.chatFrom(modelGateway, SYSTEM, s -> prompt.apply(s) + more, scale);
            } catch (ModelLimitReachedException e) {
                if (sofar.isBlank()) {
                    throw e;
                }
                // Keep what was written: Continue goes on from it instead of paying for the whole file again
                throw new Partial(e, sofar.strip() + "\n");
            }
            scale = fitted.scale();
            ModelGateway.ChatResult next = fitted.result();
            if (next.reply() == null || next.reply().isBlank()) {
                break;
            }
            String piece = withoutFences(next.reply());
            if (restarts(sofar, piece)) {
                if (compact(piece).startsWith(compact(sofar))) {
                    // The whole file again and further: that is the file now
                    sofar = piece;
                    cut = next.cutOff();
                    continue;
                }
                if (warned) {
                    break;
                }
                // Started the file again: ask once more, more strictly, and keep what was written
                warned = true;
                continue;
            }
            sofar = stitch(sofar, piece);
            cut = next.cutOff();
        }
        // The pieces are joined without their fences already; clean() would cut at a ``` inside the file (a template string)
        return new Written(sofar.strip() + "\n", cut, scale);
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
