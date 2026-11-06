package com.obdx.factory.issue;

import com.obdx.factory.common.BadRequestException;
import com.obdx.factory.issue.IssueRepository.Issue;
import com.obdx.factory.issue.IssueRepository.IssueFile;
import com.obdx.factory.model.ModelGateway;
import com.obdx.factory.model.ModelGatewayException;
import com.obdx.factory.workspace.Workspace;
import com.obdx.factory.workspace.WorkspaceRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.core.task.TaskExecutor;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * What happens after a diagnosis: fix checks (new logs and screenshots compared with the original error, without a
 * model), engineers' questions (answered by the model in the background), and what a bank administrator sees on the
 * follow link.
 */
@Service
public class IssueFollowUps {

    private static final Logger log = LoggerFactory.getLogger(IssueFollowUps.class);
    private static final int MAX_QUESTION = 2000;

    /** What a bank administrator sees: never evidence, code, files, ids or other issues. */
    public record FollowView(String title, String status, String statusText, boolean released, String summary,
                             List<FollowStep> steps, List<FollowCheck> checks, OffsetDateTime createdAt) {
    }

    public record FollowStep(String action, String why) {
    }

    public record FollowCheck(String result, String summary, String by, OffsetDateTime at) {
    }

    private final IssueService service;
    private final IssueRepository issues;
    private final IssueAnalyzer analyzer;
    private final WorkspaceRepository workspaces;
    private final TaskExecutor executor;

    public IssueFollowUps(IssueService service, IssueRepository issues, IssueAnalyzer analyzer, WorkspaceRepository workspaces,
                          @Qualifier("issueExecutor") TaskExecutor executor) {
        this.service = service;
        this.issues = issues;
        this.analyzer = analyzer;
        this.workspaces = workspaces;
        this.executor = executor;
    }

    /** Compares logs and screenshots taken after a fix with the original error, in the background. */
    public IssueService.IssueDetail check(UUID workspaceId, UUID id, String logText, List<IssueService.Upload> uploads, String by) {
        Issue issue = service.find(workspaceId, id);
        if (issue.evidence() == null) {
            throw new BadRequestException("Analyze the issue first, then check the fix");
        }
        boolean pasted = logText != null && !logText.isBlank();
        if (!pasted && uploads.isEmpty()) {
            throw new BadRequestException("Paste or attach the logs or screenshots taken after the fix");
        }
        if (uploads.size() > IssueService.MAX_FILES) {
            throw new BadRequestException("Attach at most " + IssueService.MAX_FILES + " files");
        }
        List<String[]> kinds = uploads.stream().map(IssueService::kindOf).toList();
        UUID checkId = UUID.randomUUID();
        issues.insertCheck(checkId, id, "CHECKING", "Comparing the new logs with the original error...", Evidence.empty(), by);
        int position = issues.nextFilePosition(id);
        if (pasted) {
            issues.insertFile(id, position++, "pasted after the fix.txt", "LOG", "text/plain", logText.getBytes(StandardCharsets.UTF_8), checkId);
        }
        for (int i = 0; i < uploads.size(); i++) {
            issues.insertFile(id, position++, cut(uploads.get(i).name(), 300), kinds.get(i)[0], kinds.get(i)[1], uploads.get(i).content(), checkId);
        }
        issues.touch(id);
        executor.execute(() -> runCheck(id, checkId));
        return service.detail(workspaceId, id);
    }

    void runCheck(UUID id, UUID checkId) {
        try {
            Issue issue = issues.find(id).orElseThrow();
            List<IssueFile> files = issues.checkFiles(checkId);
            List<String> notes = new ArrayList<>();
            service.readScreenshots(id, files, notes);
            Evidence latest = LogEvidenceParser.parse(service.fileSources(id, issues.checkFiles(checkId)));
            Signatures.Comparison comparison = Signatures.compare(issue.evidence(), latest);
            issues.updateCheck(checkId, comparison.result(), comparison.summary() + (notes.isEmpty() ? "" : " " + String.join(" ", notes)), latest);
        } catch (RuntimeException e) {
            log.warn("Fix check {} of issue {} failed", checkId, id, e);
            issues.updateCheck(checkId, "FAILED", "The check failed: " + e.getMessage(), Evidence.empty());
        }
        issues.touch(id);
    }

