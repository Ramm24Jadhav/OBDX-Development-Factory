package com.obdx.factory.design;

import com.obdx.factory.auth.AccessGuard;
import com.obdx.factory.auth.WorkspaceRole.Permission;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

/** The Visual Designer's compatibility marks: the elements of a screen against the workspace's OBDX version. */
@RestController
public class ComponentCompatibilityController {

    private final ComponentCompatibility compatibility;
    private final AccessGuard guard;

    public ComponentCompatibilityController(ComponentCompatibility compatibility, AccessGuard guard) {
        this.compatibility = compatibility;
        this.guard = guard;
    }

    @GetMapping("/api/workspaces/{workspaceId}/design-compatibility")
    public ComponentCompatibility.Report report(@PathVariable UUID workspaceId,
                                                @RequestParam(name = "element", required = false) List<String> elements) {
        guard.require(workspaceId, Permission.VIEW);
        return compatibility.report(workspaceId, elements);
    }
}
