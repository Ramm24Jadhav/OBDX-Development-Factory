package com.obdx.factory.requirements;

import com.obdx.factory.auth.WorkspaceRole.Permission;
import com.obdx.factory.auth.AuditLog;
import com.obdx.factory.auth.AccessGuard;
import com.obdx.factory.common.BadRequestException;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
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
import java.util.List;
import java.util.UUID;

@RestController
public class RequirementController {

    /** The largest requirement document taken (design and code imports keep the larger multipart limit). */
    static final long MAX_DOCUMENT_BYTES = 25L * 1024 * 1024;

    private final RequirementService service;
    private final AccessGuard guard;
    private final AuditLog audit;

    public RequirementController(RequirementService service, AccessGuard guard, AuditLog audit) {
        this.service = service;
        this.guard = guard;
        this.audit = audit;
    }

    @GetMapping("/api/workspaces/{workspaceId}/requirements")
    public List<RequirementService.RequirementSummary> list(@PathVariable UUID workspaceId) {
        guard.require(workspaceId, Permission.VIEW);
        return service.list(workspaceId);
    }

    @PostMapping(path = "/api/workspaces/{workspaceId}/requirements", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @ResponseStatus(HttpStatus.ACCEPTED)
    public RequirementService.RequirementDetail upload(@PathVariable UUID workspaceId,
                                                       @RequestParam("file") MultipartFile file,
                                                       @RequestParam(value = "title", required = false) String title) throws IOException {
        guard.require(workspaceId, Permission.EDIT_REQUIREMENTS);
        if (file.isEmpty() || file.getOriginalFilename() == null) {
            throw new BadRequestException("Choose a file to upload");
        }
        if (file.getSize() > MAX_DOCUMENT_BYTES) {
            // Read into memory and unpacked: a BRD is a few MB; larger files are mostly images
            throw new BadRequestException("The document is larger than " + MAX_DOCUMENT_BYTES / (1024 * 1024) + " MB. Remove large images "
                    + "or split it, then upload it again.");
        }
        RequirementService.RequirementDetail created = service.upload(workspaceId, title, file.getOriginalFilename(), file.getBytes());
        audit.record("REQUIREMENT_UPLOADED", workspaceId, created.title(), file.getOriginalFilename());
        return created;
    }

    @PostMapping(path = "/api/workspaces/{workspaceId}/requirements/text", consumes = MediaType.APPLICATION_JSON_VALUE)
    @ResponseStatus(HttpStatus.ACCEPTED)
    public RequirementService.RequirementDetail fromText(@PathVariable UUID workspaceId, @RequestBody TextRequest request) {
        guard.require(workspaceId, Permission.EDIT_REQUIREMENTS);
        RequirementService.RequirementDetail created = service.fromText(workspaceId, request.title(), request.text());
        audit.record("REQUIREMENT_CREATED", workspaceId, created.title(), null);
        return created;
    }

    @GetMapping("/api/requirements/{id}")
    public RequirementService.RequirementDetail get(@PathVariable UUID id) {
        guard.requireForRequirement(id, Permission.VIEW);
        return service.get(id);
    }

    @PutMapping("/api/requirements/{id}/answers")
    public RequirementService.RequirementDetail saveAnswers(@PathVariable UUID id, @RequestBody AnswersRequest request) {
        guard.requireForRequirement(id, Permission.EDIT_REQUIREMENTS);
        return service.saveAnswers(id, request.answers() == null ? List.of() : request.answers());
    }

    @PostMapping("/api/requirements/{id}/refine")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public RequirementService.RequirementDetail refine(@PathVariable UUID id) {
        guard.requireForRequirement(id, Permission.EDIT_REQUIREMENTS);
        return service.refine(id);
    }

    /** The body is the edited spec as JSON. */
    @PutMapping(path = "/api/requirements/{id}/spec", consumes = MediaType.APPLICATION_JSON_VALUE)
    public RequirementService.RequirementDetail updateSpec(@PathVariable UUID id, @RequestBody String specJson) {
        guard.requireForRequirement(id, Permission.EDIT_REQUIREMENTS);
        return service.updateSpec(id, specJson);
    }

    @PostMapping("/api/requirements/{id}/approve")
    public RequirementService.RequirementDetail approve(@PathVariable UUID id) {
        var user = guard.requireForRequirement(id, Permission.APPROVE);
        RequirementService.RequirementDetail approved = service.approve(id, user.getDisplayName());
        audit.record("REQUIREMENT_APPROVED", approved.workspaceId(), approved.title(), "spec version " + approved.currentVersion());
        return approved;
    }

    @PostMapping("/api/requirements/{id}/retry")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public RequirementService.RequirementDetail retry(@PathVariable UUID id) {
        guard.requireForRequirement(id, Permission.EDIT_REQUIREMENTS);
        return service.retry(id);
    }

    @DeleteMapping("/api/requirements/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable UUID id) {
        guard.requireForRequirement(id, Permission.EDIT_REQUIREMENTS);
        RequirementService.RequirementDetail requirement = service.get(id);
        service.delete(id);
        audit.record("REQUIREMENT_DELETED", requirement.workspaceId(), requirement.title(), null);
    }

    public record TextRequest(String title, String text) {
    }

    public record AnswersRequest(List<RequirementService.Answer> answers) {
    }
}