    /** What the bank said without new files ("it works now", "still failing"). */
    void bankAnswer(UUID id, String result, String summary, String by) {
        issues.insertCheck(UUID.randomUUID(), id, result, summary, Evidence.empty(), by);
        issues.touch(id);
    }

    /** An engineer's question about the issue, answered by the model in the background. */
    public IssueService.IssueDetail ask(UUID workspaceId, UUID id, String question, String by) {
        service.find(workspaceId, id);
        if (question == null || question.isBlank()) {
            throw new BadRequestException("Type a question");
        }
        if (question.length() > MAX_QUESTION) {
            throw new BadRequestException("Keep the question under " + MAX_QUESTION + " characters");
        }
        UUID questionId = UUID.randomUUID();
        issues.insertQuestion(questionId, id, question.strip(), by);
        issues.touch(id);
        executor.execute(() -> runAnswer(id, questionId));
        return service.detail(workspaceId, id);
    }

    void runAnswer(UUID id, UUID questionId) {
        try {
            Issue issue = issues.find(id).orElseThrow();
            Workspace workspace = workspaces.findById(issue.workspaceId()).orElseThrow();
            List<String> earlier = new ArrayList<>();
            String question = null;
            for (IssueRepository.Question q : issues.questions(id)) {
                if (q.id().equals(questionId)) {
                    question = q.question();
                } else if ("ANSWERED".equals(q.status())) {
                    earlier.add("Q: " + q.question() + " A: " + q.answer());
                }
            }
            ModelGateway.ChatResult result = analyzer.answer(service.context(issue, workspace),
                    issue.evidence() == null ? Evidence.empty() : issue.evidence(), issue.diagnosis(), earlier, question);
            issues.setAnswer(questionId, "ANSWERED", result.reply() == null ? "" : result.reply().strip(), result.model());
        } catch (ModelGatewayException e) {
            issues.setAnswer(questionId, "FAILED", "The model could not be used: " + e.getMessage() + " Check the Models page, then ask again.", null);
        } catch (RuntimeException e) {
            log.warn("Answering question {} of issue {} failed", questionId, id, e);
            issues.setAnswer(questionId, "FAILED", "The answer failed: " + e.getMessage(), null);
        }
        issues.touch(id);
    }

    /** The issue as the bank administrator who reported it sees it. */
    public FollowView follow(Issue issue) {
        boolean released = issue.releasedAt() != null && issue.diagnosis() != null;
        String statusText = switch (issue.status()) {
            case RESOLVED -> "Resolved";
            case ESCALATED -> "Raised with Oracle";
            case NOT_RESOLVED -> "Still being looked at";
            default -> released ? "Diagnosis ready" : "Being looked at by the support team";
        };
        Diagnosis d = issue.diagnosis();
        String summary = !released ? null : d.summary() != null && !d.summary().isBlank() ? d.summary() : d.rootCause();
        List<FollowStep> steps = !released ? List.of() : d.steps().stream().filter(s -> Diagnosis.ADMIN.equals(s.audience()))
                .map(s -> new FollowStep(s.action(), s.why())).toList();
        List<FollowCheck> checks = issues.checks(issue.id()).stream()
                .map(c -> new FollowCheck(c.result(), c.summary(), c.createdBy(), c.createdAt())).toList();
        return new FollowView(issue.title(), issue.status().name(), statusText, released, summary, steps, checks, issue.createdAt());
    }

    private static String cut(String value, int max) {
        return value == null || value.length() <= max ? value : value.substring(0, max);
    }
}
