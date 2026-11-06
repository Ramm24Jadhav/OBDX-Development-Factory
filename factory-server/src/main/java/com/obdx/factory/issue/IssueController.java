package com.obdx.factory.issue;

import com.obdx.factory.auth.AccessGuard;
import com.obdx.factory.auth.AppUser;
import com.obdx.factory.auth.AuditLog;
import com.obdx.factory.auth.WorkspaceRole.Permission;
import com.obdx.factory.common.BadRequestException;
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
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * Issue Analyzer. Every member of a workspace can file and analyze issues and record what fixed them; leads delete
 * issues and share resolutions as product knowledge.
 */
@RestController
public class IssueController {

    private static final String BASE = "/api/workspaces/{workspaceId}/issues";

    private final IssueService service;
    private final AccessGuard guard;
    private final AuditLog audit;

    public IssueController(IssueService service, AccessGuard guard, AuditLog audit) {
        this.service = service;
        this.guard = guard;
        this.audit = audit;
    }

    @GetMapping(BASE)
    public List<IssueService.IssueSummary> list(@PathVariable UUID workspaceId) {
        guard.require(workspaceId, Permission.VIEW);
        return service.list(workspaceId);
    }

    @PostMapping(path = BASE, consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @ResponseStatus(HttpStatus.ACCEPTED)
    public IssueService.IssueDetail create(@PathVariable UUID workspaceId,
                                           @RequestParam(value = "title", required = false) String title,
                                           @RequestParam(value = "description", required = false) String description,
                                           @RequestParam(value = "environment", required = false) String environment,
                                           @RequestParam(value = "logText", required = false) String logText,
                                           @RequestParam(value = "files", required = false) List<MultipartFile> files) throws IOException {
        AppUser user = guard.require(workspaceId, Permission.VIEW);
        List<IssueService.Upload> uploads = new ArrayList<>();
        for (MultipartFile file : files == null ? List.<MultipartFile>of() : files) {
            if (!file.isEmpty()) {
                uploads.add(new IssueService.Upload(file.getOriginalFilename(), file.getBytes()));
            }
        }
        IssueService.IssueDetail created = service.create(workspaceId, title, description, environment, logText, uploads, user.getUsername());
        audit.record("ISSUE_CREATED", workspaceId, created.title(), uploads.size() + " file(s)");
        return created;
    }

    @GetMapping(BASE + "/{id}")
    public IssueService.IssueDetail get(@PathVariable UUID workspaceId, @PathVariable UUID id) {
        guard.require(workspaceId, Permission.VIEW);
        return service.detail(workspaceId, id);
    }

    @GetMapping(BASE + "/{id}/files/{position}")
    public ResponseEntity<byte[]> file(@PathVariable UUID workspaceId, @PathVariable UUID id, @PathVariable int position) {
        guard.require(workspaceId, Permission.VIEW);
        byte[] content = service.file(workspaceId, id, position);
        return ResponseEntity.ok().contentType(MediaType.parseMediaType(service.mimeType(id, position))).body(content);
    }

    @PutMapping(BASE + "/{id}/files/{position}/text")
    public IssueService.IssueDetail screenshotText(@PathVariable UUID workspaceId, @PathVariable UUID id, @PathVariable int position,
                                                   @RequestBody TextRequest request) {
        guard.require(workspaceId, Permission.VIEW);
        return service.updateScreenshotText(workspaceId, id, position, request.text());
    }

    @PostMapping(BASE + "/{id}/analyze")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public IssueService.IssueDetail analyze(@PathVariable UUID workspaceId, @PathVariable UUID id) {
        guard.require(workspaceId, Permission.VIEW);
        return service.analyze(workspaceId, id);
    }

    @PostMapping(BASE + "/{id}/outcome")
    public IssueService.IssueDetail outcome(@PathVariable UUID workspaceId, @PathVariable UUID id, @RequestBody OutcomeRequest request) {
        guard.require(workspaceId, Permission.VIEW);
        IssueRepository.Status status;
        try {
            status = IssueRepository.Status.valueOf(request.status());
        } catch (IllegalArgumentException | NullPointerException e) {
            throw new BadRequestException("The outcome must be RESOLVED, NOT_RESOLVED or ESCALATED");
        }
        IssueService.IssueDetail detail = service.outcome(workspaceId, id, status, request.resolution());
        audit.record("ISSUE_" + status.name(), workspaceId, detail.title(), null);
        return detail;
    }

    @PostMapping(BASE + "/{id}/sr-draft")
    public IssueService.IssueDetail srDraft(@PathVariable UUID workspaceId, @PathVariable UUID id) {
        guard.require(workspaceId, Permission.VIEW);
        return service.srDraft(workspaceId, id);
    }

    @DeleteMapping(BASE + "/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable UUID workspaceId, @PathVariable UUID id) {
        guard.require(workspaceId, Permission.APPROVE);
        String title = service.detail(workspaceId, id).title();
        service.delete(workspaceId, id);
        audit.record("ISSUE_DELETED", workspaceId, title, null);
    }

    @PostMapping(BASE + "/{id}/share")
    public IssueService.KnowledgeView share(@PathVariable UUID workspaceId, @PathVariable UUID id,
                                            @RequestBody IssueService.ShareRequest request) {
        AppUser user = guard.require(workspaceId, Permission.APPROVE);
        IssueService.KnowledgeView shared = service.share(workspaceId, id, request, user.getUsername());
        audit.record("ISSUE_SHARED", workspaceId, shared.title(), shared.id().toString());
        return shared;
    }

    /** Shared product knowledge, for every signed-in user. */
    @GetMapping("/api/issue-knowledge")
    public List<IssueService.KnowledgeView> knowledge() {
        AppUser user = guard.current();
        return service.knowledge(user.getUsername(), user.isAdmin());
    }

    @DeleteMapping("/api/issue-knowledge/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void withdraw(@PathVariable UUID id) {
        AppUser user = guard.current();
        service.withdraw(id, user.getUsername(), user.isAdmin());
        audit.record("KNOWLEDGE_WITHDRAWN", null, id.toString(), null);
    }

    public record TextRequest(String text) {
    }

    public record OutcomeRequest(String status, String resolution) {
    }
}
