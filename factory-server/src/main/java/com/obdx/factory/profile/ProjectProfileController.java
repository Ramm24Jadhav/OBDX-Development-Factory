package com.obdx.factory.profile;

import com.obdx.factory.auth.WorkspaceRole.Permission;
import com.obdx.factory.auth.AuditLog;
import com.obdx.factory.auth.AccessGuard;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/api/workspaces/{workspaceId}/profile")
public class ProjectProfileController {

    private final ProjectProfileService service;
    private final AccessGuard guard;
    private final AuditLog audit;

    public ProjectProfileController(ProjectProfileService service, AccessGuard guard, AuditLog audit) {
        this.service = service;
        this.guard = guard;
        this.audit = audit;
    }

    @GetMapping
    public ProjectProfileService.ProfileResponse get(@PathVariable UUID workspaceId) {
        guard.require(workspaceId, Permission.VIEW);
        return service.get(workspaceId);
    }

    @PostMapping("/refresh")
    public ProjectProfileService.ProfileResponse refresh(@PathVariable UUID workspaceId) {
        guard.require(workspaceId, Permission.MANAGE_CODE);
        return service.refresh(workspaceId);
    }

    /** Confirms (same value as detected) or corrects a fact. */
    @PutMapping("/facts/{key}")
    public ProjectProfileService.ProfileResponse setValue(@PathVariable UUID workspaceId, @PathVariable String key,
                                                          @RequestBody FactValueRequest request) {
        guard.require(workspaceId, Permission.MANAGE_CODE);
        audit.record("PROFILE_FACT_SET", workspaceId, key, request.value());
        return service.setValue(workspaceId, key, request.value());
    }

    /** Drops the confirmed or corrected value, going back to the detected one. */
    @DeleteMapping("/facts/{key}")
    public ProjectProfileService.ProfileResponse reset(@PathVariable UUID workspaceId, @PathVariable String key) {
        guard.require(workspaceId, Permission.MANAGE_CODE);
        audit.record("PROFILE_FACT_RESET", workspaceId, key, null);
        return service.reset(workspaceId, key);
    }

    public record FactValueRequest(String value) {
    }
}
