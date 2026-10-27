package com.obdx.factory.change;

import com.obdx.factory.common.BadRequestException;
import com.obdx.factory.jenkins.BuildLogParser;
import com.obdx.factory.jenkins.JenkinsClient;
import com.obdx.factory.jenkins.JenkinsProperties;
import com.obdx.factory.jenkins.JenkinsSettings;
import com.obdx.factory.jenkins.JenkinsSettingsService;
import com.obdx.factory.importing.StorageProperties;
import com.obdx.factory.requirements.RequirementService;
import com.obdx.factory.svn.SvnClient;
import com.obdx.factory.svn.SvnCredentials;
import com.obdx.factory.workspace.Workspace;
import com.obdx.factory.workspace.WorkspaceRepository;
import com.obdx.factory.workspace.WorkspaceService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.core.task.TaskExecutor;
import org.springframework.stereotype.Service;
import org.springframework.util.FileSystemUtils;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Builds a change with the bank's Jenkins jobs and, when the build fails in files of the change, lets the model fix
 * those files and builds again, a limited number of times. Errors in other files are reported, not "fixed".
 * Before each Jenkins round the quick checks run on the factory server; their errors are fixed first (in the same
 * rounds), so Jenkins only builds code that parses and follows the version pack.
 */
@Service
public class ChangeBuildService {

    private static final Logger log = LoggerFactory.getLogger(ChangeBuildService.class);
    /** The "job" name under which quick check rounds are listed with the builds. */
    static final String QUICK_CHECKS = "Quick checks";

    private final ChangeService changes;
    private final ChangeRequestRepository repository;
    private final ChangeFileStore files;
    private final ChangeBuildStore builds;
    private final JenkinsSettingsService jenkins;
    private final JenkinsProperties properties;
    private final CodeGenerator generator;
    private final RequirementService requirements;
    private final WorkspaceRepository workspaces;
    private final WorkspaceService workspaceService;
    private final SvnClient svn;
    private final StorageProperties storage;
    private final TaskExecutor executor;

    public ChangeBuildService(ChangeService changes, ChangeRequestRepository repository, ChangeFileStore files,
                              ChangeBuildStore builds, JenkinsSettingsService jenkins, JenkinsProperties properties,
                              CodeGenerator generator, RequirementService requirements, WorkspaceRepository workspaces,
                              WorkspaceService workspaceService, SvnClient svn, StorageProperties storage,
                              @Qualifier("buildExecutor") TaskExecutor executor) {
        this.changes = changes;
        this.repository = repository;
        this.files = files;
        this.builds = builds;
        this.jenkins = jenkins;
        this.properties = properties;
        this.generator = generator;
        this.requirements = requirements;
        this.workspaces = workspaces;
        this.workspaceService = workspaceService;
        this.svn = svn;
        this.storage = storage;
        this.executor = executor;
    }

    /** Starts building in the background: the delivered branch (BRANCH mode) or the patch (PATCH mode). */
    public ChangeService.ChangeDetail start(UUID changeId) {
        ChangeRequest change = changes.find(changeId);
        ChangeService.requireNotBuilding(change);
        JenkinsSettings settings = jenkins.require(change.getWorkspaceId());
        if (settings.mode() == JenkinsSettings.Mode.BRANCH) {
            ChangeService.requireStatus(change, ChangeRequest.Status.DELIVERED);
        } else {
            ChangeService.requireStatus(change, ChangeRequest.Status.GENERATED, ChangeRequest.Status.DELIVERED);
        }
        change.build("BUILDING", "Running the quick checks, then building with Jenkins (" + String.join(", ", settings.jobList()) + ")...");
        repository.save(change);
        executor.execute(() -> run(changeId));
        return changes.detail(change);
    }

