package com.obdx.factory.change;

import com.obdx.factory.common.BadRequestException;
import com.obdx.factory.common.ConflictException;
import com.obdx.factory.common.NotFoundException;
import com.obdx.factory.design.DesignStore;
import com.obdx.factory.design.ScreenDesign;
import com.obdx.factory.design.ScreenDesignRepository;
import com.obdx.factory.design.ScreenModel;
import com.obdx.factory.importing.StorageProperties;
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
    private final TaskExecutor executor;

    public ChangeService(ChangeRequestRepository changes, ChangeFileStore files, WorkspaceRepository workspaces,
                         WorkspaceService workspaceService, RequirementService requirements, ScreenDesignRepository designs,
                         DesignStore designStore, ProjectProfileService profiles, CodeSearchService codeSearch,
                         ImpactAnalyzer analyzer, CodeGenerator generator, SvnClient svn, StorageProperties storage,
                         ChangeProperties properties, JdbcTemplate jdbc, ObjectMapper json,
                         @Qualifier("changeExecutor") TaskExecutor executor) {
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
        this.executor = executor;
    }

    public record FileView(String path, String action, String layer, String purpose, ChangeFileStore.Status status,
                           boolean edited, FileChecks.Status checkStatus, String checkMessage, int attempts,
                           int linesAdded, int linesRemoved) {
    }

    public record ChangeDetail(UUID id, UUID workspaceId, UUID requirementId, String title, ChangeRequest.Status status,
                               String message, Long baseRevision, ChangePlan plan, String planApprovedBy,
                               OffsetDateTime planApprovedAt, String branchUrl, Long deliveredRevision, String createdBy,
                               OffsetDateTime createdAt, OffsetDateTime updatedAt, List<FileView> files) {
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
            for (ChangePlan.Item item : plan.items()) {
                if (onlyPath != null && !item.path().equals(onlyPath)) {
                    continue;
                }
                generateFile(id, context, plan, item, workingCopy, earlier, note);
            }

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

    private void generateFile(UUID changeId, ChangeContext context, ChangePlan plan, ChangePlan.Item item, Path workingCopy,
                              Map<String, String> earlier, String note) {
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
            Map<String, String> examples = examples(workingCopy, item);
            CodeGenerator.Result result = generator.generate(context, plan, item, current, examples, earlier, note);
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

    /** Files to imitate: the plan's basedOn files, or else a file of the same type in the same folder. */
    private Map<String, String> examples(Path workingCopy, ChangePlan.Item item) throws IOException {
        Map<String, String> examples = new LinkedHashMap<>();
        for (String path : item.basedOn()) {
            Path file = workingCopy.resolve(path);
            if (examples.size() < 2 && Files.isRegularFile(file) && Files.size(file) <= properties.maxFileSize().toBytes()) {
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
        ChangeFileStore.ChangeFile file = files.file(id, path).orElseThrow(() -> new NotFoundException("No file " + path + " in this change"));
        String text = content == null ? "" : content.endsWith("\n") || content.isEmpty() ? content : content + "\n";
        files.saveResult(id, path, text.equals(file.original()) ? ChangeFileStore.Status.UNCHANGED : ChangeFileStore.Status.GENERATED,
                file.original(), text, true, FileChecks.check(path, text), file.attempts());
        return detail(change);
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
            return detail(changes.save(change));
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
        changes.delete(change);
    }

    @EventListener(ApplicationReadyEvent.class)
    @Transactional
    public void failInterrupted() {
        int count = changes.failRunning("Interrupted because the server restarted. Analyze again.", OffsetDateTime.now());
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

    private ChangeContext context(ChangeRequest change, RequirementService.RequirementDetail requirement) {
        String designsJson = null;
        List<ScreenModel> models = new ArrayList<>();
        for (ScreenDesign design : designs.findByRequirementIdOrderByCreatedAt(change.getRequirementId())) {
            int version = design.getApprovedVersion() != null ? design.getApprovedVersion() : design.getCurrentVersion();
            designStore.model(design.getId(), version).ifPresent(models::add);
        }
        if (!models.isEmpty()) {
            designsJson = json.writeValueAsString(models);
        }
        String profile;
        try {
            profile = profiles.get(change.getWorkspaceId()).facts().stream().filter(f -> f.value() != null)
                    .map(f -> "- " + f.label() + ": " + f.value()).collect(Collectors.joining("\n"));
        } catch (NotFoundException e) {
            profile = "";
        }
        return new ChangeContext(change.getTitle(), json.writeValueAsString(requirement.spec()), designsJson, profile,
                structure(change.getWorkspaceId()));
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
        for (String query : queries) {
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

    private ChangePlan plan(ChangeRequest change) {
        if (change.getPlan() == null) {
            throw new BadRequestException("The change has no plan yet");
        }
        return json.readValue(change.getPlan(), ChangePlan.class);
    }

    private ChangeDetail detail(ChangeRequest c) {
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
                c.getCreatedAt(), c.getUpdatedAt(), views);
    }

    private static void requireStatus(ChangeRequest change, ChangeRequest.Status... allowed) {
        for (ChangeRequest.Status status : allowed) {
            if (change.getStatus() == status) {
                return;
            }
        }
        throw new ConflictException("The change is " + change.getStatus().name().toLowerCase().replace('_', ' ')
                + "; this is not possible now");
    }

    private ChangeRequest find(UUID id) {
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
