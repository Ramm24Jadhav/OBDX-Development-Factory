package com.obdx.factory.design;

import com.obdx.factory.auth.AccessGuard;
import com.obdx.factory.auth.AuditLog;
import com.obdx.factory.auth.WorkspaceRole.Permission;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.List;
import java.util.UUID;

/** The workspace's own components for the designer's palette, made from a description, an image or a Figma frame. */
@RestController
public class CustomComponentController {

    private final CustomComponents components;
    private final DesignImporter importer;
    private final AccessGuard guard;
    private final AuditLog audit;

    public CustomComponentController(CustomComponents components, DesignImporter importer, AccessGuard guard, AuditLog audit) {
        this.components = components;
        this.importer = importer;
        this.guard = guard;
        this.audit = audit;
    }

    @GetMapping("/api/workspaces/{workspaceId}/custom-components")
    public List<CustomComponents.CustomComponent> list(@PathVariable UUID workspaceId) {
        guard.require(workspaceId, Permission.VIEW);
        return components.list(workspaceId);
    }

    @PostMapping("/api/workspaces/{workspaceId}/custom-components")
    @ResponseStatus(HttpStatus.CREATED)
    public CustomComponents.CustomComponent fromPrompt(@PathVariable UUID workspaceId, @RequestBody PromptRequest request) {
        var user = guard.require(workspaceId, Permission.EDIT_DESIGNS);
        return created(workspaceId, components.create(workspaceId, request.name(), request.prompt(), null, user.getDisplayName()));
    }

    /** From an image (PNG, JPG, WebP; needs a model that reads images) or a PDF of the component. */
    @PostMapping(path = "/api/workspaces/{workspaceId}/custom-components/file", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @ResponseStatus(HttpStatus.CREATED)
    public CustomComponents.CustomComponent fromFile(@PathVariable UUID workspaceId, @RequestParam("file") MultipartFile file,
                                                     @RequestParam(value = "name", required = false) String name,
                                                     @RequestParam(value = "prompt", required = false) String prompt) throws IOException {
        var user = guard.require(workspaceId, Permission.EDIT_DESIGNS);
        DesignImporter.Design design = importer.fromFile(file.getOriginalFilename(), file.getBytes());
        return created(workspaceId, components.create(workspaceId, name, prompt, design, user.getDisplayName()));
    }

    /** From a Figma frame; the token is used for this request only. */
    @PostMapping("/api/workspaces/{workspaceId}/custom-components/figma")
    @ResponseStatus(HttpStatus.CREATED)
    public CustomComponents.CustomComponent fromFigma(@PathVariable UUID workspaceId, @RequestBody FigmaRequest request) {
        var user = guard.require(workspaceId, Permission.EDIT_DESIGNS);
        DesignImporter.Design design = importer.fromFigma(request.link(), request.token());
        return created(workspaceId, components.create(workspaceId, request.name(), request.prompt(), design, user.getDisplayName()));
    }

    @DeleteMapping("/api/workspaces/{workspaceId}/custom-components/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable UUID workspaceId, @PathVariable UUID id) {
        guard.require(workspaceId, Permission.EDIT_DESIGNS);
        components.delete(workspaceId, id);
        audit.record("CUSTOM_COMPONENT_DELETED", workspaceId, id.toString(), null);
    }

    private CustomComponents.CustomComponent created(UUID workspaceId, CustomComponents.CustomComponent component) {
        audit.record("CUSTOM_COMPONENT_CREATED", workspaceId, component.name(), component.source());
        return component;
    }

    public record PromptRequest(String name, String prompt) {
    }

    /** @param token a Figma personal access token; not stored */
    public record FigmaRequest(String name, String prompt, String link, String token) {
    }
}
