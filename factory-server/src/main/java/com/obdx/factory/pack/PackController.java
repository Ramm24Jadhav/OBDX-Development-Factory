package com.obdx.factory.pack;

import com.obdx.factory.auth.AccessGuard;
import com.obdx.factory.auth.AuditLog;
import com.obdx.factory.auth.WorkspaceRole.Permission;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
public class PackController {

    public record RuleRequest(Boolean enabled) {
    }

    private final PackService service;
    private final AccessGuard guard;
    private final AuditLog audit;

    public PackController(PackService service, AccessGuard guard, AuditLog audit) {
        this.service = service;
        this.guard = guard;
        this.audit = audit;
    }

    @GetMapping("/api/workspaces/{workspaceId}/checks")
    public PackService.WorkspaceChecks get(@PathVariable UUID workspaceId) {
        guard.require(workspaceId, Permission.VIEW);
        return service.get(workspaceId);
    }

    @PutMapping("/api/workspaces/{workspaceId}/checks/{ruleId}")
    public PackService.WorkspaceChecks setEnabled(@PathVariable UUID workspaceId, @PathVariable String ruleId,
                                                  @RequestBody RuleRequest request) {
        var user = guard.require(workspaceId, Permission.MANAGE_CODE);
        boolean enabled = !Boolean.FALSE.equals(request.enabled());
        PackService.WorkspaceChecks result = service.setEnabled(workspaceId, ruleId, enabled, user.getUsername());
        audit.record(enabled ? "CHECK_RULE_ENABLED" : "CHECK_RULE_DISABLED", workspaceId, ruleId, null);
        return result;
    }
}
