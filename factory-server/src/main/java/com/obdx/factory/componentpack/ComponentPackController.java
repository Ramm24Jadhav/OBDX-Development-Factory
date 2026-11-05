package com.obdx.factory.componentpack;

import com.obdx.factory.auth.AccessGuard;
import com.obdx.factory.auth.AppUser;
import com.obdx.factory.auth.AuditLog;
import com.obdx.factory.auth.WorkspaceRole.Permission;
import com.obdx.factory.componentpack.ComponentPackService.Style;
import com.obdx.factory.componentpack.ComponentStyleStore.SavedStyle;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
public class ComponentPackController {

    private final ComponentPackService service;
    private final ComponentStyleStore styles;
    private final AccessGuard guard;
    private final AuditLog audit;

    public ComponentPackController(ComponentPackService service, ComponentStyleStore styles, AccessGuard guard, AuditLog audit) {
        this.service = service;
        this.styles = styles;
        this.guard = guard;
        this.audit = audit;
    }

    /** The packs and the component catalogue with each component's readiness and mapping per pack (signed-in users). */
    @GetMapping("/api/component-packs")
    public ComponentPackService.Catalogue catalogue() {
        return service.catalogue();
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
