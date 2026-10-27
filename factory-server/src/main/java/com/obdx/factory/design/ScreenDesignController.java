package com.obdx.factory.design;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

@RestController
public class ScreenDesignController {

    private final ScreenDesignService service;

    public ScreenDesignController(ScreenDesignService service) {
        this.service = service;
    }

    @GetMapping("/api/design/catalog")
    public List<ComponentCatalog.ComponentType> catalog() {
        return ComponentCatalog.TYPES;
    }

    @GetMapping("/api/workspaces/{workspaceId}/designs")
    public List<ScreenDesignService.DesignSummary> list(@PathVariable UUID workspaceId) {
        return service.list(workspaceId);
    }

    @PostMapping("/api/workspaces/{workspaceId}/designs")
    @ResponseStatus(HttpStatus.CREATED)
    public ScreenDesignService.DesignDetail blank(@PathVariable UUID workspaceId, @RequestBody NameRequest request) {
        return service.blank(workspaceId, request.name());
    }

    @PostMapping("/api/requirements/{requirementId}/designs")
    @ResponseStatus(HttpStatus.CREATED)
    public List<ScreenDesignService.DesignSummary> fromRequirement(@PathVariable UUID requirementId) {
        return service.fromRequirement(requirementId);
    }

    @GetMapping("/api/designs/{id}")
    public ScreenDesignService.DesignDetail get(@PathVariable UUID id) {
        return service.get(id);
    }

    @GetMapping("/api/designs/{id}/versions/{version}")
    public ScreenModel version(@PathVariable UUID id, @PathVariable int version) {
        return service.version(id, version);
    }

    @PutMapping("/api/designs/{id}/model")
    public ScreenDesignService.DesignDetail save(@PathVariable UUID id, @RequestBody SaveRequest request) {
        return service.save(id, request.model(), request.note());
    }

    @PostMapping("/api/designs/{id}/ai-change")
    public ScreenDesignService.DesignDetail aiChange(@PathVariable UUID id, @RequestBody InstructionRequest request) {
        return service.aiChange(id, request.instruction());
    }

    @PostMapping("/api/designs/{id}/comments")
    public ScreenDesignService.DesignDetail comment(@PathVariable UUID id, @RequestBody CommentRequest request) {
        return service.comment(id, request.author(), request.text(), request.componentId());
    }

    @PostMapping("/api/designs/{id}/review-link")
    public ScreenDesignService.DesignDetail openReview(@PathVariable UUID id, @RequestBody(required = false) ReviewLinkRequest request) {
        return service.openReview(id, request == null ? null : request.days());
    }

    @DeleteMapping("/api/designs/{id}/review-link")
    public ScreenDesignService.DesignDetail closeReview(@PathVariable UUID id) {
        return service.closeReview(id);
    }

    @PostMapping("/api/designs/{id}/approve")
    public ScreenDesignService.DesignDetail approve(@PathVariable UUID id, @RequestBody ApproveRequest request) {
        return service.approve(id, request.by());
    }

    @PostMapping("/api/designs/{id}/reopen")
    public ScreenDesignService.DesignDetail reopen(@PathVariable UUID id) {
        return service.reopen(id);
    }

    @DeleteMapping("/api/designs/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable UUID id) {
        service.delete(id);
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
        return service.reviewApprove(token, request.by());
    }

    public record NameRequest(String name) {
    }

    public record SaveRequest(ScreenModel model, String note) {
    }

    public record InstructionRequest(String instruction) {
    }

    public record CommentRequest(String author, String text, String componentId) {
    }

    public record ReviewLinkRequest(Integer days) {
    }

    public record ApproveRequest(String by) {
    }
}
