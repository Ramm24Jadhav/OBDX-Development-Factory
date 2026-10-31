package com.obdx.factory.change;

import com.obdx.factory.model.ModelGateway;
import com.obdx.factory.model.PromptFit;
import com.obdx.factory.pack.LocalChecks;
import com.obdx.factory.pack.Recipe;
import com.obdx.factory.target.ScreenScaffolder;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;
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
            - Use only APIs and classes that exist in the code shown, or that this change creates.
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
        Recipe.Match recipe = checks.recipeFor(context.checks(), item.path(), item.action(), item.layer()).orElse(null);
        String rules = checks.describeRules(context.checks(), item.path());
        String guidance = checks.targetGuidance(context.checks(), item.path());
        java.util.function.DoubleFunction<String> prompt = scale -> prompt(context, plan, item, current, examples, earlier, note, rules, recipe,
                guidance, scaffold, scale);
        ModelGateway.ChatResult reply = PromptFit.chat(modelGateway, SYSTEM, prompt);
        String content = clean(reply.reply());
        FileChecks.Result check = checked(context, item, original, content, scaffold, reply.cutOff());
        int attempts = 1;
        // A file cut off at the output limit is not fixed by asking with it again, which is longer still
        while (check.status() == FileChecks.Status.FAILED && !reply.cutOff() && attempts <= properties.fixAttempts()) {
            String fix = "\n\nYou wrote this content:\n" + content + "\n\nIt did not pass the checks:\n" + check.message()
                    + "\nWrite the complete corrected file.";
            reply = PromptFit.chat(modelGateway, SYSTEM, scale -> prompt.apply(scale) + fix);
            content = clean(reply.reply());
            check = checked(context, item, original, content, scaffold, reply.cutOff());
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
        String cut = "The model stopped at its output limit, so the file is incomplete. Write it again with a model that writes "
                + "longer answers, or finish it by hand.";
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
        if (!earlier.isEmpty()) {
            user.append("Files already written in this change (beginnings):\n");
            for (Map.Entry<String, String> file : earlier.entrySet()) {
                user.append("--- ").append(file.getKey()).append('\n').append(head(file.getValue(), Math.max(8, (int) (40 * scale)))).append('\n');
            }
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