    void run(UUID changeId) {
        ChangeRequest change = changes.find(changeId);
        try {
            JenkinsSettings settings = jenkins.require(change.getWorkspaceId());
            JenkinsClient client = jenkins.client(change.getWorkspaceId());
            int maxRounds = 1 + Math.max(0, properties.maxFixRounds());
            for (int round = 1; round <= maxRounds; round++) {
                if (!quickChecksPass(changeId, round, maxRounds)) {
                    if (round == maxRounds) {
                        return;
                    }
                    continue;
                }
                Map<UUID, List<BuildLogParser.BuildError>> failures = new LinkedHashMap<>();
                List<String> otherErrors = new ArrayList<>();
                boolean passed = true;
                for (String job : settings.jobList()) {
                    UUID buildId = builds.start(changeId, round, job);
                    JobOutcome outcome = buildOnce(client, settings, change, job, buildId);
                    if (!outcome.success()) {
                        passed = false;
                        failures.put(buildId, outcome.errors());
                        otherErrors.addAll(outcome.unmatched());
                    }
                }
                if (passed) {
                    finish(changeId, "PASSED", "Build passed in round " + round + " (" + String.join(", ", settings.jobList()) + ").");
                    return;
                }
                List<String> changedPaths = files.files(changeId).stream().filter(f -> f.generated() != null)
                        .map(ChangeFileStore.ChangeFile::path).toList();
                Map<String, List<BuildLogParser.BuildError>> byFile = new LinkedHashMap<>();
                for (List<BuildLogParser.BuildError> errors : failures.values()) {
                    for (BuildLogParser.BuildError error : errors) {
                        String path = BuildLogParser.matchFile(error.file(), changedPaths);
                        if (path != null) {
                            byFile.computeIfAbsent(path, k -> new ArrayList<>()).add(error);
                        }
                    }
                }
                if (byFile.isEmpty()) {
                    finish(changeId, "FAILED", "Build failed in round " + round + " with no errors in the files of this change"
                            + (otherErrors.isEmpty() ? "; see the build log." : ": " + String.join("; ", otherErrors.stream().limit(3).toList()))
                            + " These need a developer.");
                    return;
                }
                if (round == maxRounds) {
                    finish(changeId, "FAILED", "Build still failing after " + properties.maxFixRounds() + " fix round(s); "
                            + byFile.size() + " file(s) with errors. Review them and fix by hand.");
                    return;
                }
                List<String> fixed = fix(change, byFile, "The Jenkins build failed with these errors in this file:");
                failures.keySet().forEach(buildId -> builds.fixed(buildId, fixed));
                ChangeRequest latest = changes.find(changeId);
                latest.build("BUILDING", "Round " + round + " failed; the model fixed " + String.join(", ", fixed)
                        + ". Building again...");
                repository.save(latest);
            }
        } catch (RuntimeException e) {
            log.error("Jenkins build of change {} failed", changeId, e);
            finish(changeId, "FAILED", "Could not build with Jenkins: " + e.getMessage());
        }
    }

    /**
     * Runs the quick checks on the change's files. On errors, records them as a "Quick checks" row and, if rounds are
     * left, lets the model fix the files; in the last round the build ends as failed. Returns true when all passed.
     */
    private boolean quickChecksPass(UUID changeId, int round, int maxRounds) {
        Map<String, String> failing = changes.recheck(changes.find(changeId));
        if (failing.isEmpty()) {
            return true;
        }
        UUID checkId = builds.start(changeId, round, QUICK_CHECKS);
        Map<String, List<BuildLogParser.BuildError>> byFile = new LinkedHashMap<>();
        failing.forEach((path, message) -> byFile.put(path, message.lines().map(line -> new BuildLogParser.BuildError(path, 0, line)).toList()));
        builds.finish(checkId, "FAILURE", byFile.values().stream().flatMap(List::stream).map(e -> e.file() + " " + e.message()).toList(), null);
        if (round == maxRounds) {
            finish(changeId, "FAILED", "Quick checks still find errors in " + String.join(", ", failing.keySet())
                    + " after " + properties.maxFixRounds() + " fix round(s); Jenkins was not started. Fix them by hand.");
            return false;
        }
        List<String> fixed = fix(changes.find(changeId), byFile,
                "The quick checks (syntax and the OBDX version pack rules) found these problems in this file:");
        builds.fixed(checkId, fixed);
        ChangeRequest latest = changes.find(changeId);
        latest.build("BUILDING", "Quick checks found errors in round " + round + "; the model fixed " + String.join(", ", fixed)
                + ". Checking again before building...");
        repository.save(latest);
        return false;
    }

    private record JobOutcome(boolean success, List<BuildLogParser.BuildError> errors, List<String> unmatched) {
    }

    private JobOutcome buildOnce(JenkinsClient client, JenkinsSettings settings, ChangeRequest change, String job, UUID buildId) {
        Map<String, String> parameters = new LinkedHashMap<>();
        JenkinsClient.FileParameter file = null;
        if (settings.mode() == JenkinsSettings.Mode.BRANCH) {
            ChangeRequest current = changes.find(change.getId());
            parameters.put(settings.branchParameter(), settings.branchValue() == JenkinsSettings.BranchValue.URL
                    ? current.getBranchUrl() : branchPath(current).path());
        } else {
            file = new JenkinsClient.FileParameter(settings.patchParameter(), "change-" + change.getId().toString().substring(0, 8) + ".patch",
                    changes.patch(change.getId()).getBytes(StandardCharsets.UTF_8));
        }
        String queue = client.trigger(job, parameters, file);
        JenkinsClient.BuildRef build = client.waitForStart(queue);
        builds.running(buildId, build.number(), build.url());
        String result = client.waitForResult(build);
        if ("SUCCESS".equals(result)) {
            builds.finish(buildId, result, List.of(), null);
            return new JobOutcome(true, List.of(), List.of());
        }
        String console = client.console(build);
        List<BuildLogParser.BuildError> errors = new ArrayList<>(BuildLogParser.errors(console));
        List<String> tests = client.failedTests(build);
        List<String> changed = files.files(change.getId()).stream().filter(f -> f.generated() != null).map(ChangeFileStore.ChangeFile::path).toList();
        List<String> unmatched = new ArrayList<>();
        for (String test : tests) {
            // A failing test in a file of the change can be fixed like a compile error.
            String className = test.substring(0, test.indexOf(':')).replaceAll("\\.[^.]+$", "");
            String path = BuildLogParser.matchFile(className.replace('.', '/') + ".java", changed);
            if (path != null) {
                errors.add(new BuildLogParser.BuildError(path, 0, "Test failed: " + test));
            } else {
                unmatched.add("test " + test);
            }
        }
        errors.stream().filter(e -> BuildLogParser.matchFile(e.file(), changed) == null)
                .forEach(e -> unmatched.add(e.file() + ":" + e.line() + " " + e.message()));
        List<String> described = errors.stream().map(e -> e.file() + (e.line() > 0 ? ":" + e.line() : "") + " " + e.message()).toList();
        builds.finish(buildId, result, described, BuildLogParser.tail(console, 60));
        return new JobOutcome(false, errors, unmatched);
    }

