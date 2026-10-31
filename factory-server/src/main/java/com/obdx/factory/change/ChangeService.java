package com.obdx.factory.change;

import com.obdx.factory.common.BadRequestException;
import com.obdx.factory.common.ConflictException;
import com.obdx.factory.common.NotFoundException;
import com.obdx.factory.design.DesignStore;
import com.obdx.factory.design.ScreenDesign;
import com.obdx.factory.design.ScreenDesignRepository;
import com.obdx.factory.design.ScreenModel;
import com.obdx.factory.importing.StorageProperties;
import com.obdx.factory.knowledge.KnowledgeService;
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

    public ChangeService(ChangeRequestRepository changes, ChangeFileStore files, WorkspaceRepository workspaces,
                         WorkspaceService workspaceService, RequirementService requirements, ScreenDesignRepository designs,
                         DesignStore designStore, ProjectProfileService profiles, CodeSearchService codeSearch,
                         ImpactAnalyzer analyzer, CodeGenerator generator, SvnClient svn, StorageProperties storage,
                         ChangeProperties properties, JdbcTemplate jdbc, ObjectMapper json, ChangeBuildStore builds,
                         PackService packs, LocalChecks localChecks, RecipeService recipes, TargetService targets,
                         TargetPacks targetPacks, @Qualifier("changeExecutor") TaskExecutor executor, KnowledgeService knowledge) {
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
        ChangeRequest change = find(id);
        requireStatus(change, ChangeRequest.Status.PLAN_READY, ChangeRequest.Status.FAILED);
        change.status(ChangeRequest.Status.ANALYZING, "Analyzing the impact on the codebase...");
        changes.save(change);
        startAfterCommit(() -> runAnalysis(id));
        return detail(change);
    }

    void runAnalysis(UUID id) {
        ChangeRequest change = find(id);
        try {
            Workspace workspace = workspace(change.getWorkspaceId());
            RequirementService.RequirementDetail requirement = requirements.get(change.getRequirementId());
            ChangeContext context = context(change, requirement);
            List<ImpactAnalyzer.Candidate> candidates = candidates(workspace.getId(), requirement.spec());
            ChangePlan plan = analyzer.analyze(context, candidates, existsIn(workspace.getId()));
            change.plan(json.writeValueAsString(plan), workspace.getIndexedRevision());
            long creates = plan.items().stream().filter(i -> "create".equals(i.action())).count();
            change.status(ChangeRequest.Status.PLAN_READY, "Plan ready: " + plan.items().size() + " file(s), " + creates
                    + " new and " + (plan.items().size() - creates) + " changed. Review and approve it to generate the code.");
        } catch (RuntimeException e) {
            log.error("Impact analysis of change {} failed", id, e);
            change.status(ChangeRequest.Status.FAILED, "Impact analysis failed: " + e.getMessage());
        }
        changes.save(change);
    }

    // --- plan review ---

    @Transactional
    public ChangeDetail updatePlan(UUID id, String planJson) {
        ChangeRequest change = find(id);
        requireStatus(change, ChangeRequest.Status.PLAN_READY);
        ChangePlan plan = PlanParser.parse(planJson, existsIn(change.getWorkspaceId()), properties.maxPlanItems());
        change.plan(json.writeValueAsString(plan), change.getBaseRevision());
        change.status(ChangeRequest.Status.PLAN_READY, "Plan edited: " + plan.items().size() + " file(s).");
        return detail(changes.save(change));
    }

    /** Approves the plan and starts writing the code in the background. */
    @Transactional
    public ChangeDetail approvePlan(UUID id, String by) {
        ChangeRequest change = find(id);
        requireStatus(change, ChangeRequest.Status.PLAN_READY);
        ChangePlan plan = plan(change);
        change.approvePlan(by);
        files.replaceAll(id, plan.items());
        change.status(ChangeRequest.Status.GENERATING, "Writing " + plan.items().size() + " file(s)...");
        changes.save(change);
        startAfterCommit(() -> runGeneration(id, null, null));
        return detail(change);
    }

    // --- generation ---

    /** Writes all pending files, or only onlyPath (with the reviewer's note) when given. */
    void runGeneration(UUID id, String onlyPath, String note) {
        ChangeRequest change = find(id);
        try {
            Workspace workspace = workspace(change.getWorkspaceId());
            RequirementService.RequirementDetail requirement = requirements.get(change.getRequirementId());
            ChangeContext context = context(change, requirement);
            ChangePlan plan = plan(change);
            Path workingCopy = storage.workingCopy(workspace.getId());
            String revisionNote = "";
            if (onlyPath == null) {
                if (change.getBaseRevision() != null && !change.getBaseRevision().equals(workspace.getIndexedRevision())) {
                    revisionNote = " The code was updated since the analysis (r" + change.getBaseRevision() + " to r"
                            + workspace.getIndexedRevision() + "); files were read at r" + workspace.getIndexedRevision() + ".";
                }
                change.baseRevision(workspace.getIndexedRevision());
                changes.save(change);
            }

            Map<String, String> earlier = new LinkedHashMap<>();
            for (ChangeFileStore.ChangeFile existing : files.files(id)) {
                if (existing.generated() != null && !existing.path().equals(onlyPath)) {
                    earlier.put(existing.path(), existing.generated());
                }
            }
            for (int i = 0; i < plan.items().size(); i++) {
                ChangePlan.Item item = plan.items().get(i);
                if (onlyPath != null && !item.path().equals(onlyPath)) {
                    continue;
                }
                if (onlyPath == null) {
                    change.status(ChangeRequest.Status.GENERATING, "Writing file " + (i + 1) + " of " + plan.items().size() + ": " + item.path());
                    change = changes.save(change);
                }
                generateFile(id, workspace.getId(), context, plan, item, workingCopy, earlier, note);
            }

            crossCheck(id, workspace.getId());
            List<ChangeFileStore.ChangeFile> result = files.files(id);
            long failed = result.stream().filter(f -> f.status() == ChangeFileStore.Status.FAILED
                    || f.checkStatus() == FileChecks.Status.FAILED).count();
            long warnings = result.stream().filter(f -> f.checkStatus() == FileChecks.Status.WARNING).count();
            long written = result.stream().filter(f -> f.status() == ChangeFileStore.Status.GENERATED).count();
            change.status(ChangeRequest.Status.GENERATED, (onlyPath != null ? onlyPath + " written again. " : "")
                    + written + " file(s) written, " + failed + " with problems, " + warnings + " with warnings. "
                    + "Review the changes before delivering them." + revisionNote);
        } catch (RuntimeException e) {
            log.error("Code generation for change {} failed", id, e);
            change.status(onlyPath != null ? ChangeRequest.Status.GENERATED : ChangeRequest.Status.FAILED,
                    "Code generation failed: " + e.getMessage());
        }
        changes.save(change);
    }

    private void generateFile(UUID changeId, UUID workspaceId, ChangeContext context, ChangePlan plan, ChangePlan.Item item,
                              Path workingCopy, Map<String, String> earlier, String note) {
        boolean modify = "modify".equals(item.action());
        String current = null;
        try {
            if (modify) {
                Path file = workingCopy.resolve(item.path());
                if (Files.size(file) > properties.maxFileSize().toBytes()) {
                    files.saveResult(changeId, item.path(), ChangeFileStore.Status.FAILED, read(file), null, false,
                            new FileChecks.Result(FileChecks.Status.FAILED, "The file is too large to rewrite safely; change it by hand."), 0);
                    return;
                }
                current = read(file);
            }
            Map<String, String> examples = examples(workspaceId, workingCopy, item);
            ScreenScaffolder.Scaffold scaffold = scaffold(context, item.path(), current);
            CodeGenerator.Result result = generator.generate(context, plan, item, current, current, examples, earlier, note, scaffold);
            ChangeFileStore.Status status = modify && result.content().equals(current)
                    ? ChangeFileStore.Status.UNCHANGED : ChangeFileStore.Status.GENERATED;
            files.saveResult(changeId, item.path(), status, current, result.content(), false, result.check(), result.attempts());
            earlier.put(item.path(), result.content());
        } catch (IOException | RuntimeException e) {
            log.warn("Could not write {} for change {}", item.path(), changeId, e);
            files.saveResult(changeId, item.path(), ChangeFileStore.Status.FAILED, current, null, false,
                    new FileChecks.Result(FileChecks.Status.FAILED, "Could not be written: " + e.getMessage()), 0);
        }
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
            if (name.startsWith(own) && !classExists.test(folder + "/" + parts[cls] + ".java") && packageExists.test(folder)) {
                missing.add(name);
            }
        }
        return missing;
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
            if (examples.size() < 2 && !path.equals(item.path()) && !examples.containsKey(path) && Files.isRegularFile(file)
                    && Files.size(file) <= properties.maxFileSize().toBytes()) {
                examples.put(path, read(file));
            }
        }
        if (examples.isEmpty() && "create".equals(item.action())) {
            Path folder = workingCopy.resolve(item.path()).getParent();
            String extension = item.path().contains(".") ? item.path().substring(item.path().lastIndexOf('.')) : "";
            if (folder != null && Files.isDirectory(folder)) {
                try (Stream<Path> siblings = Files.list(folder)) {
                    Path sibling = siblings.filter(p -> p.getFileName().toString().endsWith(extension) && Files.isRegularFile(p))
                            .sorted().findFirst().orElse(null);
                    if (sibling != null && Files.size(sibling) <= properties.maxFileSize().toBytes()) {
                        examples.put(workingCopy.relativize(sibling).toString().replace('\\', '/'), read(sibling));
                    }
                }
            }
        }
        return examples;
    }

    /** Writes one file again, with an optional instruction from the reviewer. */
    @Transactional
    public ChangeDetail regenerate(UUID id, String path, String note) {
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
        crossCheck(change.getId(), change.getWorkspaceId());
        return failing;
    }

    /**
     * Checks that need more than one file, added to each written file's check as warnings: Java imports of the bank's
     * classes that neither the code nor the change has, and JET views that bind names their view model lacks.
     */
    private void crossCheck(UUID changeId, UUID workspaceId) {
        List<ChangeFileStore.ChangeFile> written = files.files(changeId).stream()
                .filter(f -> f.status() == ChangeFileStore.Status.GENERATED && f.generated() != null).toList();
        Map<String, String> contents = new LinkedHashMap<>();
        written.forEach(f -> contents.put(f.path(), f.generated()));
        List<String> paths = files.files(changeId).stream().map(ChangeFileStore.ChangeFile::path).toList();
        Path workingCopy = storage.workingCopy(workspaceId);
        for (ChangeFileStore.ChangeFile file : written) {
            List<String> problems = new ArrayList<>();
            String lower = file.path().toLowerCase(java.util.Locale.ROOT);
            if (lower.endsWith(".java")) {
                List<String> missing = unresolvedImports(file.generated(), classFile -> paths.stream().anyMatch(p -> p.endsWith(classFile))
                        || indexed(workspaceId, classFile), folder -> paths.stream().anyMatch(p -> inFolder(p, folder))
                        || indexedFolder(workspaceId, folder));
                if (!missing.isEmpty()) {
                    problems.add(CROSS_CHECKS.getFirst() + " in the codebase nor in this change: " + String.join(", ", missing)
                            + ". Add them to the plan, or change the imports to classes that exist.");
                }
            } else if (lower.endsWith(".html")) {
                problems.addAll(ViewBindings.problems(file.generated(), viewModel(file.path(), contents, workingCopy)));
            }
            FileChecks.Result check = withCrossChecks(file.checkStatus(), file.checkMessage(), problems);
            if (check.status() != file.checkStatus() || !java.util.Objects.equals(check.message(), file.checkMessage())) {
                files.saveCheck(changeId, file.path(), check);
            }
        }
    }

    /** How the cross-file findings start, so that the next cross-check replaces them instead of adding them again. */
    static final List<String> CROSS_CHECKS = List.of("Imports classes that are neither", "Bindings that are not valid", "The view binds");

    /**
     * A file's check with this cross-check's findings in place of the previous ones: a warning while there are any,
     * back to passed when they are gone and the file's own check found nothing.
     */
    static FileChecks.Result withCrossChecks(FileChecks.Status status, String message, List<String> problems) {
        String own = message == null ? "" : message.lines().filter(line -> CROSS_CHECKS.stream().noneMatch(line::startsWith))
                .collect(java.util.stream.Collectors.joining("\n")).strip();
        String added = String.join("\n", problems);
        String combined = own.isEmpty() ? added : added.isEmpty() ? own : own + "\n" + added;
        FileChecks.Status result = status == FileChecks.Status.FAILED ? FileChecks.Status.FAILED
                : !problems.isEmpty() ? FileChecks.Status.WARNING
                : status == FileChecks.Status.WARNING && own.isEmpty() ? FileChecks.Status.PASSED : status;
        return new FileChecks.Result(result, combined.isEmpty() ? null : combined);
    }

    /**
     * The view model of a JET view: the .js file of the same name next to it (written in this change or existing),
     * else a model.js beside it that holds observables; null when there is none.
     */
    private static String viewModel(String viewPath, Map<String, String> written, Path workingCopy) {
        String base = viewPath.substring(0, viewPath.length() - ".html".length());
        String folder = viewPath.contains("/") ? viewPath.substring(0, viewPath.lastIndexOf('/') + 1) : "";
        for (String candidate : List.of(base + ".js", folder + "model.js")) {
            String content = written.get(candidate);
            if (content == null) {
                try {
                    Path file = workingCopy.resolve(candidate);
                    content = Files.isRegularFile(file) ? read(file) : null;
                } catch (IOException e) {
                    content = null;
                }
            }
            if (content != null && (candidate.endsWith(base + ".js") || content.contains("ko.observable"))) {
                return content;
            }
        }
        return null;
    }

    // --- review and delivery ---

    @Transactional(readOnly = true)
    public FileContent fileContent(UUID id, String path) {
        ChangeRequest change = find(id);
        ChangeFileStore.ChangeFile file = files.file(id, path).orElseThrow(() -> new NotFoundException("No file " + path + " in this change"));
        String diff = file.generated() == null ? "" : PatchWriter.write(
                List.of(new PatchWriter.FileChange(path, file.original(), file.generated())), change.getBaseRevision());
        return new FileContent(path, file.action(), file.original(), file.generated(), diff);
    }

    @Transactional(readOnly = true)
    public String patch(UUID id) {
        ChangeRequest change = find(id);
        requireStatus(change, ChangeRequest.Status.GENERATED, ChangeRequest.Status.DELIVERED);
        List<PatchWriter.FileChange> fileChanges = deliverable(id).stream()
                .map(f -> new PatchWriter.FileChange(f.path(), f.original(), f.generated())).toList();
        return PatchWriter.write(fileChanges, change.getBaseRevision());
    }

    /**
     * Commits the change to a new branch in one commit: the branch is copied from the base revision, then the
     * generated files are put into it. Nothing is changed on trunk.
     */
    public ChangeDetail deliverToBranch(UUID id) {
        ChangeRequest change = find(id);
        requireStatus(change, ChangeRequest.Status.GENERATED);
        requireNotBuilding(change);
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
        if (count > 0) {
            log.warn("Marked {} change(s) as failed after restart", count);
        }
    }

    // --- helpers ---

    /** Background work must see the committed change, so it starts only after the current transaction commits. */
    private void startAfterCommit(Runnable work) {
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
                knowledge.contextFor(change.getWorkspaceId(), change.getTitle() + "\n" + ChangeContext.cap(specJson, 1500), 5000));
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
                    f.checkMessage(), f.attempts(), added, removed);
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

    private static String read(Path file) throws IOException {
        byte[] bytes = Files.readAllBytes(file);
        try {
            return StandardCharsets.UTF_8.newDecoder().decode(java.nio.ByteBuffer.wrap(bytes)).toString();
        } catch (java.nio.charset.CharacterCodingException e) {
            return new String(bytes, StandardCharsets.ISO_8859_1);
        }
    }
}
