package com.obdx.factory.change;

import com.obdx.factory.common.BadRequestException;
import com.obdx.factory.common.ConflictException;
import com.obdx.factory.common.Messages;
import com.obdx.factory.common.NotFoundException;
import com.obdx.factory.common.RequestText;
import com.obdx.factory.design.DesignStore;
import com.obdx.factory.design.ScreenDesign;
import com.obdx.factory.design.ScreenDesignRepository;
import com.obdx.factory.design.ScreenModel;
import com.obdx.factory.importing.StorageProperties;
import com.obdx.factory.knowledge.KnowledgeService;
import com.obdx.factory.model.ModelLimitReachedException;
import com.obdx.factory.pack.CheckScope;
import com.obdx.factory.pack.LocalChecks;
import com.obdx.factory.pack.PackService;
import com.obdx.factory.pack.RecipeService;
import com.obdx.factory.target.ScreenScaffolder;
import com.obdx.factory.target.TargetPacks;
import com.obdx.factory.target.TargetService;
import com.obdx.factory.profile.ProjectProfileService;
import com.obdx.factory.requirements.Requirement;
import com.obdx.factory.requirements.RequirementService;
import com.obdx.factory.requirements.RequirementSpec;
import com.obdx.factory.search.CodeSearchService;
import com.obdx.factory.svn.SvnClient;
import com.obdx.factory.workspace.Workspace;
import com.obdx.factory.workspace.WorkspaceRepository;
import com.obdx.factory.workspace.WorkspaceService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.core.task.TaskExecutor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.util.FileSystemUtils;
import tools.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.function.Predicate;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import java.util.stream.Stream;

/**
 * Turns an approved requirement into code: impact analysis produces a plan, a lead approves it, the model writes
 * the files, developers review and edit them, and the result is delivered as a patch or an SVN branch.
 */
@Service
public class ChangeService {

    private static final Logger log = LoggerFactory.getLogger(ChangeService.class);

    private final ChangeRequestRepository changes;
    private final ChangeFileStore files;
    private final WorkspaceRepository workspaces;
    private final WorkspaceService workspaceService;
    private final RequirementService requirements;
    private final ScreenDesignRepository designs;
    private final DesignStore designStore;
    private final ProjectProfileService profiles;
    private final CodeSearchService codeSearch;
    private final ImpactAnalyzer analyzer;
    private final CodeGenerator generator;
    private final SvnClient svn;
    private final StorageProperties storage;
    private final ChangeProperties properties;
    private final JdbcTemplate jdbc;
    private final ObjectMapper json;
    private final ChangeBuildStore builds;
    private final PackService packs;
    private final LocalChecks localChecks;
    private final RecipeService recipes;
    private final TargetService targets;
    private final TargetPacks targetPacks;
    private final TaskExecutor executor;
    private final KnowledgeService knowledge;
    private final PlanReviewStore planReviews;

    public ChangeService(ChangeRequestRepository changes, ChangeFileStore files, WorkspaceRepository workspaces,
                         WorkspaceService workspaceService, RequirementService requirements, ScreenDesignRepository designs,
                         DesignStore designStore, ProjectProfileService profiles, CodeSearchService codeSearch,
                         ImpactAnalyzer analyzer, CodeGenerator generator, SvnClient svn, StorageProperties storage,
                         ChangeProperties properties, JdbcTemplate jdbc, ObjectMapper json, ChangeBuildStore builds,
                         PackService packs, LocalChecks localChecks, RecipeService recipes, TargetService targets,
                         TargetPacks targetPacks, @Qualifier("changeExecutor") TaskExecutor executor, KnowledgeService knowledge,
                         PlanReviewStore planReviews) {
        this.changes = changes;
        this.files = files;
        this.workspaces = workspaces;
        this.workspaceService = workspaceService;
        this.requirements = requirements;
        this.designs = designs;
        this.designStore = designStore;
        this.profiles = profiles;
        this.codeSearch = codeSearch;
        this.analyzer = analyzer;
        this.generator = generator;
        this.svn = svn;
        this.storage = storage;
        this.properties = properties;
        this.jdbc = jdbc;
        this.json = json;
        this.builds = builds;
        this.packs = packs;
        this.localChecks = localChecks;
        this.recipes = recipes;
        this.targets = targets;
        this.targetPacks = targetPacks;
        this.executor = executor;
        this.knowledge = knowledge;
        this.planReviews = planReviews;
    }

    public record FileView(String path, String action, String layer, String purpose, ChangeFileStore.Status status,
                           boolean edited, FileChecks.Status checkStatus, String checkMessage, int attempts,
                           int linesAdded, int linesRemoved) {
    }

    public record ChangeDetail(UUID id, UUID workspaceId, UUID requirementId, String title, ChangeRequest.Status status,
                               String message, Long baseRevision, ChangePlan plan, String planApprovedBy,
                               OffsetDateTime planApprovedAt, String branchUrl, Long deliveredRevision, String createdBy,
                               OffsetDateTime createdAt, OffsetDateTime updatedAt, List<FileView> files,
                               String buildStatus, String buildMessage, List<ChangeBuildStore.Build> builds,
                               ChangeRequest.CloseReason closedReason, String closedBy, OffsetDateTime closedAt,
                               Long branchDeletedRevision) {
    }

    public record ChangeSummary(UUID id, String title, ChangeRequest.Status status, String message, int files,
                                OffsetDateTime updatedAt) {
    }

    public record FileContent(String path, String action, String original, String generated, String diff) {
    }

    // --- create and analyze ---

    @Transactional
    public ChangeDetail create(UUID requirementId, String by) {
        RequirementService.RequirementDetail requirement = requirements.get(requirementId);
        if (requirement.status() != Requirement.Status.APPROVED) {
            throw new BadRequestException("Approve the requirement's spec first");
        }
        List<ScreenDesign> screenDesigns = designs.findByRequirementIdOrderByCreatedAt(requirementId);
        List<String> unapproved = screenDesigns.stream().filter(d -> d.getStatus() != ScreenDesign.Status.APPROVED)
                .map(ScreenDesign::getName).toList();
        if (!unapproved.isEmpty()) {
            throw new BadRequestException("Approve the screen designs first: " + String.join(", ", unapproved));
        }
        Workspace workspace = workspace(requirement.workspaceId());
        if (workspace.getIndexedRevision() == null) {
            throw new BadRequestException("Import the workspace's code first; the change is planned against it");
        }
        ChangeRequest change = changes.save(new ChangeRequest(workspace.getId(), requirementId, requirement.title(), by));
        change.status(ChangeRequest.Status.ANALYZING, "Analyzing the impact on the codebase...");
        changes.save(change);
        startAfterCommit(() -> runAnalysis(change.getId()));
        return detail(change);
    }

    @Transactional
    public ChangeDetail analyzeAgain(UUID id) {
        return analyzeAgain(id, false);
    }

    /**
     * @param fresh true: analyze afresh even when the model's limit stopped the plan part-way (by default such a plan is
     *              continued, when the code and the spec are those it was made from)
     */
    @Transactional
    public ChangeDetail analyzeAgain(UUID id, boolean fresh) {
        ChangeRequest change = find(id);
        requireStatus(change, ChangeRequest.Status.PLAN_READY, ChangeRequest.Status.FAILED);
        change.status(ChangeRequest.Status.ANALYZING, "Analyzing the impact on the codebase...");
        changes.save(change);
        startAfterCommit(() -> runAnalysis(id, fresh));
        return detail(change);
    }

    void runAnalysis(UUID id) {
        runAnalysis(id, false);
    }

    void runAnalysis(UUID id, boolean fresh) {
        ChangeRequest change = find(id);
        try {
            Workspace workspace = workspace(change.getWorkspaceId());
            RequirementService.RequirementDetail requirement = requirements.get(change.getRequirementId());
            ChangeContext context = context(change, requirement);
            List<ImpactAnalyzer.Candidate> candidates = candidates(workspace.getId(), requirement.spec());
            String print = contextPrint(context);
            // A plan the model's limit stopped part-way is completed: its files are kept and only the missing ones asked for
            ChangePlan before = change.getPlan() == null ? null : plan(change);
            boolean resumed = !fresh && resumes(before, workspace.getIndexedRevision(), print);
            ChangePlan analyzed = resumed ? analyzer.resume(context, candidates, existsIn(workspace.getId()), before)
                    : analyzer.analyze(context, candidates, existsIn(workspace.getId()));
            if (analyzed.incomplete() != null) {
                // what a later continuation needs to be the same
                analyzed = new ChangePlan(analyzed.summary(), analyzed.items(), analyzed.risks(),
                        analyzed.incomplete().at(workspace.getIndexedRevision(), print));
            }
            ChangePlan plan = PlanReview.review(analyzed, requirement.spec(), servedPaths(workspace.getId()),
                    sameNamed(workspace.getId(), analyzed), inApp(workspace.getId()));
            String planJson = json.writeValueAsString(plan);
            change.plan(planJson, workspace.getIndexedRevision());
            planReviews.record(id, planJson, PlanReviewStore.Origin.ANALYZED, "Impact analysis");
            long creates = plan.items().stream().filter(i -> "create".equals(i.action())).count();
            String added = resumed ? " The incomplete plan was continued: " + Math.max(0, plan.items().size() - before.items().size())
                    + " file(s) added to the " + before.items().size() + " planned before" + (ImpactAnalyzer.resumable(plan)
                    ? "; the model's limit stopped it again, so files may still be missing." : ".") : "";
            change.status(ChangeRequest.Status.PLAN_READY, "Plan ready: " + plan.items().size() + " file(s), " + creates
                    + " new and " + (plan.items().size() - creates) + " changed." + added + " Review and approve it to generate the code.");
        } catch (RuntimeException | Error e) {
            // An Error too (a stack overflow in a check): the change must not stay "analyzing"
            log.error("Impact analysis of change {} failed", id, e);
            change.status(ChangeRequest.Status.FAILED, "Impact analysis failed: " + Messages.reason(e));
        }
        changes.save(change);
    }

    /**
     * Whether Analyze again continues the plan rather than starting over: the model's limit stopped it part-way, and the
     * code (its revision) and the approved spec and designs are those it was made from. Otherwise the files planned
     * before may not fit, and the analysis starts afresh.
     */
    static boolean resumes(ChangePlan before, Long indexedRevision, String contextPrint) {
        return ImpactAnalyzer.resumable(before) && before.incomplete().revision() != null
                && before.incomplete().revision().equals(indexedRevision) && contextPrint.equals(before.incomplete().context());
    }

