package com.obdx.factory.issue;

import com.obdx.factory.auth.AccessGuard;
import com.obdx.factory.auth.AppUser;
import com.obdx.factory.auth.AuditLog;
import com.obdx.factory.auth.WorkspaceRole.Permission;
import com.obdx.factory.common.BadRequestException;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.AccessDeniedException;
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
    private final IssueFollowUps followUps;
    private final IssueLinks links;
    private final AccessGuard guard;
    private final AuditLog audit;

    public IssueController(IssueService service, IssueFollowUps followUps, IssueLinks links, AccessGuard guard, AuditLog audit) {
        this.service = service;
        this.followUps = followUps;
        this.links = links;
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
        List<IssueService.Upload> uploads = uploads(files);
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
        IssueRepository.Status status = status(request);
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

    /** Shows the diagnosis to the bank on the issue's follow link (engineers: developers and leads). */
    @PostMapping(BASE + "/{id}/release")
    public IssueService.IssueDetail release(@PathVariable UUID workspaceId, @PathVariable UUID id) {
        AppUser user = guard.require(workspaceId, Permission.MANAGE_CODE);
        IssueService.IssueDetail detail = service.release(workspaceId, id, user.getUsername());
        audit.record("ISSUE_RELEASED", workspaceId, detail.title(), null);
        return detail;
    }

    /** The same outcome for every issue with the same error (leads). */
    @PostMapping(BASE + "/{id}/group-outcome")
    public IssueService.IssueDetail groupOutcome(@PathVariable UUID workspaceId, @PathVariable UUID id, @RequestBody OutcomeRequest request) {
        guard.require(workspaceId, Permission.APPROVE);
        IssueService.IssueDetail detail = service.groupOutcome(workspaceId, id, status(request), request.resolution());
        audit.record("ISSUE_GROUP_" + request.status(), workspaceId, detail.title(), (detail.group().size() + 1) + " issue(s)");
        return detail;
    }

    /** Logs or screenshots taken after a fix, compared with the original error (background). */
    @PostMapping(path = BASE + "/{id}/checks", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @ResponseStatus(HttpStatus.ACCEPTED)
    public IssueService.IssueDetail check(@PathVariable UUID workspaceId, @PathVariable UUID id,
                                          @RequestParam(value = "logText", required = false) String logText,
                                          @RequestParam(value = "files", required = false) List<MultipartFile> files) throws IOException {
        AppUser user = guard.require(workspaceId, Permission.VIEW);
        return followUps.check(workspaceId, id, logText, uploads(files), user.getUsername());
    }

    @PostMapping(BASE + "/{id}/questions")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public IssueService.IssueDetail ask(@PathVariable UUID workspaceId, @PathVariable UUID id, @RequestBody TextRequest request) {
        AppUser user = guard.require(workspaceId, Permission.VIEW);
        return followUps.ask(workspaceId, id, request.text(), user.getUsername());
    }

    /** The hosts and ports of the issue that can be checked live (developers and leads). */
    @GetMapping(BASE + "/{id}/live-targets")
    public List<LiveChecks.Target> liveTargets(@PathVariable UUID workspaceId, @PathVariable UUID id) {
        guard.require(workspaceId, Permission.MANAGE_CODE);
        return service.liveTargets(workspaceId, id);
    }

    /** A read-only check of one of them from the factory: name, connection, certificate. PROD issues need a lead. */
    @PostMapping(BASE + "/{id}/live-checks")
    public IssueService.IssueDetail liveCheck(@PathVariable UUID workspaceId, @PathVariable UUID id, @RequestBody LiveCheckRequest request) {
        AppUser user = guard.require(workspaceId, Permission.MANAGE_CODE);
        if ("PROD".equals(service.detail(workspaceId, id).environment())) {
            guard.require(workspaceId, Permission.APPROVE);
        }
        IssueService.IssueDetail detail = service.liveCheck(workspaceId, id, request.host(), request.port(), user.getUsername());
        audit.record("ISSUE_LIVE_CHECK", workspaceId, detail.title(), request.host() + ":" + request.port());
        return detail;
    }

    @DeleteMapping(BASE + "/{id}/files/{position}")
    public IssueService.IssueDetail removeScreenshot(@PathVariable UUID workspaceId, @PathVariable UUID id, @PathVariable int position) {
        guard.require(workspaceId, Permission.VIEW);
        IssueService.IssueDetail detail = service.removeScreenshot(workspaceId, id, position);
        audit.record("ISSUE_SCREENSHOT_REMOVED", workspaceId, detail.title(), String.valueOf(position));
        return detail;
    }

    /** Issue events for the bell menu: all of them for leads, else those of issues the user filed or released. */
    @GetMapping("/api/workspaces/{workspaceId}/issue-events")
    public List<IssueRepository.Event> events(@PathVariable UUID workspaceId) {
        AppUser user = guard.require(workspaceId, Permission.VIEW);
        boolean lead;
        try {
            guard.require(workspaceId, Permission.APPROVE);
            lead = true;
        } catch (AccessDeniedException e) {
            lead = false;
        }
        return service.events(workspaceId, user.getUsername(), lead);
    }

    /** Links bank administrators use to report errors (leads). */
    @GetMapping("/api/workspaces/{workspaceId}/issue-links")
    public List<IssueLinks.LinkView> links(@PathVariable UUID workspaceId) {
        guard.require(workspaceId, Permission.APPROVE);
        return links.list(workspaceId);
    }

    @PostMapping("/api/workspaces/{workspaceId}/issue-links")
    public IssueLinks.CreatedLink createLink(@PathVariable UUID workspaceId, @RequestBody LinkRequest request) {
        AppUser user = guard.require(workspaceId, Permission.APPROVE);
        IssueLinks.CreatedLink created = links.create(workspaceId, request.label(), request.days(), user.getUsername());
        audit.record("ISSUE_LINK_CREATED", workspaceId, created.link().label(), "until " + created.link().expiresAt().toLocalDate());
        return created;
    }

    @DeleteMapping("/api/workspaces/{workspaceId}/issue-links/{linkId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void revokeLink(@PathVariable UUID workspaceId, @PathVariable UUID linkId) {
        guard.require(workspaceId, Permission.APPROVE);
        links.revoke(workspaceId, linkId);
        audit.record("ISSUE_LINK_REVOKED", workspaceId, linkId.toString(), null);
    }

    static List<IssueService.Upload> uploads(List<MultipartFile> files) throws IOException {
        List<IssueService.Upload> uploads = new ArrayList<>();
        for (MultipartFile file : files == null ? List.<MultipartFile>of() : files) {
            if (!file.isEmpty()) {
                uploads.add(new IssueService.Upload(file.getOriginalFilename(), file.getBytes()));
            }
        }
        return uploads;
    }

    private static IssueRepository.Status status(OutcomeRequest request) {
        try {
            return IssueRepository.Status.valueOf(request.status());
        } catch (IllegalArgumentException | NullPointerException e) {
            throw new BadRequestException("The outcome must be RESOLVED, NOT_RESOLVED or ESCALATED");
        }
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

    public record LinkRequest(String label, Integer days) {
    }

    public record LiveCheckRequest(String host, Integer port) {
    }
}
