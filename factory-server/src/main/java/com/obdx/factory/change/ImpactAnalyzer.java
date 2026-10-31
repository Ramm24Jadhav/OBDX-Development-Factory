package com.obdx.factory.change;

import com.obdx.factory.common.BadRequestException;
import com.obdx.factory.model.ModelGateway;
import com.obdx.factory.model.PromptFit;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.function.Predicate;

/**
 * Decides which files a change must create or modify, from the approved spec and designs and the most relevant
 * existing code found by code search.
 */
@Component
public class ImpactAnalyzer {

    private static final Logger log = LoggerFactory.getLogger(ImpactAnalyzer.class);

    static final String SYSTEM = """
            You are a senior Oracle Banking Digital Experience (OBDX) developer planning a customization in a bank's
            existing codebase. You get an approved requirement specification, approved screen designs, facts about the
            codebase (its Project Profile), its folder structure, and excerpts of the most relevant existing code.
            Decide exactly which files must be created or modified. This is a change plan; no code yet.

            Rules:
            - Follow the bank's existing structure and conventions. Put new files next to similar existing files.
            - Use the version pack recipes: each kind of work needs the kinds of files its recipe lists, and the
              reference examples show where and how this bank builds them (good basedOn files).
            - Modify existing files when the requirement enhances an existing screen, service or script; create new
              files for new screens and services.
            - Cover every layer the requirement needs: data (SQL scripts), integration (host adapters), service (REST
              services, business logic, DTOs), ui (JET views, view models, resource bundles, navigation), test, config.
            - When new or changed code needs classes that do not exist yet (DTOs, services, exceptions, models), plan a
              file for each; code may only use classes that exist or that this plan creates.
            - Use "modify" only for paths shown in the existing code or folder structure. Paths are relative, with
              forward slashes, exactly as shown.
            - basedOn lists existing files whose patterns the new or changed code should follow.
            - details says precisely what to add or change in the file.
            - When the spec has acceptance criteria, plan the tests that check them (layer test) and name in details the
              criteria (AC-001) each covers; name in each item's details the requirements (FR-001) it implements.
            - Put anything uncertain (missing information, assumptions, risky changes) in risks.

            Answer with one JSON object in exactly this format, and nothing else:
            {"summary": "what the change does, in two or three sentences",
             "items": [{"path": "relative/path/File.java", "action": "create | modify", "layer": "data | integration | service | ui | test | config",
                        "purpose": "one line", "basedOn": ["existing/Similar.java"], "details": "what exactly to write or change"}],
             "risks": ["..."]}
            """;

    public record Candidate(String path, String symbol, int startLine, int endLine, String snippet) {
    }

    private final ModelGateway modelGateway;
    private final ChangeProperties properties;

    public ImpactAnalyzer(ModelGateway modelGateway, ChangeProperties properties) {
        this.modelGateway = modelGateway;
        this.properties = properties;
    }

    public ChangePlan analyze(ChangeContext context, List<Candidate> candidates, Predicate<String> fileExists) {
        BadRequestException last = null;
        String retry = "";
        for (int attempt = 0; attempt < 2; attempt++) {
            String again = retry;
            ModelGateway.ChatResult result = PromptFit.chatJson(modelGateway, SYSTEM, scale -> prompt(context, candidates, scale) + again);
            try {
                ChangePlan plan = PlanParser.parse(result.reply(), fileExists, properties.maxPlanItems());
                if (!result.cutOff()) {
                    return plan;
                }
                // The model stopped at its output limit: the plan lacks its last files. Ask once for a shorter one.
                if (attempt == 0) {
                    log.warn("The change plan was cut off at the model's output limit; asking for a shorter one");
                    retry = "\nYour previous answer was cut off at your output limit. Answer again with the complete plan, shorter: "
                            + "purpose and details one short sentence each.";
                    continue;
                }
                List<String> risks = new java.util.ArrayList<>(plan.risks());
                risks.add(0, "The model's answer was cut off at its output limit, so files may be missing from this plan. "
                        + "Add them before approving, or analyze again with a model that writes longer answers.");
                return new ChangePlan(plan.summary(), plan.items(), risks);
            } catch (BadRequestException e) {
                log.warn("Unusable change plan from the model (attempt {}): {}", attempt + 1, e.getMessage());
                last = e;
                retry = "\nYour previous answer could not be used (" + e.getMessage() + "). Answer with only the JSON object.";
            }
        }
        throw new IllegalStateException("The model did not return a usable change plan: " + last.getMessage());
    }

    /**
     * The prompt with each section at {@code scale} of its usual size, and fewer code excerpts when smaller, for a
     * model whose server takes less (see PromptFit).
     */
    static String prompt(ChangeContext context, List<Candidate> candidates, double scale) {
        StringBuilder user = new StringBuilder();
        user.append("Change: ").append(context.title()).append("\n\n");
        user.append("Requirement specification (approved):\n").append(ChangeContext.cap(context.specJson(), PromptFit.size(14000, scale))).append("\n\n");
        user.append("Screen designs (approved):\n").append(context.designsJson() == null ? "(none)"
                : ChangeContext.cap(context.designsJson(), PromptFit.size(8000, scale))).append("\n\n");
        user.append("Project profile:\n").append(context.profile().isBlank() ? "(not available)"
                : ChangeContext.cap(context.profile(), PromptFit.size(8000, scale))).append("\n\n");
        user.append("Folder structure (folder: files):\n").append(ChangeContext.cap(context.structure(), PromptFit.size(16000, scale))).append("\n\n");
        if (context.target() != null && !context.target().isBlank()) {
            user.append("UI target:\n").append(context.target()).append('\n');
        }
        if (context.recipes() != null && !context.recipes().isBlank()) {
            user.append("Version pack recipes (kinds of work, the files each needs, and reference examples in this codebase):\n")
                    .append(ChangeContext.cap(context.recipes(), PromptFit.size(5000, scale))).append('\n');
        }
        if (!context.knowledge().isBlank()) {
            user.append("OBDX knowledge (Oracle manuals and approved notes for this OBDX version; follow it where it applies):\n")
                    .append(ChangeContext.cap(context.knowledge(), PromptFit.size(5000, scale))).append('\n');
        }
        user.append("Relevant existing code:\n");
        if (candidates.isEmpty()) {
            user.append("(no matches found; the code may not be imported yet)\n");
        }
        int shown = Math.max(3, (int) Math.ceil(candidates.size() * scale));
        for (Candidate candidate : candidates.subList(0, Math.min(shown, candidates.size()))) {
            user.append("--- ").append(candidate.path()).append(" (lines ").append(candidate.startLine()).append('-')
                    .append(candidate.endLine()).append(candidate.symbol() == null ? "" : ", " + candidate.symbol()).append(")\n")
                    .append(ChangeContext.cap(candidate.snippet(), PromptFit.size(2500, scale))).append('\n');
        }
        return user.toString();
    }
}