    /** A fingerprint of what a plan is made from: the spec and the designs as the model gets them. */
    static String contextPrint(ChangeContext context) {
        try {
            java.security.MessageDigest digest = java.security.MessageDigest.getInstance("SHA-256");
            digest.update(String.valueOf(context.specJson()).getBytes(StandardCharsets.UTF_8));
            digest.update((byte) 0);
            digest.update(String.valueOf(context.designsJson()).getBytes(StandardCharsets.UTF_8));
            return java.util.HexFormat.of().formatHex(digest.digest());
        } catch (java.security.NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    /** Whether a file is in the workspace's React or React Native app (see PlanReview's shell risk). */
    private Predicate<String> inApp(UUID workspaceId) {
        CheckScope scope = packs.scope(workspaceId);
        return scope::inApp;
    }

    // --- plan review ---

    @Transactional
    public ChangeDetail updatePlan(UUID id, String planJson, String by) {
        ChangeRequest change = find(id);
        requireStatus(change, ChangeRequest.Status.PLAN_READY);
        ChangePlan parsed = PlanParser.parse(planJson, existsIn(change.getWorkspaceId()), properties.maxPlanItems());
        ChangePlan previous = change.getPlan() == null ? null : plan(change);
        ChangePlan carried = carryIncomplete(previous, parsed);
        ChangePlan plan = PlanReview.review(carried, requirements.get(change.getRequirementId()).spec(), servedPaths(change.getWorkspaceId()),
                sameNamed(change.getWorkspaceId(), carried), inApp(change.getWorkspaceId()));
        String edited = json.writeValueAsString(plan);
        change.plan(edited, change.getBaseRevision());
        planReviews.record(id, edited, PlanReviewStore.Origin.EDITED, by);
        change.status(ChangeRequest.Status.PLAN_READY, "Plan edited: " + plan.items().size() + " file(s).");
        return detail(changes.save(change));
    }

    /**
     * An edited plan keeps what the server recorded about the plan before it: whether files may be missing (an edit
     * cannot say so or take it away, see PlanParser), with its risk, unless the edit adds files; the reviewer then
     * planned the missing ones.
     */
    static ChangePlan carryIncomplete(ChangePlan previous, ChangePlan edited) {
        if (previous == null || previous.incomplete() == null) {
            return edited;
        }
        Set<String> before = previous.items().stream().map(ChangePlan.Item::path).collect(java.util.stream.Collectors.toSet());
        if (edited.items().stream().anyMatch(i -> !before.contains(i.path()))) {
            return edited;
        }
        List<String> risks = new ArrayList<>(edited.risks() == null ? List.of() : edited.risks());
        risks.add(0, previous.incomplete().risk());
        return new ChangePlan(edited.summary(), edited.items(), risks, previous.incomplete());
    }

    /** Approves the plan and starts writing the code in the background. */
    @Transactional
    public ChangeDetail approvePlan(UUID id, String by) {
        return approvePlan(id, by, false, null);
    }

    /**
     * @param incomplete true: the reviewer confirmed approving a plan that may be missing files (see
     *                   {@link ChangePlan#incomplete()}); without it such a plan is refused with what looks missing
     * @param revision   the plan revision the reviewer confirmed (named in the refusal): a plan changed since is refused
     *                   again, so a confirmation never approves a plan the reviewer did not see
     */
    @Transactional
    public ChangeDetail approvePlan(UUID id, String by, boolean incomplete, Integer revision) {
        ChangeRequest change = find(id);
        requireStatus(change, ChangeRequest.Status.PLAN_READY);
        ChangePlan plan = plan(change);
        Integer latest = planReviews.latest(id);
        if (!incomplete || !java.util.Objects.equals(revision, latest)) {
            requireCompletePlan(plan, requirements.get(change.getRequirementId()).spec(), latest, incomplete);
        }
        change.approvePlan(by);
        planReviews.comment(id, planReviews.record(id, change.getPlan(), PlanReviewStore.Origin.EDITED, by), PlanReviewStore.Kind.APPROVED, by, "");
        files.replaceAll(id, plan.items());
        change.status(ChangeRequest.Status.GENERATING, "Writing " + plan.items().size() + " file(s)...");
        changes.save(change);
        startAfterCommit(() -> runGeneration(id, null, null));
        return detail(change);
    }

    /** How a refused approval of an incomplete plan starts, so the UI can ask the reviewer to confirm it. */
    static final String INCOMPLETE_PLAN = "Incomplete plan: ";
    /** How the refusal names the plan revision to confirm ("revision 3 of the plan"), for the UI to send back. */
    static final String REVISION_NAMED = "revision ";

    static void requireCompletePlan(ChangePlan plan, RequirementSpec spec) {
        requireCompletePlan(plan, spec, null, false);
    }

    /**
     * Refuses a plan the server marked incomplete (see {@link ChangePlan#incomplete()}; never by a risk's text, which a
     * model or an edit could write), naming the plan revision and what looks missing as far as the plan and the spec
     * tell (see {@link PlanReview#gaps}).
     *
     * @param confirmed the reviewer confirmed an incomplete plan, but another revision than the latest
     */
    static void requireCompletePlan(ChangePlan plan, RequirementSpec spec, Integer revision, boolean confirmed) {
        if (plan.incomplete() == null) {
            return;
        }
        List<String> gaps = PlanReview.gaps(plan, spec);
        throw new ConflictException(INCOMPLETE_PLAN + (confirmed ? "the plan changed since you confirmed it. " : "")
                + (revision == null ? "the plan" : REVISION_NAMED + revision + " of the plan") + " may be missing files ("
                + plan.items().size() + " planned): the analysis stopped before it was complete. " + (gaps.isEmpty()
                ? "The factory cannot tell which ones." : "Missing as far as the factory can tell: " + String.join("; ", gaps) + ".")
                + " Analyze again to plan the rest, add them by editing the plan, or approve it as it is.");
    }

    /** The plan's revisions and what reviewers said about them. */
    @Transactional(readOnly = true)
    public PlanReviewStore.Review planReview(UUID id) {
        find(id);
        return planReviews.review(id);
    }

    /**
     * A comment on the current plan, or a request for changes (with its reason) while the plan waits for approval. A
     * request for changes does not change the status: the plan stays unapproved, so no code is generated, until it is
     * edited or analyzed again and approved.
     */
    @Transactional
    public PlanReviewStore.Comment commentOnPlan(UUID id, PlanReviewStore.Kind kind, String text, String by) {
        ChangeRequest change = find(id);
        String body = text == null ? "" : text.strip();
        if (kind == PlanReviewStore.Kind.APPROVED) {
            throw new BadRequestException("Approve the plan with Approve Plan.");
        }
        if (body.isEmpty()) {
            throw new BadRequestException(kind == PlanReviewStore.Kind.CHANGES_REQUESTED
                    ? "Say what has to change in the plan." : "Write the comment first.");
        }
        if (body.length() > 4000) {
            throw new BadRequestException("Keep the comment under 4,000 characters.");
        }
        if (kind == PlanReviewStore.Kind.CHANGES_REQUESTED) {
            requireStatus(change, ChangeRequest.Status.PLAN_READY);
        }
        return planReviews.comment(id, planReviews.latest(id), kind, by, body);
    }

    // --- generation ---

    /** Writes all pending files, or only onlyPath (with the reviewer's note) when given. */
    void runGeneration(UUID id, String onlyPath, String note) {
        runGeneration(id, onlyPath, note, false);
    }

    /**
     * @param resume write only the files not written yet (after generation stopped at the model's limit), keeping the
     *               others as they are
     */
    void runGeneration(UUID id, String onlyPath, String note, boolean resume) {
        ChangeRequest change = find(id);
        String failedAgain = null;
        String writing = null;
        Set<String> writtenNow = new LinkedHashSet<>();
        try {
            Workspace workspace = workspace(change.getWorkspaceId());
            RequirementService.RequirementDetail requirement = requirements.get(change.getRequirementId());
            ChangeContext context = context(change, requirement);
            ChangePlan plan = plan(change);
            Path workingCopy = storage.workingCopy(workspace.getId());
            String revisionNote = "";
            // A resumed generation keeps the base the files already written were read at (Continue refuses when the code
            // moved on since)
            if (onlyPath == null && !resume) {
                if (change.getBaseRevision() != null && !change.getBaseRevision().equals(workspace.getIndexedRevision())) {
                    revisionNote = " The code was updated since the analysis (r" + change.getBaseRevision() + " to r"
                            + workspace.getIndexedRevision() + "); files were read at r" + workspace.getIndexedRevision() + ".";
                }
                change.baseRevision(workspace.getIndexedRevision());
                changes.save(change);
            }

            Map<String, String> earlier = new LinkedHashMap<>();
            for (ChangeFileStore.ChangeFile existing : files.files(id)) {
                if (existing.generated() != null && !existing.path().equals(onlyPath) && !partial(existing)) {
                    earlier.put(existing.path(), existing.generated());
                }
            }
            Set<String> toWrite = resume ? continued(files.files(id)) : null;
            for (int i = 0; i < plan.items().size(); i++) {
                ChangePlan.Item item = plan.items().get(i);
                if ((onlyPath != null && !item.path().equals(onlyPath)) || (toWrite != null && !toWrite.contains(item.path()))) {
                    continue;
                }
                if (onlyPath == null) {
                    change.status(ChangeRequest.Status.GENERATING, "Writing file " + (i + 1) + " of " + plan.items().size() + ": " + item.path());
                    change = changes.save(change);
                }
                String fileNote = note;
                if (onlyPath != null) {
                    String fixes = files.file(id, item.path()).map(f -> crossFileFixes(f.checkMessage())).orElse("");
                    fileNote = fixes.isEmpty() ? note : note == null || note.isBlank() ? fixes : note + "\n\n" + fixes;
                }
                // Continue and Write again go on from the part of a file (or of its rewrite) the limit stopped, instead of writing it all again
                // (Write again with a reviewer's note starts afresh: the kept part was written without it)
                boolean resumes = resume || onlyPath != null && (note == null || note.isBlank());
                Kept partial = resumes ? files.file(id, item.path()).map(kept -> resumable(files, id, kept)).orElse(null) : null;
                writing = item.path();
                writtenNow.add(item.path());
                String error = generateFile(id, workspace.getId(), context, plan, item, workingCopy, earlier, fileNote, partial);
                if (onlyPath != null) {
                    failedAgain = error;
                }
            }

            Map<String, String> unfit = crossCheck(id, workspace.getId());
            String fixesStopped = "";
            // (also when Continue finished the files the model's limit stopped: the run it stopped fixed none of them)
            List<String> toFit = onlyPath == null && properties.fixAttempts() > 0
                    ? toFit(unfit, writtenNow, files.files(id), resume) : List.of();
            if (!toFit.isEmpty()) {
                // Certain errors only the other files show (a method the called class lacks): each file written now is fixed once
                CheckScope scope = packs.scope(workspace.getId());
                writing = null;
                for (int k = 0; k < toFit.size(); k++) {
                    String path = toFit.get(k);
                    ChangePlan.Item item = plan.items().stream().filter(i -> i.path().equals(path)).findFirst().orElse(null);
                    if (item == null) {
                        continue;
                    }
                    change.status(ChangeRequest.Status.GENERATING, "Fixing " + item.path() + ", which does not fit the other files");
                    change = changes.save(change);
                    try {
                        fitToOthers(files, generator, localChecks, scope, id, context, plan, item, crossFileFixes(unfit.get(path)),
                                scaffold(context, path, files.file(id, path).map(ChangeFileStore.ChangeFile::original).orElse(null)));
                    } catch (ModelLimitReachedException e) {
                        // Every file is written; only these fixes wait for the model
                        log.warn("Fixing the files of change {} by the other files stopped at the model's limit: {}", id, e.getMessage());
                        fixesStopped = fixesStopped(toFit.subList(k, toFit.size()), e);
                        files.markFitDue(id, toFit.subList(k, toFit.size()));
                        break;
                    }
                }
                crossCheck(id, workspace.getId());
            }
            // Says whether a version is still there: a file that had none has none after a failed Write again
            boolean versionKept = onlyPath != null && files.file(id, onlyPath).map(f -> f.generated() != null && !partial(f)).orElse(false);
            change.status(ChangeRequest.Status.GENERATED, (onlyPath == null ? ""
                    : failedAgain != null ? "Writing " + onlyPath + " again failed (" + failedAgain + "); "
                    + (versionKept ? "the previous version is kept. " : "it is not written yet. ")
                    : onlyPath + " written again. ") + summary(files.files(id)) + revisionNote + fixesStopped);
        } catch (ModelLimitReachedException e) {
            // Every further file would fail the same way: stop, and leave the rest to Continue generation
            log.warn("Code generation for change {} stopped at the model's limit: {}", id, e.getMessage());
            if (onlyPath == null) {
                // The files this run wrote get their fix by the cross-check when Continue finishes the rest
                files.markFitDue(id, writtenNow);
            }
            try {
                crossCheck(id, change.getWorkspaceId());
            } catch (RuntimeException | StackOverflowError checkFailed) {
                // The change must not stay "generating" because a check could not run
                log.warn("Cross-file checks of change {} failed", id, checkFailed);
            }
            List<ChangeFileStore.ChangeFile> result = files.files(id);
            long written = result.stream().filter(f -> f.status() == ChangeFileStore.Status.GENERATED
                    || f.status() == ChangeFileStore.Status.UNCHANGED).count();
            String kept = e instanceof CodeGenerator.Partial p && p.check() == null ? writing : null;
            change.status(ChangeRequest.Status.GENERATED, stoppedMessage(e, onlyPath, written, result.size(), kept));
        } catch (RuntimeException | Error e) {
            // An Error too (a stack overflow in a check): the change must not stay "generating"
            log.error("Code generation for change {} failed", id, e);
            // Writing one file again, or the rest of them, leaves the files already written to review
            change.status(onlyPath != null || resume ? ChangeRequest.Status.GENERATED : ChangeRequest.Status.FAILED,
                    "Code generation failed: " + Messages.reason(e));
        }
        changes.save(change);
    }

    /** What the change says when the model's limit stopped the cross-check fixes: every file is written, these were not fixed. */
    static String fixesStopped(List<String> skipped, RuntimeException limit) {
        return " The model's limit (" + Messages.reason(limit) + ") stopped the fixes of what the cross-checks found; not fixed: "
                + String.join(", ", skipped) + ". Every file is written: Write again a file to fix it.";
    }

    /** The most files of one generation fixed by what the cross-check found, so their model calls stay bounded. */
    static final int MAX_CROSS_FIXES = 5;

    /**
     * The files a generation fixes by what the cross-check found: those it wrote itself in this run, written by the
     * model (a reviewer's edit is never rewritten), at most {@link #MAX_CROSS_FIXES}.
     */
    static List<String> toFit(Map<String, String> unfit, Set<String> writtenNow, List<ChangeFileStore.ChangeFile> all) {
        return toFit(unfit, writtenNow, all, false);
    }

    /**
     * @param resume the generation is Continue's: the files an earlier run wrote whose fix is still due (that run was
     *               stopped by the model's limit before it could fix them, see {@link ChangeFileStore.ChangeFile#fitDue()})
     *               are fixed too, after those written now. Never a file whose fix was tried already, nor one written
     *               again since (both clear the mark). Certain errors in the code (a method the called class lacks, a
     *               define list that binds the wrong modules) come before a view's bindings, within the same limit of
     *               {@link #MAX_CROSS_FIXES}.
     */
    static List<String> toFit(Map<String, String> unfit, Set<String> writtenNow, List<ChangeFileStore.ChangeFile> all, boolean resume) {
        List<ChangeFileStore.ChangeFile> fixable = all.stream().filter(f -> unfit.containsKey(f.path()) && !f.edited()
                && f.status() == ChangeFileStore.Status.GENERATED && f.generated() != null
                && (writtenNow.contains(f.path()) || resume && f.fitDue())).toList();
        java.util.Comparator<ChangeFileStore.ChangeFile> order = java.util.Comparator
                .comparingInt((ChangeFileStore.ChangeFile f) -> onlyBindings(unfit.get(f.path())) ? 1 : 0)
                .thenComparingInt(f -> writtenNow.contains(f.path()) ? 0 : 1);
        return fixable.stream().sorted(order).map(ChangeFileStore.ChangeFile::path).limit(MAX_CROSS_FIXES).toList();
    }

    /** Whether the certain errors of a file's findings are only a view's bindings (less sure than the code's errors). */
    static boolean onlyBindings(String findings) {
        return findings != null && findings.lines().filter(ChangeService::crossError)
                .allMatch(line -> line.startsWith(ViewBindings.UNDEFINED_IN_CHANGE));
    }

    /**
     * Fixes a written file once by what the cross-check found against the other files of the change: the model gets the
     * file and the findings, as when a failed check is fixed. The fix is kept only when it is whole (not cut off at the
     * output limit, joined cleanly) and the file's own checks find it no worse than before; otherwise the file stays as
     * it was. Returns whether the fix was kept.
     */
    static boolean fitToOthers(ChangeFileStore files, CodeGenerator generator, LocalChecks checks, CheckScope scope, UUID changeId,
                               ChangeContext context, ChangePlan plan, ChangePlan.Item item, String note, ScreenScaffolder.Scaffold scaffold) {
        ChangeFileStore.ChangeFile file = files.file(changeId, item.path()).orElse(null);
        if (file == null || file.generated() == null || file.edited() || note.isEmpty()) {
            return false;
        }
        Map<String, String> others = new LinkedHashMap<>();
        files.files(changeId).stream().filter(f -> f.generated() != null && !f.path().equals(item.path()) && !partial(f))
                .forEach(f -> others.put(f.path(), f.generated()));
        CodeGenerator.Result result;
        try {
            result = generator.fixFindings(context, plan, item, file.generated(), file.original(), others, note, scaffold);
        } catch (CodeGenerator.JoinFailed e) {
            log.warn("The fix of {} in change {} did not join cleanly; the file is kept as it is", item.path(), changeId);
            files.fitTried(changeId, item.path());
            return false;
        }
        // Tried once, whatever comes of it (a later Continue does not ask again)
        files.fitTried(changeId, item.path());
        if (result == null || result.content().equals(file.generated())) {
            return false;
        }
        FileChecks.Status before = CodeGenerator.withParity(checks.check(scope, item.path(), file.original(), file.generated()),
                file.generated(), scaffold).status();
        if (severity(result.check().status()) > severity(before)) {
            log.info("The fix of {} in change {} made its own checks worse ({} after {}); the file is kept as it is", item.path(), changeId,
                    result.check().status(), before);
            return false;
        }
        // A view's own checks do not see its bindings: its fix is kept only when it binds fewer names its view model lacks
        ViewModel viewModel = item.path().toLowerCase(java.util.Locale.ROOT).endsWith(".html") ? viewModel(item.path(), others, null) : null;
        if (viewModel != null && ViewBindings.missing(result.content(), viewModel.content()).size()
                >= ViewBindings.missing(file.generated(), viewModel.content()).size()) {
            log.info("The fix of {} in change {} does not bind fewer names its view model lacks; the file is kept as it is", item.path(),
                    changeId);
            return false;
        }
        files.saveResult(changeId, item.path(), ChangeFileStore.Status.GENERATED, file.original(), result.content(), false,
                result.check(), file.attempts() + result.attempts());
        return true;
    }

    private static int severity(FileChecks.Status status) {
        return status == FileChecks.Status.FAILED ? 2 : status == FileChecks.Status.WARNING ? 1 : 0;
    }

    /**
     * The files a resumed generation writes: those not written yet, or that could not be written, except those that can
     * never be (too large, or a link outside the working copy: "change it by hand"). Those still count as not written
     * for delivery.
     */
    static Set<String> notWritten(List<ChangeFileStore.ChangeFile> files) {
        Set<String> paths = new LinkedHashSet<>();
        files.stream().filter(f -> f.status() == ChangeFileStore.Status.PENDING || (f.status() == ChangeFileStore.Status.FAILED
                && f.generated() == null && (f.checkMessage() == null || !f.checkMessage().contains(BY_HAND)))
                || partial(f)).forEach(f -> paths.add(f.path()));
        return paths;
    }

    /** A file the model's limit stopped part-way: its part is kept, but it is not written. */
    static boolean partial(ChangeFileStore.ChangeFile f) {
        return f.status() == ChangeFileStore.Status.FAILED && f.generated() != null && f.checkMessage() != null
                && f.checkMessage().startsWith(CodeGenerator.PARTIAL);
    }

    /** How the message of a file that can never be written ends. */
    static final String BY_HAND = "change it by hand";

    /**
     * Why Continue cannot go on: the code was imported again since the files already written were read, so the rest
     * would be written against other code and the delivery based on the old revision. Null when it can.
     */
    static String resumeProblem(Long base, Long indexed) {
        if (base == null || base.equals(indexed)) {
            return null;
        }
        return "The code was updated since the files were written (r" + base + " to r" + indexed + "), so the remaining files would not "
                + "fit them. Analyze the change again, or write the files that need it with Write again.";
    }

    /** "8 file(s) written, 1 with problems, 2 with warnings, 3 not written yet. Review ..." */
    static String summary(List<ChangeFileStore.ChangeFile> result) {
        long failed = result.stream().filter(f -> f.status() == ChangeFileStore.Status.FAILED
                || f.checkStatus() == FileChecks.Status.FAILED).count();
        long warnings = result.stream().filter(f -> f.checkStatus() == FileChecks.Status.WARNING).count();
        long written = result.stream().filter(f -> f.status() == ChangeFileStore.Status.GENERATED).count();
        long pending = result.stream().filter(f -> f.status() == ChangeFileStore.Status.PENDING).count();
        return written + " file(s) written, " + failed + " with problems, " + warnings + " with warnings"
                + (pending > 0 ? ", " + pending + " not written yet (Continue generation)" : "") + ". Review the changes before delivering them.";
    }

    /**
     * What the change says when the model's limit stopped it: why, how far it got, and when and how to go on ("Try again
     * in about 15 minutes, then click Continue generation.").
     */
    static String stoppedMessage(ModelLimitReachedException e, String onlyPath, long written, int planned) {
        return stoppedMessage(e, onlyPath, written, planned, null);
    }

    /** @param kept a file the limit stopped part-way, whose part is kept for Continue to go on from, or null */
    static String stoppedMessage(ModelLimitReachedException e, String onlyPath, long written, int planned, String kept) {
        String message = stopped(e, onlyPath, written, planned);
        if (kept == null) {
            return message;
        }
        return onlyPath != null ? message + " The rewrite written so far is kept beside it; Write again (or Continue) goes on from it."
                : message + " The part of " + kept + " written so far is kept; Continue generation goes on from it.";
    }

    private static String stopped(ModelLimitReachedException e, String onlyPath, long written, int planned) {
        String when = e.retryIn() != null ? "in " + e.retryIn() : null;
        if (onlyPath != null) {
            return "Writing " + onlyPath + " again stopped: " + limitReason(e) + " The previous version is kept; write it again "
                    + (when != null ? when + "." : "later.");
        }
        return limitReason(e) + " Generation stopped after " + written + " of " + planned + " file(s); the files already written are "
                + "kept." + (when != null ? " Try again " + when + ", then click Continue generation."
                : " Click Continue generation when the limit resets.");
    }

    static String limitReason(ModelLimitReachedException e) {
        return e.daily() ? "The model's daily limit is used up." : "The model's server is at its rate limit.";
    }

    /**
     * Writes one file and saves it. A file that could not be written is saved as FAILED, unless it had been written
     * before (Write again): then the earlier content and its check stay, and the error is returned. The model's limit
     * is passed on, so generation stops.
     *
     * @return why the file could not be written, or null
     */
    private String generateFile(UUID changeId, UUID workspaceId, ChangeContext context, ChangePlan plan, ChangePlan.Item item,
                                Path workingCopy, Map<String, String> earlier, String note, Kept partial) {
        boolean modify = "modify".equals(item.action());
        String current = null;
        try {
            if (modify) {
                Path file = workingCopy.resolve(item.path());
                if (!within(workingCopy, file)) {
                    throw new IOException("it is a link to a file outside the working copy; change it by hand");
                }
                if (Files.size(file) > properties.maxFileSize().toBytes()) {
                    files.saveResult(changeId, item.path(), ChangeFileStore.Status.FAILED, read(file), null, false,
                            new FileChecks.Result(FileChecks.Status.FAILED, "The file is too large to rewrite safely; change it by hand."), 0);
                    return "the file is too large to rewrite safely";
                }
                current = read(file);
            }
            Map<String, String> examples = examples(workspaceId, workingCopy, item);
            ScreenScaffolder.Scaffold scaffold = scaffold(context, item.path(), current);
            CodeGenerator.Result result = generator.generate(context, plan, item, current, current, examples, earlier, note, scaffold,
                    partial == null ? null : partial.text(), partial != null && partial.complete());
            ChangeFileStore.Status status = modify && result.content().equals(current)
                    ? ChangeFileStore.Status.UNCHANGED : ChangeFileStore.Status.GENERATED;
            files.saveResult(changeId, item.path(), status, current, result.content(), false, result.check(), result.attempts());
            earlier.put(item.path(), result.content());
            return null;
        } catch (CodeGenerator.Partial e) {
            recordPartial(files, changeId, item.path(), current, e);
            throw e;
        } catch (ModelLimitReachedException e) {
            throw e;
        } catch (IOException | RuntimeException | StackOverflowError e) {
            return recordFailure(files, changeId, item.path(), current, e);
        }
    }

    /**
     * Keeps the part of a file the model's limit stopped. A file without a version yet keeps it as its content, marked
     * "Cut off" (not written); a file with one (Write again) keeps that version as its content and the new part beside it.
     */
    static void recordPartial(ChangeFileStore files, UUID changeId, String path, String current, CodeGenerator.Partial e) {
        ChangeFileStore.ChangeFile previous = files.file(changeId, path).orElse(null);
        boolean none = previous == null || previous.generated() == null || partial(previous);
        if (e.check() != null && none) {
            // A whole answer whose fix the limit stopped: the file's content, with the check it failed (Write again fixes it)
            files.saveResult(changeId, path, ChangeFileStore.Status.GENERATED, current, e.content(), false, e.check(), 1);
            return;
        }
        if (none) {
            // Kept for the reviewer to see and for Continue to go on from; it still counts as not written
            files.saveResult(changeId, path, ChangeFileStore.Status.FAILED, current, e.content(), false,
                    new FileChecks.Result(FileChecks.Status.FAILED, CodeGenerator.PARTIAL + " Continue generation goes on from here "
                            + "when the limit resets, or write it again."), 1);
        } else {
            // A rewrite (Write again) stopped part-way: the version written before stays the file's content for review and
            // delivery; the new part is kept beside it, and the next Write again or Continue goes on from it
            files.saveRewrite(changeId, path, e.content(), e.check() != null);
        }
    }

    /** What Continue writes: the files not written yet, and the rewrites the model's limit stopped part-way. */
    static Set<String> continued(List<ChangeFileStore.ChangeFile> files) {
        Set<String> paths = notWritten(files);
        files.stream().filter(f -> f.rewrite() != null).forEach(f -> paths.add(f.path()));
        return paths;
    }

    /** "Rewrite in progress: ..." before a file's own check message while a stopped rewrite is kept beside it. */
    static String withRewrite(ChangeFileStore.ChangeFile f) {
        if (f.rewrite() == null) {
            return f.checkMessage();
        }
        String rewrite = "Rewrite in progress: " + f.rewrite().length() + " characters written; Write again (or Continue) goes on from it.";
        return f.checkMessage() == null ? rewrite : rewrite + "\n" + f.checkMessage();
    }

    /**
     * The part of a file to go on from: a kept partial, or the part of a stopped rewrite, cleaned (and saved so); null
     * when there is none, or too little of it is usable.
     */
    static Kept resumable(ChangeFileStore files, UUID changeId, ChangeFileStore.ChangeFile file) {
        if (partial(file)) {
            String usable = usablePartial(files, changeId, file);
            return usable == null ? null : new Kept(usable, false);
        }
        if (file.rewrite() == null) {
            return null;
        }
        if (file.rewriteComplete()) {
            // a whole answer: checked and fixed as it is
            return new Kept(file.rewrite(), true);
        }
        String cleaned = CodeGenerator.cleanPartial(file.path(), file.rewrite());
        if (!java.util.Objects.equals(cleaned, file.rewrite())) {
            files.saveRewrite(changeId, file.path(), cleaned);
        }
        return cleaned == null ? null : new Kept(cleaned, false);
    }

    /** A kept part of a file to go on from, and whether it is a whole answer (checked and fixed) rather than a part (continued). */
    record Kept(String text, boolean complete) {
    }

    /**
     * The kept part of a file to continue from, cleaned first (the model's reasoning and a seam that does not parse cut
     * off) and saved so: a broken part is not paid for on every Continue. Null when too little is usable; the file is
     * then saved as not written and written whole.
     */
    static String usablePartial(ChangeFileStore files, UUID changeId, ChangeFileStore.ChangeFile kept) {
        String cleaned = CodeGenerator.cleanPartial(kept.path(), kept.generated());
        if (cleaned == null) {
            files.saveResult(changeId, kept.path(), ChangeFileStore.Status.FAILED, kept.original(), null, false,
                    new FileChecks.Result(FileChecks.Status.FAILED, "The part kept after the model's limit was not usable; it is written whole."),
                    kept.attempts());
        } else if (!cleaned.equals(kept.generated())) {
            files.saveResult(changeId, kept.path(), ChangeFileStore.Status.FAILED, kept.original(), cleaned, false,
                    new FileChecks.Result(FileChecks.Status.FAILED, kept.checkMessage()), kept.attempts());
        }
        return cleaned;
    }

    /**
     * Saves why a file could not be written, and returns it. Pieces that did not join leave no content and no partial:
     * the file counts as not written, and Continue writes it whole instead of failing on the same text again. Any other
     * failure keeps a version written before (Write again, or a kept partial), so it is not thrown away.
     */
    static String recordFailure(ChangeFileStore files, UUID changeId, String path, String current, Throwable e) {
        ChangeFileStore.ChangeFile previous = files.file(changeId, path).orElse(null);
        int attempts = previous == null ? 0 : previous.attempts();
        if (e instanceof CodeGenerator.JoinFailed && previous != null && previous.generated() != null && !partial(previous)) {
            // A version written before (and any edit of it) stays; a rewrite that did not join is dropped, so the next Write
            // again starts afresh
            log.warn("{} of change {}: {} The version before is kept.", path, changeId, e.getMessage());
            if (previous.rewrite() != null) {
                files.saveRewrite(changeId, path, null);
            }
            return e.getMessage();
        }
        if (e instanceof CodeGenerator.JoinFailed) {
            // Expected when a model continues badly: one line, no stack trace
            log.warn("{} of change {}: {}", path, changeId, e.getMessage());
            files.saveResult(changeId, path, ChangeFileStore.Status.FAILED, current, null, false,
                    new FileChecks.Result(FileChecks.Status.FAILED, e.getMessage()), attempts);
            return e.getMessage();
        }
        log.warn("Could not write {} for change {}", path, changeId, e);
        if (previous != null && previous.generated() != null) {
            // Written before: a failed attempt to write it again must not throw that version away
            return Messages.reason(e);
        }
        files.saveResult(changeId, path, ChangeFileStore.Status.FAILED, current, null, false,
                new FileChecks.Result(FileChecks.Status.FAILED, "Could not be written: " + Messages.reason(e)), 0);
        return Messages.reason(e);
    }

    private static final Pattern PACKAGE = Pattern.compile("(?m)^\\s*package\\s+([a-zA-Z_]\\w*\\.[a-zA-Z_]\\w*)[\\w.]*\\s*;");
    /** import com.bank.x.Name; (not static imports or wildcards) */
    private static final Pattern IMPORT = Pattern.compile("(?m)^\\s*import\\s+([a-z_][\\w.]*)\\s*;");

    /**
     * Classes a Java file imports from the bank's own packages (those starting like its own package, com.bank) that
     * are neither in the codebase nor in this change: the model used a class nobody writes, and the build will fail.
     * A package the code has no file in comes from a library (OBDX's own com.ofss.digx jars, for extension code), so its
     * imports are not checked.
     *
     * @param classExists   whether a class file (com/bank/x/Name.java, as the end of a path) is in the code or the change
     * @param packageExists whether a package folder (com/bank/x) holds a file in the code or the change
     */
    static List<String> unresolvedImports(String content, Predicate<String> classExists, Predicate<String> packageExists) {
        return unresolvedImports(content, classExists, packageExists, null, folder -> false);
    }

    /**
     * @param bankRoot       the bank's root package (the common prefix of the indexed code's packages, com.bank.obdx), or null
     * @param missingCounts  for an import under the bank's root whose package folder has no file: whether that folder
     *                       still belongs to the bank (the change creates it, or a sibling package is indexed), rather
     *                       than to a library or generated code
     */
    static List<String> unresolvedImports(String content, Predicate<String> classExists, Predicate<String> packageExists, String bankRoot,
                                          Predicate<String> missingCounts) {
        if (content == null) {
            return List.of();
        }
        Matcher pkg = PACKAGE.matcher(content);
        if (!pkg.find()) {
            return List.of();
        }
        String own = pkg.group(1) + ".";
        List<String> missing = new ArrayList<>();
        Matcher imports = IMPORT.matcher(content);
        while (imports.find()) {
            // com.bank.x.Outer.Inner is in com/bank/x/Outer.java: the class file is the first name with a capital
            String[] parts = imports.group(1).split("\\.");
            int cls = 0;
            while (cls < parts.length && (parts[cls].isEmpty() || !Character.isUpperCase(parts[cls].charAt(0)))) {
                cls++;
            }
            if (cls == 0 || cls == parts.length) {
                continue;
            }
            String folder = String.join("/", java.util.Arrays.copyOfRange(parts, 0, cls));
            String name = folder.replace('/', '.') + "." + parts[cls];
            boolean bank = bankRoot != null && name.startsWith(bankRoot + ".");
            if ((name.startsWith(own) || bank) && !classExists.test(folder + "/" + parts[cls] + ".java")
                    && (packageExists.test(folder) || (bank && missingCounts.test(folder)))) {
                missing.add(name);
            }
        }
        return missing;
    }

    /** The indexed Java files named like the classes the plan creates (FundTransferService -> its existing paths). */
    private Map<String, List<String>> sameNamed(UUID workspaceId, ChangePlan plan) {
        Map<String, List<String>> found = new LinkedHashMap<>();
        for (ChangePlan.Item item : plan.items()) {
            // (and the UI's shell files, by their whole file name: a new dashboard.js beside an existing one is glue)
            if ("create".equals(item.action()) && (item.path().endsWith(".java") || PlanReview.shellName(item.path()))) {
                String file = item.path().substring(item.path().lastIndexOf('/') + 1);
                List<String> paths = jdbc.queryForList("SELECT path FROM code_file WHERE workspace_id = ? AND (path = ? OR path LIKE ?) LIMIT 5",
                        String.class, workspaceId, file, "%/" + file.replace("_", "\\_").replace("%", "\\%"));
                if (!paths.isEmpty()) {
                    found.put(file.replaceAll("\\.java$", ""), paths);
                }
            }
        }
        return found;
    }

    /**
     * Whether a package folder under the bank's root with no indexed file belongs to the bank, so that an import from it
     * of a class nobody has is wrong: the change creates files in it, or it is any package of the bank's own root
     * (com.bank.obdx.payments.payments, a package the model made up) other than generated code (generated, gen, stub),
     * which the build makes and the index does not have.
     */
    static boolean bankFolder(String folder, List<String> planned) {
        if (planned.stream().anyMatch(p -> inFolder(p, folder))) {
            return true;
        }
        return java.util.Arrays.stream(folder.split("/")).noneMatch(part -> part.matches("(?i)generated|gen|stubs?"));
    }

    /** The bank's root package by workspace, for the indexed revision it was read at. */
    private final Map<UUID, Map.Entry<Long, String>> bankRoots = new java.util.concurrent.ConcurrentHashMap<>();

    /** The bank's root package from the indexed Java code's package lines, or null (see {@link #commonRoot}). */
    private String bankRoot(UUID workspaceId) {
        Long revision = workspaces.findById(workspaceId).map(Workspace::getIndexedRevision).orElse(null);
        Map.Entry<Long, String> cached = bankRoots.get(workspaceId);
        if (cached != null && java.util.Objects.equals(cached.getKey(), revision)) {
            return cached.getValue();
        }
        String root = readBankRoot(workspaceId);
        bankRoots.put(workspaceId, new java.util.AbstractMap.SimpleImmutableEntry<>(revision, root));
        return root;
    }

    private String readBankRoot(UUID workspaceId) {
        List<String> packages = jdbc.queryForList("SELECT DISTINCT substring(content from '(?n)^\\s*package\\s+([a-zA-Z_][a-zA-Z0-9_.]*)\\s*;') "
                + "FROM code_chunk WHERE workspace_id = ? AND language = 'java' LIMIT 5000", String.class, workspaceId);
        return commonRoot(packages);
    }

    /**
     * The longest package prefix the bank's own packages share (com.bank.obdx for com.bank.obdx.payments and
     * com.bank.obdx.accounts), leaving out Oracle's and Java's; null when it has fewer than two parts.
     */
    static String commonRoot(List<String> packages) {
        List<String[]> own = packages.stream().filter(p -> p != null && !p.isBlank())
                .filter(p -> !p.startsWith("com.ofss.") && !p.startsWith("oracle.") && !p.startsWith("java.") && !p.startsWith("javax."))
                .map(p -> p.split("\\.")).toList();
        if (own.isEmpty()) {
            return null;
        }
        List<String> root = new ArrayList<>(List.of(own.getFirst()));
        for (String[] p : own) {
            int n = 0;
            while (n < root.size() && n < p.length && root.get(n).equals(p[n])) {
                n++;
            }
            root = new ArrayList<>(root.subList(0, n));
        }
        return root.size() < 2 ? null : String.join(".", root);
    }

    /** The REST paths the imported Java code serves (from its @Path annotations), each with the file that serves it. */
    private Map<String, String> servedPaths(UUID workspaceId) {
        Map<String, String> served = new LinkedHashMap<>();
        jdbc.query("SELECT path, string_agg(content, chr(10) ORDER BY start_line) AS content FROM code_chunk WHERE workspace_id = ? "
                        + "AND language = 'java' AND content LIKE '%@Path%' GROUP BY path", rs -> {
            for (String p : PlanReview.pathsIn(rs.getString("content"))) {
                served.putIfAbsent(p, rs.getString("path"));
            }
        }, workspaceId);
        return served;
    }

    /** Whether the imported code has a file whose path ends with classFile. */
    private boolean indexed(UUID workspaceId, String classFile) {
        String like = "%/" + classFile.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
        return Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS (SELECT 1 FROM code_file WHERE workspace_id = ? AND (path LIKE ? OR path = ?))",
                Boolean.class, workspaceId, like, classFile));
    }

