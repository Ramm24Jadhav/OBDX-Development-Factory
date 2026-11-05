package com.obdx.factory.componentpack;

import com.obdx.factory.auth.AccessGuard;
import com.obdx.factory.auth.AppUser;
import com.obdx.factory.auth.AuditLog;
import com.obdx.factory.auth.WorkspaceRole.Permission;
import com.obdx.factory.common.NotFoundException;
import com.obdx.factory.componentpack.ComponentPackService.Style;
import com.obdx.factory.componentpack.ComponentStyleStore.SavedStyle;
import com.obdx.factory.profile.ProjectProfileService;
import com.obdx.factory.profile.ProjectProfileService.FactView;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

@RestController
public class ComponentPackController {

    private final ComponentPackService service;
    private final ComponentStyleStore styles;
    private final AccessGuard guard;
    private final AuditLog audit;
    private final ProjectProfileService profiles;

    public ComponentPackController(ComponentPackService service, ComponentStyleStore styles, AccessGuard guard, AuditLog audit,
                                   ProjectProfileService profiles) {
        this.service = service;
        this.styles = styles;
        this.guard = guard;
        this.audit = audit;
        this.profiles = profiles;
    }

    /** The packs and the component catalogue with each component's readiness and mapping per pack (signed-in users). */
    @GetMapping("/api/component-packs")
    public ComponentPackService.Catalogue catalogue() {
        return service.catalogue();
    }

    /** The catalogue for a workspace: the premium JET pack is built for the JET version its Project Profile found. */
    @GetMapping("/api/workspaces/{workspaceId}/component-packs")
    public ComponentPackService.Catalogue catalogue(@PathVariable UUID workspaceId) {
        guard.require(workspaceId, Permission.VIEW);
        return service.catalogue(jetFact(workspaceId));
    }

    /** The workspace's Oracle JET version fact, or a missing one when the code has not been scanned yet. */
    private ComponentPackService.JetFact jetFact(UUID workspaceId) {
        try {
            FactView fact = profiles.get(workspaceId).facts().stream().filter((f) -> "ui.jetVersion".equals(f.key())).findFirst().orElse(null);
            return fact == null ? new ComponentPackService.JetFact(null, "missing", List.of())
                    : new ComponentPackService.JetFact(fact.value(), fact.status(), fact.evidence());
        } catch (NotFoundException e) {
            return new ComponentPackService.JetFact(null, "missing", List.of());
        }
    }

    @GetMapping("/api/workspaces/{workspaceId}/component-style")
    public SavedStyle style(@PathVariable UUID workspaceId) {
        guard.require(workspaceId, Permission.VIEW);
        return styles.get(workspaceId);
    }

    /** Saves the workspace's component style; new code and pack upgrades use it. */
    @PutMapping("/api/workspaces/{workspaceId}/component-style")
    public SavedStyle save(@PathVariable UUID workspaceId, @RequestBody Style style) {
        AppUser user = guard.require(workspaceId, Permission.MANAGE_CODE);
        Style checked = service.validate(style);
        // Copies are kept as they are: they are added and removed on their own (My copies)
        Style valid = new Style(checked.defaults(), checked.components(), styles.get(workspaceId).style().copies());
        SavedStyle saved = styles.save(workspaceId, valid, user.getUsername());
        audit.record("COMPONENT_STYLE_SAVED", workspaceId, valid.defaults().look(),
                valid.components().size() + " component" + (valid.components().size() == 1 ? "" : "s") + " with their own style");
        return saved;
    }

    /** Saves a customised copy of a shipped component in the workspace's My copies; the shipped component stays as it is. */
    @PostMapping("/api/workspaces/{workspaceId}/component-style/copies")
    public SavedStyle addCopy(@PathVariable UUID workspaceId, @RequestBody ComponentPackService.Copy copy) {
        AppUser user = guard.require(workspaceId, Permission.MANAGE_CODE);
        SavedStyle current = styles.get(workspaceId);
        ComponentPackService.Copy valid = service.validateCopy(copy, current.style().copies(), user.getUsername());
        List<ComponentPackService.Copy> copies = new java.util.ArrayList<>(current.style().copies());
        copies.addFirst(valid);
        SavedStyle saved = styles.save(workspaceId, new Style(current.style().defaults(), current.style().components(), copies), user.getUsername());
        audit.record("COMPONENT_COPY_SAVED", workspaceId, valid.name(), "From " + valid.component() + " in " + valid.pack());
        return saved;
    }

    @DeleteMapping("/api/workspaces/{workspaceId}/component-style/copies/{name}")
    public SavedStyle removeCopy(@PathVariable UUID workspaceId, @PathVariable String name) {
        AppUser user = guard.require(workspaceId, Permission.MANAGE_CODE);
        SavedStyle current = styles.get(workspaceId);
        List<ComponentPackService.Copy> copies = current.style().copies().stream().filter((c) -> !c.name().equals(name)).toList();
        if (copies.size() == current.style().copies().size()) {
            throw new NotFoundException("There is no copy " + name + " in this workspace.");
        }
        SavedStyle saved = styles.save(workspaceId, new Style(current.style().defaults(), current.style().components(), copies), user.getUsername());
        audit.record("COMPONENT_COPY_REMOVED", workspaceId, name, "The shipped component is not affected");
        return saved;
    }

    /** One page per component of a pack: what it is, its readiness and checks, properties, events, example and JET mapping. */
    @GetMapping("/api/component-packs/{packId}/documentation.html")
    public ResponseEntity<String> documentation(@PathVariable String packId) {
        String html = service.documentation(packId);
        return ResponseEntity.ok().contentType(new MediaType(MediaType.TEXT_HTML, java.nio.charset.StandardCharsets.UTF_8))
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + packId + "-documentation.html\"").body(html);
    }
}
