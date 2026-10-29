package com.obdx.factory.change;

import com.obdx.factory.common.BadRequestException;
import com.obdx.factory.model.ModelGateway;
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
            - Use "modify" only for paths shown in the existing code or folder structure. Paths are relative, with
              forward slashes, exactly as shown.
            - basedOn lists existing files whose patterns the new or changed code should follow.
            - details says precisely what to add or change in the file.
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
        StringBuilder user = new StringBuilder();
        user.append("Change: ").append(context.title()).append("\n\n");
        user.append("Requirement specification (approved):\n").append(ChangeContext.cap(context.specJson(), 12000)).append("\n\n");
        user.append("Screen designs (approved):\n").append(context.designsJson() == null ? "(none)" : ChangeContext.cap(context.designsJson(), 8000)).append("\n\n");
        user.append("Project profile:\n").append(context.profile().isBlank() ? "(not available)" : context.profile()).append("\n\n");
        user.append("Folder structure (folder: files):\n").append(context.structure()).append("\n\n");
        if (context.target() != null && !context.target().isBlank()) {
            user.append("UI target:\n").append(context.target()).append('\n');
        }
        if (context.recipes() != null && !context.recipes().isBlank()) {
            user.append("Version pack recipes (kinds of work, the files each needs, and reference examples in this codebase):\n")
                    .append(ChangeContext.cap(context.recipes(), 5000)).append('\n');
        }
        if (!context.knowledge().isBlank()) {
            user.append("OBDX knowledge (Oracle manuals and approved notes for this OBDX version; follow it where it applies):\n")
                    .append(ChangeContext.cap(context.knowledge(), 5000)).append('\n');
        }
        user.append("Relevant existing code:\n");
        if (candidates.isEmpty()) {
            user.append("(no matches found; the code may not be imported yet)\n");
        }
        for (Candidate candidate : candidates) {
            user.append("--- ").append(candidate.path()).append(" (lines ").append(candidate.startLine()).append('-')
                    .append(candidate.endLine()).append(candidate.symbol() == null ? "" : ", " + candidate.symbol()).append(")\n")
                    .append(ChangeContext.cap(candidate.snippet(), 2500)).append('\n');
        }

        String prompt = user.toString();
        BadRequestException last = null;
        for (int attempt = 0; attempt < 2; attempt++) {
            String reply = modelGateway.chatJson(SYSTEM, prompt).reply();
            try {
                return PlanParser.parse(reply, fileExists, properties.maxPlanItems());
            } catch (BadRequestException e) {
                log.warn("Unusable change plan from the model (attempt {}): {}", attempt + 1, e.getMessage());
                last = e;
                prompt = user + "\nYour previous answer could not be used (" + e.getMessage() + "). Answer with only the JSON object.";
            }
        }
        throw new IllegalStateException("The model did not return a usable change plan: " + last.getMessage());
    }
}