    /** Whether the imported code has a file directly in a folder whose path ends with folder (com/bank/x). */
    private boolean indexedFolder(UUID workspaceId, String folder) {
        String regex = "(^|/)" + folder.replaceAll("[^\\w/]", "\\\\$0") + "/[^/]+$";
        return Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS (SELECT 1 FROM code_file WHERE workspace_id = ? AND path ~ ?)",
                Boolean.class, workspaceId, regex));
    }

    /** Whether path is a file directly in a folder whose path ends with folder. */
    static boolean inFolder(String path, String folder) {
        int slash = path.lastIndexOf('/');
        String parent = slash < 0 ? "" : path.substring(0, slash);
        return parent.equals(folder) || parent.endsWith("/" + folder);
    }

    /**
     * Files to imitate: the plan's basedOn files, then the reference examples of the version pack recipe for this
     * kind of file (pinned by developers or found in the codebase), else a file of the same type in the same folder.
     */
    private Map<String, String> examples(UUID workspaceId, Path workingCopy, ChangePlan.Item item) throws IOException {
        Map<String, String> examples = new LinkedHashMap<>();
        List<String> paths = new ArrayList<>(item.basedOn());
        paths.addAll(recipes.examplesFor(workspaceId, item.path(), item.action(), item.layer()));
        for (String path : paths) {
            Path file = workingCopy.resolve(path);
            if (examples.size() < 2 && !path.equals(item.path()) && !examples.containsKey(path) && Files.isRegularFile(file) && within(workingCopy, file)
                    && Files.size(file) <= properties.maxFileSize().toBytes()) {
                examples.put(path, read(file));
            }
        }
        if (examples.isEmpty() && "create".equals(item.action())) {
            Path folder = workingCopy.resolve(item.path()).getParent();
            String extension = item.path().contains(".") ? item.path().substring(item.path().lastIndexOf('.')) : "";
            if (folder != null && Files.isDirectory(folder)) {
                try (Stream<Path> siblings = Files.list(folder)) {
                    Path sibling = siblings.filter(p -> p.getFileName().toString().endsWith(extension) && Files.isRegularFile(p) && within(workingCopy, p))
                            .sorted().findFirst().orElse(null);
                    if (sibling != null && Files.size(sibling) <= properties.maxFileSize().toBytes()) {
                        examples.put(workingCopy.relativize(sibling).toString().replace('\\', '/'), read(sibling));
                    }
                }
            }
        }
        return examples;
    }

    /** The largest file a reviewer's edit may save: it is stored, checked and put in the patch. */
    static final int MAX_EDIT_BYTES = 512 * 1024;

    static void requireEditable(String content) {
        if (content != null && content.length() > MAX_EDIT_BYTES / 4
                && content.getBytes(StandardCharsets.UTF_8).length > MAX_EDIT_BYTES) {
            throw new BadRequestException("The file is larger than " + MAX_EDIT_BYTES / 1024 + " KB, the most the factory keeps for a "
                    + "change. Make a change this large in your working copy, outside the factory.");
        }
    }

    /** Writes the files not written yet, for example after generation stopped at the model's daily limit. */
    @Transactional
    public ChangeDetail continueGeneration(UUID id) {
        ChangeRequest change = find(id);
        requireStatus(change, ChangeRequest.Status.GENERATED);
        requireNotBuilding(change);
        String moved = resumeProblem(change.getBaseRevision(), workspace(change.getWorkspaceId()).getIndexedRevision());
        if (moved != null) {
            throw new BadRequestException(moved);
        }
        int left = continued(files.files(id)).size();
        if (left == 0) {
            throw new BadRequestException("No file is left that the model can write. Use Write again for a single file; files marked "
                    + "to change by hand need a developer.");
        }
        // Claimed in the database: of two clicks at once only one finds the change GENERATED; the other waits for the row
        // and then finds it running
        String message = "Writing the " + left + " file(s) not written yet...";
        if (jdbc.update("UPDATE change_request SET status = 'GENERATING', message = ?, updated_at = now() WHERE id = ? AND status = 'GENERATED'",
                message, id) != 1) {
            throw new ConflictException("Generation is already running for this change. Wait for it to finish.");
        }
        change.status(ChangeRequest.Status.GENERATING, message);
        changes.save(change);
        startAfterCommit(() -> runGeneration(id, null, null, true));
        return detail(change);
    }

    /** Writes one file again, with an optional instruction from the reviewer. */
    @Transactional
    public ChangeDetail regenerate(UUID id, String path, String note) {
        RequestText.requirePath(path);
        RequestText.requireText(note);
        ChangeRequest change = find(id);
        requireStatus(change, ChangeRequest.Status.GENERATED);
        requireNotBuilding(change);
        files.file(id, path).orElseThrow(() -> new NotFoundException("No file " + path + " in this change"));
        change.status(ChangeRequest.Status.GENERATING, "Writing " + path + " again...");
        changes.save(change);
        startAfterCommit(() -> runGeneration(id, path, note));
        return detail(change);
    }

    /** Saves a reviewer's own edit of a generated file. */
    @Transactional
    public ChangeDetail editFile(UUID id, String path, String content) {
        RequestText.requirePath(path);
        RequestText.requireText(content);
        requireEditable(content);
        ChangeRequest change = find(id);
        requireStatus(change, ChangeRequest.Status.GENERATED);
        requireNotBuilding(change);
        ChangeFileStore.ChangeFile file = files.file(id, path).orElseThrow(() -> new NotFoundException("No file " + path + " in this change"));
        String text = content == null ? "" : content.endsWith("\n") || content.isEmpty() ? content : content + "\n";
        files.saveResult(id, path, text.equals(file.original()) ? ChangeFileStore.Status.UNCHANGED : ChangeFileStore.Status.GENERATED,
                file.original(), text, true, localChecks.check(packs.scope(change.getWorkspaceId()), path, file.original(), text),
                file.attempts());
        return detail(change);
    }

    /** Runs the quick checks again on every written file, for example after version pack rules were changed. */
    @Transactional
    public ChangeDetail checkAgain(UUID id) {
        ChangeRequest change = find(id);
        requireStatus(change, ChangeRequest.Status.GENERATED, ChangeRequest.Status.DELIVERED);
        requireNotBuilding(change);
        recheck(change);
        if (change.getStatus() == ChangeRequest.Status.GENERATED) {
            // The message said what the last generation found; it is out of date now
            change.status(ChangeRequest.Status.GENERATED, "Checked again: " + summary(files.files(id)));
            changes.save(change);
        }
        return detail(change);
    }

    /** Checks the written files of the change again and saves the results; returns the files with errors and their findings. */
    Map<String, String> recheck(ChangeRequest change) {
        CheckScope scope = packs.scope(change.getWorkspaceId());
        List<ScreenModel> models = scope.appFolder() == null ? List.of() : designModels(change);
        Map<String, String> failing = new LinkedHashMap<>();
        for (ChangeFileStore.ChangeFile file : files.files(change.getId())) {
            if (file.status() == ChangeFileStore.Status.GENERATED && file.generated() != null) {
                ScreenScaffolder.Scaffold scaffold = scope.inApp(file.path()) ? targetPacks.find(scope.target())
                        .flatMap(p -> ScreenScaffolder.forFile(p, scope.appFolder(), file.path(), models, file.original())).orElse(null) : null;
                FileChecks.Result check = CodeGenerator.withParity(localChecks.check(scope, file.path(), file.original(), file.generated()),
                        file.generated(), scaffold);
                files.saveCheck(change.getId(), file.path(), check);
                if (check.status() == FileChecks.Status.FAILED) {
                    failing.put(file.path(), check.message());
                }
            }
        }
        // with the certain errors only other files show (a method the called class lacks), with the file's own findings
        failing.putAll(crossCheck(change.getId(), change.getWorkspaceId()));
        return failing;
    }

    /**
     * Checks that need more than one file, added to each written file's check: Java imports of the bank's classes that
     * neither the code nor the change has, and JET views that bind names their view model lacks, as warnings; what makes
     * the file fail for certain (see {@link #CROSS_ERRORS}) as errors. Returns the files that fail, with their findings.
     */
    private Map<String, String> crossCheck(UUID changeId, UUID workspaceId) {
        Map<String, String> failing = new LinkedHashMap<>();
        CheckScope scope = packs.scope(workspaceId);
        List<ChangeFileStore.ChangeFile> written = files.files(changeId).stream()
                .filter(f -> f.status() == ChangeFileStore.Status.GENERATED && f.generated() != null).toList();
        Map<String, String> contents = new LinkedHashMap<>();
        written.forEach(f -> contents.put(f.path(), f.generated()));
        List<String> paths = files.files(changeId).stream().map(ChangeFileStore.ChangeFile::path).toList();
        List<String> unwrittenJava = unwritten(files.files(changeId)).stream().filter(p -> p.endsWith(".java")).toList();
        String bankRoot = written.stream().anyMatch(f -> f.path().endsWith(".java")) ? bankRoot(workspaceId) : null;
        Map<String, String> classes = new LinkedHashMap<>();
        written.stream().filter(f -> f.path().endsWith(".java")).forEach(f -> classes.put(CrossFileJava.className(f.path()), f.generated()));
        Path workingCopy = storage.workingCopy(workspaceId);
        boolean javaIndexed = !classes.isEmpty() && Boolean.TRUE.equals(jdbc.queryForObject(
                "SELECT EXISTS (SELECT 1 FROM code_file WHERE workspace_id = ? AND path LIKE '%.java')", Boolean.class, workspaceId));
        for (ChangeFileStore.ChangeFile file : written) {
            List<String> problems = new ArrayList<>();
            String lower = file.path().toLowerCase(java.util.Locale.ROOT);
            if (lower.endsWith(".java")) {
                List<String> missing = unresolvedImports(file.generated(), classFile -> paths.stream().anyMatch(p -> p.endsWith(classFile))
                        || indexed(workspaceId, classFile), folder -> paths.stream().anyMatch(p -> inFolder(p, folder))
                        || indexedFolder(workspaceId, folder), bankRoot, folder -> bankFolder(folder, paths));
                if (!missing.isEmpty()) {
                    problems.add(CROSS_CHECKS.getFirst() + " in the codebase nor in this change: " + String.join(", ", missing)
                            + ". Add them to the plan, or change the imports to classes that exist.");
                }
                CrossFileJava.unwrittenClasses(file.path(), file.generated(), unwrittenJava).ifPresent(problems::add);
                problems.addAll(CrossFileJava.missingMethods(file.generated(), classes));
                CrossFileJava.unknownReceivers(file.generated()).ifPresent(problems::add);
                Predicate<String> classExists = classFile -> paths.stream().anyMatch(p -> p.endsWith(classFile)) || indexed(workspaceId, classFile);
                CrossFileJava.missingJdkImports(file.generated(), classExists).ifPresent(problems::add);
                if (javaIndexed) {
                    // Without imported Java code a class of the package could exist unseen
                    CrossFileJava.unknownSamePackageClasses(file.generated(), classExists).ifPresent(problems::add);
                }
            } else if (lower.endsWith(".html")) {
                ViewModel model = viewModel(file.path(), contents, workingCopy);
                problems.addAll(ViewBindings.problems(file.generated(), model == null ? null : model.content(), model != null && model.inChange()));
            } else if (lower.endsWith(".js")) {
                problems.addAll(JsModuleChecks.problems(file.generated(), moduleKnown(workspaceId, file.path(), contents)));
                problems.addAll(JsModuleChecks.defineProblems(file.generated(), module -> moduleSource(file.path(), module, contents)));
            }
            // (the screen parity of a React Native or React app's file, as Check again has it, read only when needed)
            FileChecks.Status own = ownStatus(file, localChecks, scope, () -> scope.inApp(file.path()) && scope.appFolder() != null
                    ? targetPacks.find(scope.target()).flatMap(p -> ScreenScaffolder.forFile(p, scope.appFolder(), file.path(),
                    designModels(find(changeId)), file.original())).orElse(null) : null);
            FileChecks.Result check = withCrossChecks(own, file.checkMessage(), problems);
            if (check.status() != file.checkStatus() || !java.util.Objects.equals(check.message(), file.checkMessage())) {
                files.saveCheck(changeId, file.path(), check);
            }
            if (check.status() == FileChecks.Status.FAILED && problems.stream().anyMatch(ChangeService::crossError)) {
                failing.put(file.path(), check.message());
            }
        }
        return failing;
    }

    /**
     * A file's own status, without the cross-check's findings: as stored, unless an earlier cross-check may have failed
     * it; then what its own checks (with the screen parity of an app's file) say, or failed while it is cut off.
     */
    static FileChecks.Status ownStatus(ChangeFileStore.ChangeFile file, LocalChecks checks, CheckScope scope,
                                       java.util.function.Supplier<ScreenScaffolder.Scaffold> scaffold) {
        FileChecks.Status stored = file.checkStatus();
        if (stored != FileChecks.Status.FAILED || file.checkMessage() == null || file.checkMessage().lines().noneMatch(ChangeService::crossError)) {
            return stored;
        }
        if (file.checkMessage().contains(CodeGenerator.CUT)) {
            return FileChecks.Status.FAILED;
        }
        return CodeGenerator.withParity(checks.check(scope, file.path(), file.original(), file.generated()), file.generated(),
                scaffold.get()).status();
    }

    /**
     * The content of a module a view model loads, when this change writes it: './model' beside the file, or the resource
     * bundle 'ojL10n!nls/quick-transfer' (a written file ending with nls/quick-transfer.js); null otherwise.
     */
    static String moduleSource(String path, String module, Map<String, String> written) {
        String folder = path.contains("/") ? path.substring(0, path.lastIndexOf('/')) : "";
        if (module.startsWith("./") || module.startsWith("../")) {
            java.nio.file.Path resolved = java.nio.file.Path.of(folder.isEmpty() ? "." : folder).resolve(module).normalize();
            String target = resolved.toString().replace('\\', '/') + (module.endsWith(".js") ? "" : ".js");
            return written.get(target);
        }
        if (module.contains("!")) {
            String name = module.substring(module.indexOf('!') + 1);
            String suffix = "/" + (name.endsWith(".js") ? name : name + ".js");
            return written.entrySet().stream().filter(e -> e.getKey().endsWith(suffix) || e.getKey().equals(suffix.substring(1)))
                    .map(Map.Entry::getValue).findFirst().orElse(null);
        }
        return null;
    }

    /** How the cross-file findings start, so that the next cross-check replaces them instead of adding them again. */
    static final List<String> CROSS_CHECKS = List.of("Imports classes that are neither", "Bindings that are not valid", "The view binds",
            CrossFileJava.UNWRITTEN, CrossFileJava.MISSING_METHODS, CrossFileJava.MISSING_NESTED, CrossFileJava.UNKNOWN_RECEIVERS,
            CrossFileJava.MISSING_IMPORTS, CrossFileJava.UNKNOWN_CLASSES, JsModuleChecks.CALLED_BEFORE_SET,
            JsModuleChecks.NEVER_SET, JsModuleChecks.UNKNOWN_MODULES, JsModuleChecks.WRONG_BINDING, JsModuleChecks.NOT_RECEIVED,
            JsModuleChecks.BUNDLE_GET, JsModuleChecks.BUNDLE_KEYS);

    /**
     * The cross-file findings that are certain errors, which fail the file so that the fix loop writes it again: a Java
     * call on a name the class never declares, a method or nested type the called class of the change lacks, a JDK class
     * without its import (when no class of the package has its name), and a view model whose define list or resource
     * bundle does not work as written, and a view that binds names the view model written in the same change lacks.
     * The others (a class of the codebase not found, a binding against a view model of the codebase) may be wrong and
     * stay warnings.
     */
    static final List<String> CROSS_ERRORS = java.util.stream.Stream.concat(java.util.stream.Stream.of(CrossFileJava.MISSING_METHODS,
            CrossFileJava.MISSING_NESTED, CrossFileJava.UNKNOWN_RECEIVERS, CrossFileJava.MISSING_IMPORTS, ViewBindings.UNDEFINED_IN_CHANGE),
            JsModuleChecks.ERRORS.stream()).toList();

    static boolean crossError(String line) {
        return CROSS_ERRORS.stream().anyMatch(line::startsWith);
    }

    /**
     * Whether the code base knows an AMD module: another file (indexed, or written in this change) names it in quotes,
     * as a define list or the RequireJS configuration does, or an indexed file's path has its name. Null when no
     * JavaScript is indexed, so it cannot be told.
     */
    private Predicate<String> moduleKnown(UUID workspaceId, String path, Map<String, String> written) {
        Boolean anyJs = jdbc.queryForObject("SELECT EXISTS (SELECT 1 FROM code_file WHERE workspace_id = ? AND language = 'javascript')",
                Boolean.class, workspaceId);
        if (!Boolean.TRUE.equals(anyJs)) {
            return null;
        }
        return module -> {
            String quoted1 = "'" + module + "'";
            String quoted2 = "\"" + module + "\"";
            if (written.entrySet().stream().anyMatch(e -> !e.getKey().equals(path) && (e.getValue().contains(quoted1) || e.getValue().contains(quoted2)))) {
                return true;
            }
            String name = module.substring(module.lastIndexOf('/') + 1);
            return Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS (SELECT 1 FROM code_chunk WHERE workspace_id = ? AND path <> ? "
                            + "AND (strpos(content, ?) > 0 OR strpos(content, ?) > 0)) OR EXISTS (SELECT 1 FROM code_file WHERE workspace_id = ? "
                            + "AND strpos(lower(path), lower(?)) > 0)", Boolean.class, workspaceId, path, quoted1, quoted2, workspaceId, name));
        };
    }

    /**
     * The cross-file findings of a file's check, for the model when the file is written again: they are certain (the
     * other files say so), so the model is told to fix them although the check shows them as warnings.
     */
    static String crossFileFixes(String checkMessage) {
        if (checkMessage == null) {
            return "";
        }
        // and the file's own compile errors that come from what it uses (methods never written, or written twice)
        List<String> lines = checkMessage.lines().filter(line -> CROSS_CHECKS.stream().anyMatch(line::startsWith)
                || line.contains("(" + com.obdx.factory.pack.JavaCompileChecks.UNDECLARED_RULE + ",")
                || line.contains("(" + com.obdx.factory.pack.JavaCompileChecks.DUPLICATE_RULE + ",")).toList();
        return lines.isEmpty() ? "" : "Fix these problems found by comparing this file with the other files of the change:\n- "
                + String.join("\n- ", lines);
    }

    /**
     * A file's check with this cross-check's findings in place of the previous ones: failed while there is a certain
     * error among them, a warning while there are others, back to passed when they are gone and the file's own check
     * found nothing.
     *
     * @param status the file's own status (without the cross-check's findings)
     */
    static FileChecks.Result withCrossChecks(FileChecks.Status status, String message, List<String> problems) {
        String own = message == null ? "" : message.lines().filter(line -> CROSS_CHECKS.stream().noneMatch(line::startsWith))
                .collect(java.util.stream.Collectors.joining("\n")).strip();
        String added = String.join("\n", problems);
        String combined = own.isEmpty() ? added : added.isEmpty() ? own : own + "\n" + added;
        FileChecks.Status result = status == FileChecks.Status.FAILED || problems.stream().anyMatch(ChangeService::crossError)
                ? FileChecks.Status.FAILED
                : !problems.isEmpty() ? FileChecks.Status.WARNING
                : status == FileChecks.Status.WARNING && own.isEmpty() ? FileChecks.Status.PASSED : status;
        return new FileChecks.Result(result, combined.isEmpty() ? null : combined);
    }

    /**
     * A view's view model and whether it is the .js file of the view's name written in this same change (then the two
     * were written for each other, and a name the view binds that it lacks is an error).
     */
    record ViewModel(String content, boolean inChange) {
    }

    /**
     * The view model of a JET view: the .js file of the same name next to it (written in this change or existing),
     * else a model.js beside it that holds observables; null when there is none.
     */
    static ViewModel viewModel(String viewPath, Map<String, String> written, Path workingCopy) {
        String folder = viewPath.contains("/") ? viewPath.substring(0, viewPath.lastIndexOf('/') + 1) : "";
        // x.js or x.ts beside it, or in js/viewModels for js/views/x.html; only then a model.js with observables beside it
        List<String> named = ViewBindings.viewModelPaths(viewPath);
        List<String> candidates = new ArrayList<>(named);
        candidates.add(folder + "model.js");
        for (String candidate : candidates) {
            String content = written.get(candidate);
            boolean own = named.contains(candidate);
            boolean inChange = content != null && own;
            if (content == null && workingCopy != null) {
                try {
                    Path file = workingCopy.resolve(candidate);
                    content = Files.isRegularFile(file) && within(workingCopy, file) ? read(file) : null;
                } catch (IOException e) {
                    content = null;
                }
            }
            if (content != null && (own || content.contains("ko.observable"))) {
                return new ViewModel(content, inChange);
            }
        }
        return null;
    }

    // --- review and delivery ---

    @Transactional(readOnly = true)
    public FileContent fileContent(UUID id, String path) {
        RequestText.requirePath(path);
        ChangeRequest change = find(id);
        ChangeFileStore.ChangeFile file = files.file(id, path).orElseThrow(() -> new NotFoundException("No file " + path + " in this change"));
        String diff = file.generated() == null ? "" : PatchWriter.write(
                List.of(new PatchWriter.FileChange(path, file.original(), file.generated())), change.getBaseRevision());
        return new FileContent(path, file.action(), file.original(), file.generated(), diff);
    }

    @Transactional(readOnly = true)
    public String patch(UUID id) {
        return patch(id, false);
    }

    /** @param incomplete true: the reviewer confirmed delivering although planned files are not written */
    public String patch(UUID id, boolean incomplete) {
        ChangeRequest change = find(id);
        requireStatus(change, ChangeRequest.Status.GENERATED, ChangeRequest.Status.DELIVERED);
        if (!incomplete) {
            requireComplete(files.files(id));
        }
        List<PatchWriter.FileChange> fileChanges = deliverable(id).stream()
                .map(f -> new PatchWriter.FileChange(f.path(), f.original(), f.generated())).toList();
        return PatchWriter.write(fileChanges, change.getBaseRevision());
    }

    /**
     * Commits the change to a new branch in one commit: the branch is copied from the base revision, then the
     * generated files are put into it. Nothing is changed on trunk.
     */
    public ChangeDetail deliverToBranch(UUID id) {
        return deliverToBranch(id, false);
    }

    /** @param incomplete true: the reviewer confirmed delivering although planned files are not written */
    public ChangeDetail deliverToBranch(UUID id, boolean incomplete) {
        ChangeRequest change = find(id);
        requireStatus(change, ChangeRequest.Status.GENERATED);
        requireNotBuilding(change);
        if (!incomplete) {
            requireComplete(files.files(id));
        }
        List<ChangeFileStore.ChangeFile> deliverable = deliverable(id);
        if (deliverable.isEmpty()) {
            throw new BadRequestException("There are no changed files to deliver");
        }
        Workspace workspace = workspace(change.getWorkspaceId());
        var credentials = workspaceService.credentials(workspace);
        SvnClient.SvnInfo info = svn.info(workspace.getSvnUrl(), credentials);
        String root = info.repositoryRoot();
        String source = info.url().substring(root.length()).replaceAll("^/+", "");
        String folder = properties.branchFolder().replaceAll("^/+|/+$", "");
        String branch = folder + "/cr-" + id.toString().substring(0, 8);
        if (svn.exists(root + "/" + branch, credentials)) {
            throw new ConflictException("The branch " + branch + " already exists");
        }

        Path work = storage.root().resolve("changes").resolve(id.toString()).toAbsolutePath();
        try {
            List<String> operations = new ArrayList<>();
            String parent = "";
            for (String part : folder.split("/")) {
                parent = parent.isEmpty() ? part : parent + "/" + part;
                if (!svn.exists(root + "/" + parent, credentials)) {
                    operations.addAll(List.of("mkdir", parent));
                }
            }
            operations.addAll(List.of("cp", String.valueOf(change.getBaseRevision()), source, branch));

            Path workingCopy = storage.workingCopy(workspace.getId());
            Set<String> newFolders = new LinkedHashSet<>();
            Files.createDirectories(work);
            for (int i = 0; i < deliverable.size(); i++) {
                ChangeFileStore.ChangeFile file = deliverable.get(i);
                String dir = file.path().contains("/") ? file.path().substring(0, file.path().lastIndexOf('/')) : "";
                List<String> missing = new ArrayList<>();
                for (String d = dir; !d.isEmpty() && !Files.isDirectory(workingCopy.resolve(d)); d = d.contains("/") ? d.substring(0, d.lastIndexOf('/')) : "") {
                    missing.addFirst(d);
                }
                for (String d : missing) {
                    if (newFolders.add(d)) {
                        operations.addAll(List.of("mkdir", branch + "/" + d));
                    }
                }
                Path content = work.resolve("file-" + i);
                Files.writeString(content, file.generated(), StandardCharsets.UTF_8);
                operations.addAll(List.of("put", content.toString(), branch + "/" + file.path()));
            }

            String message = "OBDX Development Factory: " + change.getTitle() + " (change " + id.toString().substring(0, 8)
                    + ", plan approved by " + change.getPlanApprovedBy() + ")";
            long revision = svn.multiCommit(root, message, operations, credentials);
            change.delivered(root + "/" + branch, revision);
            List<ChangeFileStore.ChangeFile> all = files.files(id);
            change.status(ChangeRequest.Status.DELIVERED, deliveredMessage(root + "/" + branch, revision, deliverable.size(),
                    all.stream().filter(f -> f.status() != ChangeFileStore.Status.UNCHANGED).count(), unwritten(all)));
            ChangeDetail delivered = detail(changes.save(change));
            // What this change touched becomes a suggested knowledge note, for the next similar change
            ChangePlan plan = change.getPlan() == null ? null : json.readValue(change.getPlan(), ChangePlan.class);
            knowledge.learnFromChange(change.getWorkspaceId(), change.getTitle(), plan == null ? null : plan.summary(),
                    deliverable.stream().map(ChangeFileStore.ChangeFile::path).toList());
            return delivered;
        } catch (IOException e) {
            throw new UncheckedIOException("Could not prepare the files for delivery", e);
        } finally {
            try {
                FileSystemUtils.deleteRecursively(work);
            } catch (IOException e) {
                log.warn("Could not clean up {}", work, e);
            }
        }
    }

    // --- read ---

    @Transactional(readOnly = true)
    public ChangeDetail get(UUID id) {
        return detail(find(id));
    }

    /** The details of every change of a workspace, newest first. */
    @Transactional(readOnly = true)
    public List<ChangeDetail> details(UUID workspaceId) {
        return changes.findByWorkspaceIdOrderByCreatedAtDesc(workspaceId).stream().map(this::detail).toList();
    }

    @Transactional(readOnly = true)
    public List<ChangeSummary> list(UUID workspaceId) {
        return changes.findByWorkspaceIdOrderByCreatedAtDesc(workspaceId).stream().map(c -> {
            ChangePlan plan = c.getPlan() == null ? null : json.readValue(c.getPlan(), ChangePlan.class);
            return new ChangeSummary(c.getId(), c.getTitle(), c.getStatus(), c.getMessage(), plan == null ? 0 : plan.items().size(), c.getUpdatedAt());
        }).toList();
    }

    @Transactional
    public void delete(UUID id) {
        ChangeRequest change = find(id);
        if (change.getStatus() == ChangeRequest.Status.ANALYZING || change.getStatus() == ChangeRequest.Status.GENERATING) {
            throw new ConflictException("Wait until the change has finished " + change.getStatus().name().toLowerCase());
        }
        if (change.hasLiveBranch()) {
            throw new ConflictException("The change still has its branch " + change.getBranchUrl()
                    + ". Close it first (as merged or abandoned), which removes the branch.");
        }
        changes.delete(change);
    }

    @EventListener(ApplicationReadyEvent.class)
    @Transactional
    public void failInterrupted() {
        int count = changes.failRunning("Interrupted because the server restarted. Analyze again.", OffsetDateTime.now());
        count += changes.failBuilding("Interrupted because the server restarted. Build again.");
        builds.closeAllUnfinished("Interrupted because the server restarted. Build again.");
        if (count > 0) {
            log.warn("Marked {} change(s) as failed after restart", count);
        }
    }

    // --- helpers ---

    /** Background work must see the committed change, so it starts only after the current transaction commits. */
    private void startAfterCommit(Runnable job) {
        // Each job may wait on rate limits only so long in all: the jobs share one thread
        Runnable work = () -> {
            com.obdx.factory.model.WaitBudget.start(com.obdx.factory.model.WaitBudget.PER_JOB);
            try {
                job.run();
            } finally {
                com.obdx.factory.model.WaitBudget.end();
            }
        };
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    executor.execute(work);
                }
            });
        } else {
            executor.execute(work);
        }
    }

    /** The requirement's screen designs: the approved version of each (the current one if not approved). */
    private List<ScreenModel> designModels(ChangeRequest change) {
        List<ScreenModel> models = new ArrayList<>();
        for (ScreenDesign design : designs.findByRequirementIdOrderByCreatedAt(change.getRequirementId())) {
            int version = design.getApprovedVersion() != null ? design.getApprovedVersion() : design.getCurrentVersion();
            designStore.model(design.getId(), version).ifPresent(models::add);
        }
        return models;
    }

    ChangeContext context(ChangeRequest change, RequirementService.RequirementDetail requirement) {
        String designsJson = null;
        List<ScreenModel> models = designModels(change);
        if (!models.isEmpty()) {
            designsJson = json.writeValueAsString(compact(json.valueToTree(models)));
        }
        String specJson = specForModel(json, requirement.spec());
        String profile;
        try {
            profile = profiles.get(change.getWorkspaceId()).facts().stream().filter(f -> f.value() != null)
                    .map(f -> "- " + f.label() + ": " + f.value()).collect(Collectors.joining("\n"));
        } catch (NotFoundException e) {
            profile = "";
        }
        return new ChangeContext(change.getTitle(), specJson, designsJson, profile,
                structure(change.getWorkspaceId()), packs.scope(change.getWorkspaceId()), recipes.planGuide(change.getWorkspaceId()),
                targets.planGuide(change.getWorkspaceId()), models,
                knowledge.contextFor(change.getWorkspaceId(), change.getTitle() + "\n" + ChangeContext.cap(specJson, 1500), 5000),
                existsIn(change.getWorkspaceId()));
    }

    /** The spec's parts in the order the model needs them most: a prompt that shortens the spec cuts the background lists. */
    private static final List<String> SPEC_ORDER = List.of("title", "summary", "requirements", "acceptanceCriteria", "screens",
            "businessRules", "messages", "roles", "apis", "hostInteractions", "nonFunctional", "scope", "outOfScope", "assumptions");

    /**
     * The approved spec as the model reads it: most useful parts first and without empty values. The questions are
     * left out: the spec already reflects the answered ones, and the open ones are not needed to write code.
     */
    static String specForModel(ObjectMapper json, RequirementSpec spec) {
        tools.jackson.databind.node.ObjectNode all = compact(json.valueToTree(spec)) instanceof tools.jackson.databind.node.ObjectNode o
                ? o : json.createObjectNode();
        tools.jackson.databind.node.ObjectNode ordered = json.createObjectNode();
        for (String part : SPEC_ORDER) {
            if (all.has(part)) {
                ordered.set(part, all.get(part));
            }
        }
        return json.writeValueAsString(ordered);
    }

    /** Removes nulls, empty texts, lists and objects, which only make a prompt longer. */
    static tools.jackson.databind.JsonNode compact(tools.jackson.databind.JsonNode node) {
        if (node instanceof tools.jackson.databind.node.ObjectNode object) {
            for (String name : object.properties().stream().map(Map.Entry::getKey).toList()) {
                tools.jackson.databind.JsonNode value = compact(object.get(name));
                if (empty(value)) {
                    object.remove(name);
                }
            }
        } else if (node instanceof tools.jackson.databind.node.ArrayNode array) {
            for (int i = array.size() - 1; i >= 0; i--) {
                if (empty(compact(array.get(i)))) {
                    array.remove(i);
                }
            }
        }
        return node;
    }

    private static boolean empty(tools.jackson.databind.JsonNode value) {
        return value == null || value.isNull() || (value.isTextual() && value.asText().isBlank())
                || ((value.isArray() || value.isObject()) && value.size() == 0);
    }

    /**
     * For files of a React Native or React app: the starting point generated from the approved Screen Model (screen,
     * test or texts), or null.
     */
    ScreenScaffolder.Scaffold scaffold(ChangeContext context, String path, String current) {
        CheckScope scope = context.checks();
        if (!scope.inApp(path)) {
            return null;
        }
        return targetPacks.find(scope.target())
                .flatMap(pack -> ScreenScaffolder.forFile(pack, scope.appFolder(), path, context.models(), current)).orElse(null);
    }

    /** Folders of the indexed code with their number of files, so the model knows where things live. */
    private String structure(UUID workspaceId) {
        return jdbc.query("SELECT CASE WHEN position('/' IN path) > 0 THEN regexp_replace(path, '/[^/]+$', '') ELSE '.' END AS dir, "
                        + "count(*) AS n FROM code_file WHERE workspace_id = ? GROUP BY dir ORDER BY dir LIMIT 200",
                (rs, row) -> rs.getString("dir") + "/: " + rs.getLong("n"), workspaceId).stream().collect(Collectors.joining("\n"));
    }

    /** Existing code related to the spec's screens, rules, services and host interactions. */
    private List<ImpactAnalyzer.Candidate> candidates(UUID workspaceId, RequirementSpec spec) {
        List<String> queries = new ArrayList<>();
        for (RequirementSpec.Screen screen : spec.screens()) {
            queries.add(screen.name() + " " + screen.fields().stream().limit(8).map(RequirementSpec.Field::name).collect(Collectors.joining(" ")));
        }
        spec.businessRules().forEach(rule -> queries.add(rule.description()));
        spec.apis().forEach(api -> queries.add(api.name() + " " + (api.description() == null ? "" : api.description())));
        spec.hostInteractions().forEach(host -> queries.add((host.system() == null ? "" : host.system()) + " " + host.description()));

        Map<String, ImpactAnalyzer.Candidate> found = new LinkedHashMap<>();
        for (String asWritten : queries) {
            // In OBDX's own words too: a BRD's "beneficiary" is a payee in the code
            String inCode = com.obdx.factory.knowledge.ObdxGlossary.inManualWords(asWritten);
            String query = inCode == null ? asWritten : asWritten + " " + inCode;
            try {
                for (CodeSearchService.SearchResult result : codeSearch.search(workspaceId, query, 6).results()) {
                    found.putIfAbsent(result.path() + ":" + result.startLine(), new ImpactAnalyzer.Candidate(
                            result.path(), result.symbol(), result.startLine(), result.endLine(), result.snippet()));
                }
            } catch (RuntimeException e) {
                log.debug("Search for '{}' failed: {}", query, e.getMessage());
            }
            if (found.size() >= properties.maxCandidates()) {
                break;
            }
        }
        return found.values().stream().limit(properties.maxCandidates()).toList();
    }

    private Predicate<String> existsIn(UUID workspaceId) {
        Path workingCopy = storage.workingCopy(workspaceId);
        return path -> Files.isRegularFile(workingCopy.resolve(path));
    }

    /**
     * "Committed 3 of 5 file(s) to .../cr-1a2b3c4d in revision 4; not delivered: a.js, b.html." for a delivery made
     * without the files not written; the usual message when every planned file went.
     */
    static String deliveredMessage(String branchUrl, long revision, int committed, long planned, List<String> notDelivered) {
        if (notDelivered.isEmpty()) {
            return "Committed to " + branchUrl + " in revision " + revision + ".";
        }
        return "Committed " + committed + " of " + planned + " file(s) to " + branchUrl + " in revision " + revision + "; not delivered: "
                + String.join(", ", notDelivered) + ".";
    }

    /** Planned files that are not written (not yet, or the model could not write them). */
    static List<String> unwritten(List<ChangeFileStore.ChangeFile> files) {
        return files.stream().filter(f -> f.status() == ChangeFileStore.Status.PENDING
                || (f.status() == ChangeFileStore.Status.FAILED && f.generated() == null)
                || partial(f)).map(ChangeFileStore.ChangeFile::path).toList();
    }

    /**
     * A delivery leaves out files that are not written, so the branch or patch would not build: refused unless the
     * reviewer confirmed it (the UI asks and sends the request again).
     */
    static void requireComplete(List<ChangeFileStore.ChangeFile> files) {
        List<String> missing = unwritten(files);
        if (!missing.isEmpty()) {
            throw new ConflictException(INCOMPLETE + missing.size() + " planned file(s) are not written: " + String.join(", ", missing)
                    + ". Write them first (Continue generation or Write again), or deliver without them.");
        }
    }

    /** How a refused incomplete delivery starts, so the UI can offer to deliver anyway. */
    static final String INCOMPLETE = "Incomplete change: ";

    private List<ChangeFileStore.ChangeFile> deliverable(UUID id) {
        return files.files(id).stream().filter(f -> f.status() == ChangeFileStore.Status.GENERATED && f.generated() != null).toList();
    }

    ChangePlan plan(ChangeRequest change) {
        if (change.getPlan() == null) {
            throw new BadRequestException("The change has no plan yet");
        }
        return json.readValue(change.getPlan(), ChangePlan.class);
    }

    ChangeDetail detail(ChangeRequest c) {
        List<FileView> views = files.files(c.getId()).stream().map(f -> {
            int added = 0;
            int removed = 0;
            if (f.generated() != null) {
                var diff = com.github.difflib.DiffUtils.diff(PatchWriter.lines(f.original()), PatchWriter.lines(f.generated()));
                for (var delta : diff.getDeltas()) {
                    added += delta.getTarget().size();
                    removed += delta.getSource().size();
                }
            }
            return new FileView(f.path(), f.action(), f.layer(), f.purpose(), f.status(), f.edited(), f.checkStatus(),
                    withRewrite(f), f.attempts(), added, removed);
        }).toList();
        return new ChangeDetail(c.getId(), c.getWorkspaceId(), c.getRequirementId(), c.getTitle(), c.getStatus(), c.getMessage(),
                c.getBaseRevision(), c.getPlan() == null ? null : json.readValue(c.getPlan(), ChangePlan.class),
                c.getPlanApprovedBy(), c.getPlanApprovedAt(), c.getBranchUrl(), c.getDeliveredRevision(), c.getCreatedBy(),
                c.getCreatedAt(), c.getUpdatedAt(), views, c.getBuildStatus(), c.getBuildMessage(), builds.list(c.getId()),
                c.getClosedReason(), c.getClosedBy(), c.getClosedAt(), c.getBranchDeletedRevision());
    }

    static void requireNotBuilding(ChangeRequest change) {
        if ("BUILDING".equals(change.getBuildStatus())) {
            throw new ConflictException("Wait until the Jenkins build has finished");
        }
    }

    static void requireStatus(ChangeRequest change, ChangeRequest.Status... allowed) {
        for (ChangeRequest.Status status : allowed) {
            if (change.getStatus() == status) {
                return;
            }
        }
        throw new ConflictException("The change is " + change.getStatus().name().toLowerCase().replace('_', ' ')
                + "; this is not possible now");
    }

    ChangeRequest find(UUID id) {
        return changes.findById(id).orElseThrow(() -> new NotFoundException("Change not found: " + id));
    }

    private Workspace workspace(UUID id) {
        return workspaces.findById(id).orElseThrow(() -> new NotFoundException("Workspace not found: " + id));
    }

    /**
     * Whether a file of the working copy really is in it: a link (symlink) in the bank's code could lead to any file on
     * the server, which would then go to the model and into the change.
     */
    static boolean within(Path workingCopy, Path file) {
        try {
            return file.toRealPath().startsWith(workingCopy.toRealPath());
        } catch (IOException e) {
            return false;
        }
    }

    private static String read(Path file) throws IOException {
        byte[] bytes = Files.readAllBytes(file);
        try {
            return StandardCharsets.UTF_8.newDecoder().decode(java.nio.ByteBuffer.wrap(bytes)).toString();
        } catch (java.nio.charset.CharacterCodingException e) {
            return new String(bytes, StandardCharsets.ISO_8859_1);
        }
    }
}
