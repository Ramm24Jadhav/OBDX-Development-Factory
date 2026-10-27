package com.obdx.factory.change;

import com.obdx.factory.auth.AccessGuard;
import com.obdx.factory.auth.AuditLog;
import com.obdx.factory.auth.WorkspaceRole.Permission;
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
    private final AccessGuard guard;
    private final AuditLog audit;

    public ChangeController(ChangeService service, ChangeBuildService builds, AccessGuard guard, AuditLog audit) {
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
    public ChangeService.ChangeDetail analyze(@PathVariable UUID id) {
        guard.requireForChange(id, Permission.MANAGE_CODE);
        return service.analyzeAgain(id);
    }

    /** The body is the edited plan as JSON. */
    @PutMapping(path = "/api/changes/{id}/plan", consumes = MediaType.APPLICATION_JSON_VALUE)
    public ChangeService.ChangeDetail updatePlan(@PathVariable UUID id, @RequestBody String planJson) {
        guard.requireForChange(id, Permission.MANAGE_CODE);
        return service.updatePlan(id, planJson);
    }

    @PostMapping("/api/changes/{id}/approve-plan")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public ChangeService.ChangeDetail approvePlan(@PathVariable UUID id) {
        var user = guard.requireForChange(id, Permission.APPROVE);
        ChangeService.ChangeDetail change = service.approvePlan(id, user.getDisplayName());
        audit.record("CHANGE_PLAN_APPROVED", change.workspaceId(), change.title(), change.plan().items().size() + " file(s)");
        return change;
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
    public ResponseEntity<String> patch(@PathVariable UUID id) {
        guard.requireForChange(id, Permission.VIEW);
        String patch = service.patch(id);
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType("text/x-diff;charset=UTF-8"))
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"change-" + id.toString().substring(0, 8) + ".patch\"")
                .body(patch);
    }

    @PostMapping("/api/changes/{id}/deliver")
    public ChangeService.ChangeDetail deliver(@PathVariable UUID id) {
        guard.requireForChange(id, Permission.MANAGE_CODE);
        ChangeService.ChangeDetail change = service.deliverToBranch(id);
        audit.record("CHANGE_DELIVERED", change.workspaceId(), change.branchUrl(), "revision " + change.deliveredRevision());
        return change;
    }

    /** Builds the change with the workspace's Jenkins jobs, fixing build errors in its files a limited number of times. */
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
