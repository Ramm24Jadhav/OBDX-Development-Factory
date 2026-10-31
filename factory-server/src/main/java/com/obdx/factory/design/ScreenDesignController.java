package com.obdx.factory.design;

import com.obdx.factory.auth.WorkspaceRole.Permission;
import com.obdx.factory.auth.AuditLog;
import com.obdx.factory.auth.AccessGuard;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.io.IOException;
import java.util.List;
import java.util.UUID;

@RestController
public class ScreenDesignController {

    private final ScreenDesignService service;
    private final ComponentPalette palette;
    private final DesignImporter importer;
    private final AccessGuard guard;
    private final AuditLog audit;

    public ScreenDesignController(ScreenDesignService service, ComponentPalette palette, DesignImporter importer,
                                  AccessGuard guard, AuditLog audit) {
        this.service = service;
        this.palette = palette;
        this.importer = importer;
        this.guard = guard;
        this.audit = audit;
    }

    @GetMapping("/api/design/catalog")
    public List<ComponentCatalog.ComponentType> catalog() {
        return ComponentCatalog.TYPES;
    }

    /** The components to drag onto a screen: the standard ones and those found in the workspace's code. */
    @GetMapping("/api/workspaces/{workspaceId}/design-palette")
    public ComponentPalette.Palette palette(@PathVariable UUID workspaceId) {
        guard.require(workspaceId, Permission.VIEW);
        return palette.palette(workspaceId);
    }

    @GetMapping("/api/workspaces/{workspaceId}/designs")
    public List<ScreenDesignService.DesignSummary> list(@PathVariable UUID workspaceId) {
        guard.require(workspaceId, Permission.VIEW);
        return service.list(workspaceId);
    }

    @PostMapping("/api/workspaces/{workspaceId}/designs")
    @ResponseStatus(HttpStatus.CREATED)
    public ScreenDesignService.DesignDetail blank(@PathVariable UUID workspaceId, @RequestBody NameRequest request) {
        guard.require(workspaceId, Permission.EDIT_DESIGNS);
        return service.blank(workspaceId, request.name());
    }

    @PostMapping("/api/requirements/{requirementId}/designs")
    @ResponseStatus(HttpStatus.CREATED)
    public List<ScreenDesignService.DesignSummary> fromRequirement(@PathVariable UUID requirementId) {
        guard.requireForRequirement(requirementId, Permission.EDIT_DESIGNS);
        return service.fromRequirement(requirementId);
    }

    @GetMapping("/api/designs/{id}")
    public ScreenDesignService.DesignDetail get(@PathVariable UUID id) {
        guard.requireForDesign(id, Permission.VIEW);
        return service.get(id);
    }

    @GetMapping("/api/designs/{id}/versions/{version}")
    public ScreenModel version(@PathVariable UUID id, @PathVariable int version) {
        guard.requireForDesign(id, Permission.VIEW);
        return service.version(id, version);
    }

    @PutMapping("/api/designs/{id}/model")
    public ScreenDesignService.DesignDetail save(@PathVariable UUID id, @RequestBody SaveRequest request) {
        guard.requireForDesign(id, Permission.EDIT_DESIGNS);
        return service.save(id, request.model(), request.note());
    }

    @PostMapping("/api/designs/{id}/ai-change")
    public ScreenDesignService.DesignDetail aiChange(@PathVariable UUID id, @RequestBody InstructionRequest request) {
        guard.requireForDesign(id, Permission.EDIT_DESIGNS);
        return service.aiChange(id, request.instruction(), request.targetId());
    }

    /** Makes the review and confirmation screens of the flow this initiate screen starts. */
    @PostMapping("/api/designs/{id}/flow-screens")
    @ResponseStatus(HttpStatus.CREATED)
    public List<ScreenDesignService.DesignSummary> flowScreens(@PathVariable UUID id) {
        guard.requireForDesign(id, Permission.EDIT_DESIGNS);
        return service.flowScreens(id);
    }

    /** Saves an earlier version again as the newest one. */
    @PostMapping("/api/designs/{id}/restore")
    public ScreenDesignService.DesignDetail restore(@PathVariable UUID id, @RequestBody RestoreRequest request) {
        guard.requireForDesign(id, Permission.EDIT_DESIGNS);
        return service.restore(id, request.version());
    }

