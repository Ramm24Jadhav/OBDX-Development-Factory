package com.obdx.factory.change;

import com.obdx.factory.model.ModelGateway;
import com.obdx.factory.pack.LocalChecks;
import com.obdx.factory.pack.Recipe;
import com.obdx.factory.pack.VersionPacks;
import org.springframework.stereotype.Component;

import java.util.Map;
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
            - Answer with only the file content: no explanations, no markdown code fences.
            """;

    public record Result(String content, FileChecks.Result check, int attempts) {
    }

    private final ModelGateway modelGateway;
    private final ChangeProperties properties;
    private final LocalChecks checks;
    private final VersionPacks packs;

    public CodeGenerator(ModelGateway modelGateway, ChangeProperties properties, LocalChecks checks, VersionPacks packs) {
        this.modelGateway = modelGateway;
        this.properties = properties;
        this.checks = checks;
        this.packs = packs;
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
        Recipe.Match recipe = packs.find(context.checks().version())
                .flatMap(p -> p.recipeFor(item.path(), item.action(), item.layer())).orElse(null);
        String prompt = prompt(context, plan, item, current, examples, earlier, note, checks.describeRules(context.checks(), item.path()), recipe);
        String content = clean(modelGateway.chat(SYSTEM, prompt).reply());
        FileChecks.Result check = checks.check(context.checks(), item.path(), original, content);
        int attempts = 1;
        while (check.status() == FileChecks.Status.FAILED && attempts <= properties.fixAttempts()) {
            String fix = prompt + "\n\nYou wrote this content:\n" + content + "\n\nIt did not pass the checks:\n" + check.message()
                    + "\nWrite the complete corrected file.";
            content = clean(modelGateway.chat(SYSTEM, fix).reply());
            check = checks.check(context.checks(), item.path(), original, content);
            attempts++;
        }
        return new Result(content, check, attempts);
    }

    private static String prompt(ChangeContext context, ChangePlan plan, ChangePlan.Item item, String current,
                                 Map<String, String> examples, Map<String, String> earlier, String note, String rules,
                                 Recipe.Match recipe) {
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
        user.append("Requirement specification (approved):\n").append(ChangeContext.cap(context.specJson(), 8000)).append("\n\n");
        if (context.designsJson() != null && ("ui".equals(item.layer()) || "test".equals(item.layer()))) {
            user.append("Screen designs (approved):\n").append(ChangeContext.cap(context.designsJson(), 6000)).append("\n\n");
        }
        user.append("Project profile:\n").append(context.profile().isBlank() ? "(not available)" : context.profile()).append("\n\n");
        if (recipe != null) {
            user.append("How this is built in OBDX (version pack recipe \"").append(recipe.recipe().title()).append("\", ")
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
                    .append(ChangeContext.cap(example.getValue(), 12000)).append("\n\n");
        }
        if (!earlier.isEmpty()) {
            user.append("Files already written in this change (beginnings):\n");
            for (Map.Entry<String, String> file : earlier.entrySet()) {
                user.append("--- ").append(file.getKey()).append('\n').append(head(file.getValue(), 40)).append('\n');
            }
        }
        if (current == null && recipe != null && recipe.part().content() != null) {
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