    /** Lets the model fix each file with build errors, saves the fixes and, in BRANCH mode, commits them to the branch. */
    private List<String> fix(ChangeRequest change, Map<String, List<BuildLogParser.BuildError>> byFile, String heading) {
        ChangeRequest current = changes.find(change.getId());
        RequirementService.RequirementDetail requirement = requirements.get(current.getRequirementId());
        ChangeContext context = changes.context(current, requirement);
        ChangePlan plan = changes.plan(current);
        Map<String, String> others = files.files(change.getId()).stream().filter(f -> f.generated() != null && !byFile.containsKey(f.path()))
                .collect(Collectors.toMap(ChangeFileStore.ChangeFile::path, ChangeFileStore.ChangeFile::generated, (a, b) -> a, LinkedHashMap::new));
        List<String> fixed = new ArrayList<>();
        for (Map.Entry<String, List<BuildLogParser.BuildError>> entry : byFile.entrySet()) {
            ChangeFileStore.ChangeFile file = files.file(change.getId(), entry.getKey()).orElseThrow();
            ChangePlan.Item item = plan.items().stream().filter(i -> i.path().equals(file.path())).findFirst()
                    .orElse(new ChangePlan.Item(file.path(), file.action(), file.layer(), file.purpose(), List.of(), null));
            String note = heading + "\n" + entry.getValue().stream()
                    .map(e -> "- " + (e.line() > 0 ? "line " + e.line() + ": " : "") + e.message()).collect(Collectors.joining("\n"))
                    + "\nFix them and keep everything else unchanged.";
            CodeGenerator.Result result = generator.generate(context, plan, item, file.generated(), file.original(), Map.of(), others, note,
                    changes.scaffold(context, file.path(), file.original()));
            files.saveResult(change.getId(), file.path(), ChangeFileStore.Status.GENERATED, file.original(), result.content(),
                    file.edited(), result.check(), file.attempts() + result.attempts());
            fixed.add(file.path());
        }
        if (current.getBranchUrl() != null) {
            commitToBranch(current, fixed);
        }
        return fixed;
    }

    private void commitToBranch(ChangeRequest change, List<String> paths) {
        BranchPath branchPath = branchPath(change);
        String root = branchPath.root();
        String branch = branchPath.path();
        SvnCredentials credentials = branchPath.credentials();
        Path work = storage.root().resolve("changes").resolve(change.getId() + "-fix").toAbsolutePath();
        try {
            Files.createDirectories(work);
            List<String> operations = new ArrayList<>();
            for (int i = 0; i < paths.size(); i++) {
                Path content = work.resolve("file-" + i);
                Files.writeString(content, files.file(change.getId(), paths.get(i)).orElseThrow().generated(), StandardCharsets.UTF_8);
                operations.addAll(List.of("put", content.toString(), branch + "/" + paths.get(i)));
            }
            long revision = svn.multiCommit(root, "OBDX Development Factory: fix check and build errors in " + String.join(", ", paths)
                    + " (change " + change.getId().toString().substring(0, 8) + ")", operations, credentials);
            log.info("Committed build fixes for change {} in revision {}", change.getId(), revision);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        } finally {
            try {
                FileSystemUtils.deleteRecursively(work);
            } catch (IOException e) {
                log.warn("Could not clean up {}", work, e);
            }
        }
    }

    private void finish(UUID changeId, String status, String message) {
        ChangeRequest change = changes.find(changeId);
        change.build(status, message);
        repository.save(change);
    }

    private record BranchPath(String root, String path, SvnCredentials credentials) {
    }

    /** The change's branch relative to the repository root, for example "branches/factory/cr-1a2b3c4d". */
    private BranchPath branchPath(ChangeRequest change) {
        if (change.getBranchUrl() == null) {
            throw new BadRequestException("Commit the change to an SVN branch first");
        }
        Workspace workspace = workspaces.findById(change.getWorkspaceId()).orElseThrow();
        SvnCredentials credentials = workspaceService.credentials(workspace);
        String root = svn.info(workspace.getSvnUrl(), credentials).repositoryRoot();
        return new BranchPath(root, change.getBranchUrl().substring(root.length()).replaceAll("^/+", ""), credentials);
    }
}
