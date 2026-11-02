package com.obdx.factory.change;

import com.obdx.factory.auth.AccessGuard;
import com.obdx.factory.auth.AuditLog;
import com.obdx.factory.auth.WorkspaceRole.Permission;
import com.obdx.factory.common.BadRequestException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

@RestController
public class ChangeController {

    private final ChangeService service;
    private final ChangeBuildService builds;
    private final ChangeBranchService branches;
    private final AccessGuard guard;
    private final AuditLog audit;

    public ChangeController(ChangeService service, ChangeBuildService builds, ChangeBranchService branches, AccessGuard guard,
                            AuditLog audit) {
        this.branches = branches;
        this.service = service;
        this.builds = builds;
        this.guard = guard;
        this.audit = audit;
    }

    public record RegenerateRequest(String path, String note) {
    }

    public record EditRequest(String path, String content) {
    }

    @GetMapping("/api/workspaces/{workspaceId}/changes")
    public List<ChangeService.ChangeSummary> list(@PathVariable UUID workspaceId) {
        guard.require(workspaceId, Permission.VIEW);
        return service.list(workspaceId);
    }

    /** Every change of the workspace with its files and builds, in one request (the dashboard and notifications). */
    @GetMapping("/api/workspaces/{workspaceId}/changes/details")
    public List<ChangeService.ChangeDetail> details(@PathVariable UUID workspaceId) {
        guard.require(workspaceId, Permission.VIEW);
        return service.details(workspaceId);
    }

    @PostMapping("/api/requirements/{requirementId}/changes")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public ChangeService.ChangeDetail create(@PathVariable UUID requirementId) {
        var user = guard.requireForRequirement(requirementId, Permission.MANAGE_CODE);
        ChangeService.ChangeDetail change = service.create(requirementId, user.getDisplayName());
        audit.record("CHANGE_CREATED", change.workspaceId(), change.title(), change.id().toString());
        return change;
    }

    @GetMapping("/api/changes/{id}")
    public ChangeService.ChangeDetail get(@PathVariable UUID id) {
        guard.requireForChange(id, Permission.VIEW);
        return service.get(id);
    }

    @GetMapping("/api/changes/{id}/file")
    public ChangeService.FileContent file(@PathVariable UUID id, @RequestParam String path) {
        guard.requireForChange(id, Permission.VIEW);
        return service.fileContent(id, path);
    }

    @PostMapping("/api/changes/{id}/analyze")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public ChangeService.ChangeDetail analyze(@PathVariable UUID id, @RequestParam(value = "fresh", defaultValue = "false") boolean fresh) {
        guard.requireForChange(id, Permission.MANAGE_CODE);
        return service.analyzeAgain(id, fresh);
    }

    /** The body is the edited plan as JSON. */
    @PutMapping(path = "/api/changes/{id}/plan", consumes = MediaType.APPLICATION_JSON_VALUE)
    public ChangeService.ChangeDetail updatePlan(@PathVariable UUID id, @RequestBody String planJson) {
        var user = guard.requireForChange(id, Permission.MANAGE_CODE);
        return service.updatePlan(id, planJson, user.getDisplayName());
    }

    /** The plan's revisions, and the comments, request for changes and approval on them. */
    @GetMapping("/api/changes/{id}/plan-review")
    public PlanReviewStore.Review planReview(@PathVariable UUID id) {
        guard.requireForChange(id, Permission.VIEW);
        return service.planReview(id);
    }

    /** kind COMMENT needs the right to comment; CHANGES_REQUESTED (not approving the plan as it is) the right to approve. */
    public record PlanComment(PlanReviewStore.Kind kind, String text) {
    }

    @PostMapping("/api/changes/{id}/plan-comments")
    @ResponseStatus(HttpStatus.CREATED)
    public PlanReviewStore.Comment commentOnPlan(@PathVariable UUID id, @RequestBody PlanComment request) {
        PlanReviewStore.Kind kind = request.kind() == null ? PlanReviewStore.Kind.COMMENT : request.kind();
        var user = guard.requireForChange(id, kind == PlanReviewStore.Kind.COMMENT ? Permission.COMMENT : Permission.APPROVE);
        PlanReviewStore.Comment comment = service.commentOnPlan(id, kind, request.text(), user.getDisplayName());
        if (kind == PlanReviewStore.Kind.CHANGES_REQUESTED) {
            ChangeService.ChangeDetail change = service.get(id);
            audit.record("CHANGE_PLAN_CHANGES_REQUESTED", change.workspaceId(), change.title(), comment.text());
        }
        return comment;
    }

