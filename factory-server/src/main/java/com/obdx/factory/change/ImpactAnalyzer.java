package com.obdx.factory.change;

import com.obdx.factory.common.BadRequestException;
import com.obdx.factory.model.ModelGateway;
import com.obdx.factory.model.ModelLimitReachedException;
import com.obdx.factory.model.PromptFit;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
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
            - Plan every helper type a file uses (exceptions, enums, mappers). Each public Java type goes in its own file;
              a request DTO and its response DTO are separate files.
            - Reuse the existing classes that do the job (for example an existing accounts.HostAccountAdapter) instead of
              creating a parallel one with the same purpose in another package.
            - A new UI component (a widget, a screen) is hooked into an existing one: name in its details the existing
              component or file that loads or shows it (for example the dashboard that loads widgets, or the menu), and
              plan a modify of that file when it must change. Do not create a new dashboard, shell, router or registry
              file when the code already has one.
            - Use "modify" only for paths shown in the existing code or folder structure. Paths are relative, with
              forward slashes, exactly as shown.
            - basedOn lists existing files whose patterns the new or changed code should follow.
            - details says precisely what to add or change in the file.
            - For each REST resource, name in its details the API paths it serves with their methods (for example
              "POST /payments/standingInstructions, GET /payments/standingInstructions/{id}").
            - When the spec has acceptance criteria, plan the tests that check them (layer test): at least one test file
              for each REST resource or service the plan creates or changes, and one for each view model, next to the
              codebase's or the UI target's existing tests and in their framework. Name in details the criteria (AC-001)
              each covers. Only when the codebase and the UI target have no tests of a kind, plan none of it and say so
              in risks. Name in each item's details the requirements (FR-001) it implements.
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

    /** How many times a plan cut off at the model's output limit is continued. */
    static final int MAX_CONTINUATIONS = 6;

    /** On Ollama each continuation takes minutes on the factory's own hardware: fewer of them. */
    static final int LOCAL_CONTINUATIONS = 2;

    /** Below this output limit (tokens per answer) the model is asked for short purposes and details from the start. */
    static final int SMALL_OUTPUT = 2000;

    public ChangePlan analyze(ChangeContext context, List<Candidate> candidates, Predicate<String> fileExists) {
        BadRequestException last = null;
        int cap = modelGateway.outputLimit();
        String shortly = cap > 0 && cap < SMALL_OUTPUT ? "\nYour answers are limited to about " + cap + " tokens: keep purpose and "
                + "details to one short sentence each." : "";
        String retry = shortly;
        for (int attempt = 0; attempt < 2; attempt++) {
            String again = retry;
            ModelGateway.ChatResult result = PromptFit.chatJson(modelGateway, SYSTEM, scale -> prompt(context, candidates, scale) + again);
            try {
                if (!result.cutOff()) {
                    return PlanParser.parseModel(result.reply(), fileExists, properties.maxPlanItems());
                }
                // The model stopped at its output limit: keep the files it planned whole and ask for the rest
                log.warn("The change plan was cut off at the model's output limit; asking for the files still missing");
            } catch (BadRequestException e) {
                log.warn("Unusable change plan from the model (attempt {}): {}", attempt + 1, e.getMessage());
                last = e;
                retry = shortly + "\nYour previous answer could not be used (" + e.getMessage() + "). Answer with only the JSON object.";
                continue;
            }
            try {
                return continued(context, candidates, fileExists, PlanParser.partial(result.reply()), shortly, CUT_ANSWER);
            } catch (BadRequestException e) {
                // Continued and still unusable (no file at all, too many): not asked for all over again, which would cost as much again
                throw new IllegalStateException("The model did not return a usable change plan: " + e.getMessage());
            }
        }
        throw new IllegalStateException("The model did not return a usable change plan: " + last.getMessage());
    }

    /**
     * A plan the model's limit stopped (see {@link ChangePlan.Incomplete#LIMIT}), completed: its planned files are kept
     * and the model is asked for only the files still missing; nothing is planned again. Analyze again does this instead
     * of starting over, so the files already planned (and paid for) are not asked for twice. The caller checks that the
     * code and the spec are those the plan was made from (see ChangeService).
     */
    public ChangePlan resume(ChangeContext context, List<Candidate> candidates, Predicate<String> fileExists, ChangePlan incomplete) {
        int cap = modelGateway.outputLimit();
        String shortly = cap > 0 && cap < SMALL_OUTPUT ? "\nYour answers are limited to about " + cap + " tokens: keep purpose and "
                + "details to one short sentence each." : "";
        List<String> risks = new ArrayList<>(incomplete.risks() == null ? List.of() : incomplete.risks());
        risks.removeIf(ImpactAnalyzer::incompleteRisk);
        log.info("Resuming the incomplete change plan: {} file(s) planned so far", incomplete.items().size());
        return continued(context, candidates, fileExists, new ChangePlan(incomplete.summary(), incomplete.items(), risks), shortly,
                RESUMED);
    }

    /** How the risk of a plan the model's limit (a daily or per-minute limit) stopped part-way starts. */
    static final String LIMIT_STOPPED = "The model's limit stopped the plan before it was complete";
    /** How the risk of a plan still cut off at the output limit after its continuations starts. */
    static final String CUT_OFF = "The model's answer was cut off at its output limit";
    /** How the risk of a plan whose last files were left out (more than one change may have) starts. */
    static final String TOO_MANY = "The plan had more files than one change may have";

    /**
     * Whether a risk's text is one of those the server writes when files may be missing from the plan. Only the server
     * writes them: one in a model's answer or a reviewer's edit is dropped (PlanParser.normalize), and the approval gate
     * reads {@link ChangePlan#incomplete()}, never the text.
     */
    static boolean incompleteRisk(String risk) {
        // anywhere in it: a risk that only starts with other words ("Wait. The model's limit ...") is no less one
        return risk != null && (risk.contains(LIMIT_STOPPED) || risk.contains(CUT_OFF) || risk.contains(TOO_MANY));
    }

    /** Whether the model's limit stopped the plan part-way, so that Analyze again can continue it. */
    static boolean resumable(ChangePlan plan) {
        return plan != null && plan.items() != null && !plan.items().isEmpty() && plan.incomplete() != null
                && ChangePlan.Incomplete.LIMIT.equals(plan.incomplete().kind());
    }

    /**
     * The record a plan stored by an earlier version (before the server kept it, see {@link ChangePlan#incomplete()})
     * stands for, from the risk the server wrote then: the model's limit stopped it (LIMIT), its answer stayed cut off
     * (CUT_OFF), or it had too many files (TOO_MANY). Only for a plan whose latest revision is the impact analysis's
     * own ({@code latestOrigin} ANALYZED: an edit never carries such a risk), without a record, and with the risk as the
     * server wrote it (its fixed start, then its reason in parentheses). Null otherwise. The record names no revision
     * or context, as none was kept: such a plan is analyzed afresh, never continued (see ChangeService.whyNotResumed).
     */
    static ChangePlan.Incomplete legacyRecord(ChangePlan stored, String latestOrigin) {
        if (stored == null || stored.incomplete() != null || stored.risks() == null || stored.items() == null || stored.items().isEmpty()
                || !PlanReviewStore.Origin.ANALYZED.name().equals(latestOrigin)) {
            return null;
        }
        for (String risk : stored.risks()) {
            String kind = risk == null ? null : risk.startsWith(LIMIT_STOPPED + " (") ? ChangePlan.Incomplete.LIMIT
                    : risk.startsWith(CUT_OFF + " (") || risk.startsWith(CUT_OFF + ", so") ? ChangePlan.Incomplete.CUT_OFF
                    : risk.startsWith(TOO_MANY + " (") ? ChangePlan.Incomplete.TOO_MANY : null;
            if (kind != null) {
                return new ChangePlan.Incomplete(kind, risk, null, null);
            }
        }
        return null;
    }

    /** How a continuation starts when the model's answer stopped at its output limit. */
    static final String CUT_ANSWER = "\nYour previous answer stopped at your output limit. ";
    /** How a continuation starts when the plan is resumed after the model's usage limit stopped it. */
    static final String RESUMED = "\nThe planning was stopped by a usage limit before the plan was complete. ";

    /**
     * A plan the model's output limit stopped part-way, completed: while an answer stops at the limit (a server that
     * writes little per request, such as a free cloud tier), the model is asked, with the same context, for only the
     * files not planned yet, and the pieces are joined (a file planned twice is kept as first planned). It stops when an
     * answer is whole, adds no file, or the plan has as many files as one change may have; a plan still cut off after
     * that says so in its risks and is marked incomplete.
     *
     * @param why how the first continuation says why it is asked ({@link #CUT_ANSWER} or {@link #RESUMED})
     */
    private ChangePlan continued(ChangeContext context, List<Candidate> candidates, Predicate<String> fileExists, ChangePlan first,
                                 String note, String why) {
        int maxItems = properties.maxPlanItems();
        Map<String, ChangePlan.Item> items = new LinkedHashMap<>();
        List<String> risks = new ArrayList<>();
        String summary = first.summary();
        join(items, risks, first);
        boolean cut = true;
        String limited = null;
        int continuations = modelGateway.local() ? LOCAL_CONTINUATIONS : MAX_CONTINUATIONS;
        for (int i = 0; cut && i < continuations && items.size() < maxItems; i++) {
            String more = note + continuation(items.keySet(), i == 0 ? why : CUT_ANSWER);
            log.info("Continuing the change plan (continuation {} of at most {}): {} file(s) planned so far", i + 1, continuations,
                    items.size());
            ModelGateway.ChatResult next;
            try {
                next = PromptFit.chatJson(modelGateway, SYSTEM, scale -> prompt(context, candidates, scale) + more);
            } catch (ModelLimitReachedException e) {
                if (items.isEmpty()) {
                    throw e;
                }
                // The files planned so far are kept for review; the plan says it is incomplete
                log.warn("The change plan's continuation stopped at the model's limit: {}", e.getMessage());
                limited = e.getMessage();
                break;
            }
            ChangePlan piece = PlanParser.partial(next.reply());
            if (summary == null) {
                summary = piece.summary();
            }
            boolean added = join(items, risks, piece);
            cut = next.cutOff();
            if (!added) {
                // Nothing new: the plan is complete, or the model only repeats itself
                break;
            }
        }
        String kind = null;
        String risk = null;
        if (items.size() > maxItems) {
            List<String> paths = new ArrayList<>(items.keySet());
            paths.subList(maxItems, paths.size()).forEach(items::remove);
            kind = ChangePlan.Incomplete.TOO_MANY;
            risk = TOO_MANY + " (" + maxItems + "); the last ones were left out. Split the requirement into smaller changes, or add the "
                    + "missing files by hand.";
        } else if (limited != null) {
            kind = ChangePlan.Incomplete.LIMIT;
            risk = LIMIT_STOPPED + " (" + limited + "), so files may be missing from this plan. Add them before approving, or analyze "
                    + "again later: the files planned so far are kept and only the missing ones are asked for.";
        } else if (cut) {
            int cap = modelGateway.outputLimit();
            kind = ChangePlan.Incomplete.CUT_OFF;
            risk = CUT_OFF + (cap > 0 ? " (its server writes at most " + cap + " tokens per answer)" : "") + ", so files may be missing "
                    + "from this plan. Add them before approving, or analyze again with a model or plan with a higher output limit.";
        }
        // (normalize drops any such risk the model wrote itself; the server's own is added after it)
        ChangePlan plan = PlanParser.normalize(PlanParser.withoutModelReasoning(new ChangePlan(summary, new ArrayList<>(items.values()), risks)),
                fileExists, maxItems);
        if (kind == null) {
            return plan;
        }
        // Tests are planned last: a plan stopped part-way often has none yet, which the record says
        risk += testsMissing(context, plan);
        List<String> withRisk = new ArrayList<>(plan.risks());
        withRisk.add(0, risk);
        return new ChangePlan(plan.summary(), plan.items(), withRisk, new ChangePlan.Incomplete(kind, risk, null, null));
    }

    /** What an incomplete plan's risk adds when the spec has acceptance criteria and no test is planned yet; else "". */
    static final String TESTS_MISSING = " No test is planned yet for the spec's acceptance criteria.";

    static String testsMissing(ChangeContext context, ChangePlan plan) {
        // (the spec as the model gets it leaves out empty parts: the key is there only when there are criteria)
        boolean criteria = context.specJson() != null && context.specJson().contains("\"acceptanceCriteria\"");
        boolean tests = plan.items().stream().anyMatch(i -> "test".equals(i.layer()) || PlanReview.isTest(i.path()));
        return criteria && !tests ? TESTS_MISSING : "";
    }

    /** Adds a piece's files not planned yet and its new risks; whether it added a file. */
    private static boolean join(Map<String, ChangePlan.Item> items, List<String> risks, ChangePlan piece) {
        boolean added = false;
        for (ChangePlan.Item item : piece.items()) {
            String path = PlanParser.cleanPath(item == null ? null : item.path());
            if (path != null && !items.containsKey(path)) {
                items.put(path, item);
                added = true;
            }
        }
        for (String risk : piece.risks()) {
            if (risk != null && !risk.isBlank() && !risks.contains(risk)) {
                risks.add(risk);
            }
        }
        return added;
    }

    /** What a continuation asks for after the usual prompt: the files not planned yet, and only those. */
    static String continuation(java.util.Collection<String> planned) {
        return continuation(planned, CUT_ANSWER);
    }

    /** @param why why the continuation is asked ({@link #CUT_ANSWER} or {@link #RESUMED}) */
    static String continuation(java.util.Collection<String> planned, String why) {
        StringBuilder more = new StringBuilder(why);
        if (planned.isEmpty()) {
            more.append("It planned no file completely.\n");
        } else {
            more.append("The plan so far has these files:\n");
            planned.forEach(path -> more.append("- ").append(path).append('\n'));
        }
        more.append("Answer with one JSON object in the same format that lists only the files still missing from the plan (do not list "
                + "the files above again) and the risks: {\"items\": [...], \"risks\": [...]}. Keep purpose and details to one short "
                + "sentence each. If no file is missing, answer {\"items\": [], \"risks\": []}.");
        return more.toString();
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
