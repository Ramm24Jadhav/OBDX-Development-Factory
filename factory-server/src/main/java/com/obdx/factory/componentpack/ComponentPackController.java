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
import org.springframework.web.bind.annotation.GetMapping;
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
        Style valid = service.validate(style);
        SavedStyle saved = styles.save(workspaceId, valid, user.getUsername());
        audit.record("COMPONENT_STYLE_SAVED", workspaceId, valid.defaults().look(),
                valid.components().size() + " component" + (valid.components().size() == 1 ? "" : "s") + " with their own style");
        return saved;
    }
}
