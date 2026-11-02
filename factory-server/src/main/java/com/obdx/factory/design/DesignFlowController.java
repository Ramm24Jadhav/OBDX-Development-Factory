package com.obdx.factory.design;

import com.obdx.factory.auth.AccessGuard;
import com.obdx.factory.auth.AuditLog;
import com.obdx.factory.auth.WorkspaceRole.Permission;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

/** The Design Studio: a BRD's screens by functional requirement, in flow order, and approving them together. */
@RestController
public class DesignFlowController {

    private final DesignFlowService service;
    private final AccessGuard guard;
    private final AuditLog audit;

    public DesignFlowController(DesignFlowService service, AccessGuard guard, AuditLog audit) {
        this.service = service;
        this.guard = guard;
        this.audit = audit;
    }

    @GetMapping("/api/requirements/{requirementId}/design-flow")
    public DesignFlowService.DesignFlow flow(@PathVariable UUID requirementId) {
        guard.requireForRequirement(requirementId, Permission.VIEW);
        return service.flow(requirementId);
    }

    /** Approves the listed screens of the requirement, or all of them when none are listed. */
    @PostMapping("/api/requirements/{requirementId}/designs/approve")
    public DesignFlowService.DesignFlow approve(@PathVariable UUID requirementId, @RequestBody(required = false) ApproveRequest request,
                                                @RequestParam(value = "unsupported", defaultValue = "false") boolean unsupported) {
        var user = guard.requireForRequirement(requirementId, Permission.APPROVE);
        DesignFlowService.Approval approval = service.approve(requirementId, request == null || request.designIds() == null ? null
                : request.designIds().stream().filter(java.util.Objects::nonNull).toList(), user.getDisplayName(), unsupported);
        DesignFlowService.DesignFlow flow = approval.flow();
        approval.approved().forEach(name -> audit.record("DESIGN_APPROVED", flow.workspaceId(), name, "with the requirement's other screens"
                + approval.unsupported().stream().filter(u -> u.startsWith(name + ": ")).findFirst()
                .map(u -> ", with " + u.substring(name.length() + 2) + " that the version pack forbids (confirmed)").orElse("")));
        return flow;
    }

    public record ApproveRequest(List<UUID> designIds) {
    }
}