    @PostMapping("/api/changes/{id}/approve-plan")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public ChangeService.ChangeDetail approvePlan(@PathVariable UUID id,
                                                  @RequestParam(value = "incomplete", defaultValue = "false") boolean incomplete,
                                                  @RequestParam(value = "revision", required = false) Integer revision) {
        var user = guard.requireForChange(id, Permission.APPROVE);
        ChangeService.ChangeDetail change = service.approvePlan(id, user.getDisplayName(), incomplete, revision);
        audit.record("CHANGE_PLAN_APPROVED", change.workspaceId(), change.title(), change.plan().items().size() + " file(s)"
                + (change.plan().incomplete() != null ? ", revision " + revision + " approved although files may be missing (confirmed)" : ""));
        return change;
    }

    /** Writes the planned files not written yet (after generation stopped at the model's limit). */
    @PostMapping("/api/changes/{id}/continue")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public ChangeService.ChangeDetail continueGeneration(@PathVariable UUID id) {
        guard.requireForChange(id, Permission.MANAGE_CODE);
        return service.continueGeneration(id);
    }

    @PostMapping("/api/changes/{id}/regenerate")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public ChangeService.ChangeDetail regenerate(@PathVariable UUID id, @RequestBody RegenerateRequest request) {
        guard.requireForChange(id, Permission.MANAGE_CODE);
        return service.regenerate(id, request.path(), request.note());
    }

    @PutMapping("/api/changes/{id}/file")
    public ChangeService.ChangeDetail editFile(@PathVariable UUID id, @RequestBody EditRequest request) {
        guard.requireForChange(id, Permission.MANAGE_CODE);
        ChangeService.ChangeDetail change = service.editFile(id, request.path(), request.content());
        audit.record("CHANGE_FILE_EDITED", change.workspaceId(), request.path(), change.title());
        return change;
    }

    @GetMapping("/api/changes/{id}/patch")
    public ResponseEntity<String> patch(@PathVariable UUID id, @RequestParam(value = "incomplete", defaultValue = "false") boolean incomplete) {
        guard.requireForChange(id, Permission.VIEW);
        String patch = service.patch(id, incomplete);
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType("text/x-diff;charset=UTF-8"))
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"change-" + id.toString().substring(0, 8) + ".patch\"")
                .body(patch);
    }

    @PostMapping("/api/changes/{id}/deliver")
    public ChangeService.ChangeDetail deliver(@PathVariable UUID id, @RequestParam(value = "incomplete", defaultValue = "false") boolean incomplete) {
        guard.requireForChange(id, Permission.MANAGE_CODE);
        ChangeService.ChangeDetail change = service.deliverToBranch(id, incomplete);
        long written = change.files().stream().filter(f -> f.status() == ChangeFileStore.Status.GENERATED).count();
        long notWritten = change.files().stream().filter(f -> f.status() == ChangeFileStore.Status.PENDING
                || f.status() == ChangeFileStore.Status.FAILED).count();
        audit.record("CHANGE_DELIVERED", change.workspaceId(), change.branchUrl(), "revision " + change.deliveredRevision() + ", "
                + written + " file(s) committed" + (incomplete ? ", " + notWritten + " planned file(s) not written left out (confirmed)" : ""));
        return change;
    }

    /** Builds the change with the workspace's Jenkins jobs, fixing build errors in its files a limited number of times. */
    public record CloseRequest(ChangeRequest.CloseReason reason, Boolean force) {
    }

    /** Closes the change as merged or abandoned; removes its delivery branch. */
    @PostMapping("/api/changes/{id}/close")
    public ChangeService.ChangeDetail close(@PathVariable UUID id, @RequestBody CloseRequest request) {
        var user = guard.requireForChange(id, Permission.MANAGE_CODE);
        if (request.reason() == null) {
            throw new BadRequestException("Give a reason: MERGED or ABANDONED");
        }
        ChangeService.ChangeDetail change = branches.close(id, request.reason(), Boolean.TRUE.equals(request.force()), user.getDisplayName());
        audit.record("CHANGE_CLOSED", change.workspaceId(), change.title(), request.reason().name().toLowerCase()
                + (Boolean.TRUE.equals(request.force()) ? " (closed anyway)" : "")
                + (change.branchDeletedRevision() != null ? "; branch removed in r" + change.branchDeletedRevision() : ""));
        return change;
    }

    @PostMapping("/api/changes/{id}/check")
    public ChangeService.ChangeDetail checkAgain(@PathVariable UUID id) {
        guard.requireForChange(id, Permission.MANAGE_CODE);
        return service.checkAgain(id);
    }

    @PostMapping("/api/changes/{id}/build")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public ChangeService.ChangeDetail build(@PathVariable UUID id) {
        guard.requireForChange(id, Permission.MANAGE_CODE);
        ChangeService.ChangeDetail change = builds.start(id);
        audit.record("CHANGE_BUILD_STARTED", change.workspaceId(), change.title(), null);
        return change;
    }

    @DeleteMapping("/api/changes/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable UUID id) {
        guard.requireForChange(id, Permission.MANAGE_CODE);
        ChangeService.ChangeDetail change = service.get(id);
        service.delete(id);
        audit.record("CHANGE_DELETED", change.workspaceId(), change.title(), null);
    }
}
