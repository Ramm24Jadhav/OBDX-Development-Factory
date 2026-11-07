package com.obdx.factory.modernization;

import com.obdx.factory.change.ChangeBuildStore;
import com.obdx.factory.change.ChangeService;
import com.obdx.factory.change.FileChecks;
import com.obdx.factory.common.NotFoundException;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * History: every run of a workspace with its result category (completed, with problems, failed, running), the facts
 * of its change (branch, files, tests, build), how long it took and what came of it, and per run its steps with their
 * durations, the files it produced and its delivery.
 */
@Service
public class RunHistory {

    /** One step of a run: an event of its change and how long until the next one (null for the last). */
    public record Step(OffsetDateTime at, String by, String text, Long minutes) {
    }

    public record FileRow(String path, String action, String check) {
    }

    /**
     * category: completed (delivered, nothing failing), problems (delivered or finished with failing tests or files),
     * failed (rejected, or the change or its build failed), running (still being written, built or reviewed).
     */
    public record Row(ModernizationService.RunView run, String category, String branch, int files, int screens, Integer testsPassed,
                      Integer testsTotal, int testsFailed, int fileProblems, Integer buildNumber, String buildResult, long minutes, String outcome,
                      List<Step> steps, List<FileRow> producedFiles) {
    }

    private final ModernizationService runs;
    private final ChangeService changes;
    private final ChangeBuildStore builds;

    public RunHistory(ModernizationService runs, ChangeService changes, ChangeBuildStore builds) {
        this.runs = runs;
        this.changes = changes;
        this.builds = builds;
    }

    public List<Row> rows(UUID workspaceId) {
        List<Row> out = new ArrayList<>();
        for (ModernizationService.RunView run : runs.runs(workspaceId)) {
            ChangeService.ChangeDetail change = null;
            if (run.changeId() != null) {
                try {
                    change = changes.get(run.changeId());
                } catch (NotFoundException e) {
                    // the change was deleted: the run stays, with what it knows
                }
            }
            out.add(row(run, change));
        }
        return out;
    }

    Row row(ModernizationService.RunView run, ChangeService.ChangeDetail change) {
        ChangeBuildStore.Build build = null;
        int passed = 0;
        int failed = 0;
        int total = 0;
        boolean published = false;
        if (change != null) {
            for (ChangeBuildStore.Build b : change.builds()) {
                if (b.buildNumber() != null) {
                    build = b;
                }
            }
            if (build != null) {
                ChangeBuildStore.Report report = builds.report(build.id());
                published = report.published();
                total = report.cases().size();
                passed = (int) report.cases().stream().filter(c -> "PASSED".equals(c.status())).count();
                failed = (int) report.cases().stream().filter(c -> "FAILED".equals(c.status())).count();
            }
        }
        int fileProblems = change == null ? 0 : (int) change.files().stream().filter(f -> f.checkStatus() == FileChecks.Status.FAILED).count();
        int files = change == null ? 0 : change.files().size();
        String buildResult = build == null ? null : build.result();
        String category = category(run.state(), change == null ? null : change.status().name(), buildResult, failed, fileProblems);
        OffsetDateTime end = run.finishedAt() != null ? run.finishedAt() : "running".equals(category) ? OffsetDateTime.now() : change != null ? change.updatedAt() : run.startedAt();
        long minutes = Math.max(0, Duration.between(run.startedAt(), end).toMinutes());
        String outcome = outcome(run, change, category, failed, fileProblems, build, files);
        List<Step> steps = new ArrayList<>();
        List<FileRow> produced = new ArrayList<>();
        if (change != null) {
            List<ChangeService.HistoryEvent> events = change.events();
            for (int i = 0; i < events.size(); i++) {
                ChangeService.HistoryEvent e = events.get(i);
                Long took = i + 1 < events.size() && e.at() != null && events.get(i + 1).at() != null ? Duration.between(e.at(), events.get(i + 1).at()).toMinutes() : null;
                steps.add(new Step(e.at(), e.by(), e.text(), took));
            }
            change.files().stream().limit(500).forEach(f -> produced.add(new FileRow(f.path(), f.action(), f.checkStatus() == null ? "NOT_CHECKED" : f.checkStatus().name())));
        }
        return new Row(run, category, change == null ? null : change.branchUrl(), files, run.screens() == null ? 0 : run.screens().size(),
                published ? passed : null, published ? total : null, failed, fileProblems, build == null ? null : build.buildNumber(), buildResult,
                minutes, outcome, steps, produced);
    }

    static String category(String state, String changeStatus, String buildResult, int testsFailed, int fileProblems) {
        if ("rejected".equals(state) || "failed".equals(state) || "FAILED".equals(changeStatus)) {
            return "failed";
        }
        if ("delivered".equals(state)) {
            return testsFailed > 0 || fileProblems > 0 || (buildResult != null && !"SUCCESS".equals(buildResult)) ? "problems" : "completed";
        }
        if (buildResult != null && "FAILURE".equals(buildResult)) {
            return "failed";
        }
        return "running";
    }

    private static String outcome(ModernizationService.RunView run, ChangeService.ChangeDetail change, String category, int testsFailed, int fileProblems,
                                  ChangeBuildStore.Build build, int files) {
        if ("rejected".equals(run.state())) {
            return "Rejected: " + (run.message() == null ? "no reason given" : run.message());
        }
        if ("failed".equals(category)) {
            if (build != null && "FAILURE".equals(build.result())) {
                return "Build failed" + (build.errors().isEmpty() ? "" : ": " + build.errors().getFirst());
            }
            return change == null || change.message() == null ? "Failed" : change.message();
        }
        if ("problems".equals(category)) {
            List<String> parts = new ArrayList<>();
            if (testsFailed > 0) {
                parts.add(testsFailed + " test failure" + (testsFailed == 1 ? "" : "s"));
            }
            if (fileProblems > 0) {
                parts.add(fileProblems + " file" + (fileProblems == 1 ? "" : "s") + " with problems");
            }
            if (parts.isEmpty() && build != null) {
                parts.add("build " + build.result());
            }
            return "Delivered with " + String.join(", ", parts);
        }
        if ("completed".equals(category)) {
            return files + " file" + (files == 1 ? "" : "s") + " delivered" + (run.deliveredRevision() == null ? "" : " at r" + run.deliveredRevision());
        }
        return change == null ? "Starting" : change.message() == null ? change.status().name().toLowerCase().replace('_', ' ') : change.message();
    }
}