    /** A design file made in a design tool (image or PDF) becomes the screen's next version. */
    @PostMapping(path = "/api/designs/{id}/import", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ScreenDesignService.DesignDetail importFile(@PathVariable UUID id, @RequestParam("file") MultipartFile file) throws IOException {
        guard.requireForDesign(id, Permission.EDIT_DESIGNS);
        ScreenDesignService.DesignDetail detail = service.importDesign(id, importer.fromFile(file.getOriginalFilename(), file.getBytes()));
        audit.record("DESIGN_IMPORTED", detail.workspaceId(), detail.name(), file.getOriginalFilename());
        return detail;
    }

    /** A Figma frame becomes the screen's next version; the token is used for this request only. */
    @PostMapping("/api/designs/{id}/import-figma")
    public ScreenDesignService.DesignDetail importFigma(@PathVariable UUID id, @RequestBody FigmaRequest request) {
        guard.requireForDesign(id, Permission.EDIT_DESIGNS);
        ScreenDesignService.DesignDetail detail = service.importDesign(id, importer.fromFigma(request.link(), request.token()));
        audit.record("DESIGN_IMPORTED", detail.workspaceId(), detail.name(), "Figma " + request.link());
        return detail;
    }

    @PostMapping("/api/designs/{id}/comments")
    public ScreenDesignService.DesignDetail comment(@PathVariable UUID id, @RequestBody CommentRequest request) {
        var user = guard.requireForDesign(id, Permission.COMMENT);
        return service.comment(id, user.getDisplayName(), request.text(), request.componentId());
    }

    @PostMapping("/api/designs/{id}/review-link")
    public ScreenDesignService.DesignDetail openReview(@PathVariable UUID id, @RequestBody(required = false) ReviewLinkRequest request) {
        guard.requireForDesign(id, Permission.EDIT_DESIGNS);
        ScreenDesignService.DesignDetail detail = service.openReview(id, request == null ? null : request.days());
        audit.record("REVIEW_LINK_CREATED", detail.workspaceId(), detail.name(), "expires " + detail.reviewExpiresAt());
        return detail;
    }

    @DeleteMapping("/api/designs/{id}/review-link")
    public ScreenDesignService.DesignDetail closeReview(@PathVariable UUID id) {
        guard.requireForDesign(id, Permission.EDIT_DESIGNS);
        ScreenDesignService.DesignDetail detail = service.closeReview(id);
        audit.record("REVIEW_LINK_CLOSED", detail.workspaceId(), detail.name(), null);
        return detail;
    }

    @PostMapping("/api/designs/{id}/approve")
    public ScreenDesignService.DesignDetail approve(@PathVariable UUID id) {
        var user = guard.requireForDesign(id, Permission.APPROVE);
        ScreenDesignService.DesignDetail detail = service.approve(id, user.getDisplayName());
        audit.record("DESIGN_APPROVED", detail.workspaceId(), detail.name(), "version " + detail.approvedVersion());
        return detail;
    }

    @PostMapping("/api/designs/{id}/reopen")
    public ScreenDesignService.DesignDetail reopen(@PathVariable UUID id) {
        guard.requireForDesign(id, Permission.APPROVE);
        ScreenDesignService.DesignDetail detail = service.reopen(id);
        audit.record("DESIGN_REOPENED", detail.workspaceId(), detail.name(), null);
        return detail;
    }

    @DeleteMapping("/api/designs/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable UUID id) {
        guard.requireForDesign(id, Permission.EDIT_DESIGNS);
        ScreenDesignService.DesignDetail detail = service.get(id);
        service.delete(id);
        audit.record("DESIGN_DELETED", detail.workspaceId(), detail.name(), null);
    }

    // Customer review through a review link: only the token is needed.

    @GetMapping("/api/review/{token}")
    public ScreenDesignService.ReviewView review(@PathVariable String token) {
        return service.review(token);
    }

    @PostMapping("/api/review/{token}/comments")
    public ScreenDesignService.ReviewView reviewComment(@PathVariable String token, @RequestBody CommentRequest request) {
        return service.reviewComment(token, request.author(), request.text(), request.componentId());
    }

    @PostMapping("/api/review/{token}/approve")
    public ScreenDesignService.ReviewView reviewApprove(@PathVariable String token, @RequestBody ApproveRequest request) {
        UUID workspaceId = service.workspaceOfReview(token);
        ScreenDesignService.ReviewView view = service.reviewApprove(token, request.by());
        audit.recordAs("review link: " + request.by(), "DESIGN_APPROVED_BY_REVIEWER", workspaceId, view.name(), "version " + view.version());
        return view;
    }

    public record NameRequest(String name) {
    }

    public record SaveRequest(ScreenModel model, String note) {
    }

    /** @param targetId the selected component, section or button the change is limited to; null for the whole screen */
    public record InstructionRequest(String instruction, String targetId) {
    }

    public record RestoreRequest(int version) {
    }

    /** @param token a Figma personal access token; not stored */
    public record FigmaRequest(String link, String token) {
    }

    /** author is used only on review links; signed-in users comment under their own name. */
    public record CommentRequest(String author, String text, String componentId) {
    }

    public record ReviewLinkRequest(Integer days) {
    }

    public record ApproveRequest(String by) {
    }
}
