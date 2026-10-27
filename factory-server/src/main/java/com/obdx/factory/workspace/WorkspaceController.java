package com.obdx.factory.workspace;

import java.util.Map;
import com.obdx.factory.auth.WorkspaceRole.Permission;
import com.obdx.factory.auth.AuditLog;
import com.obdx.factory.auth.AccessGuard;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/workspaces")
public class WorkspaceController {

    private final WorkspaceService service;
    private final AccessGuard guard;
    private final AuditLog audit;

    public WorkspaceController(WorkspaceService service, AccessGuard guard, AuditLog audit) {
        this.service = service;
        this.guard = guard;
        this.audit = audit;
    }

    /** Administrators see every workspace; others see the workspaces they are members of. */
    @GetMapping
    public List<WorkspaceResponse> list() {
        Map<UUID, ?> visible = guard.visibleWorkspaces();
        return service.list().stream().filter(w -> visible == null || visible.containsKey(w.id())).toList();
    }

    @GetMapping("/{id}")
    public WorkspaceResponse get(@PathVariable UUID id) {
        guard.require(id, Permission.VIEW);
        return service.get(id);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public WorkspaceResponse create(@Valid @RequestBody WorkspaceRequest request) {
        guard.requireAdmin();
        WorkspaceResponse created = service.create(request);
        audit.record("WORKSPACE_CREATED", created.id(), created.name(), created.bankName() + ", OBDX " + created.obdxVersion());
        return created;
    }

    @PutMapping("/{id}/svn")
    public WorkspaceResponse updateSvnSettings(@PathVariable UUID id, @Valid @RequestBody SvnSettingsRequest request) {
        guard.require(id, Permission.MANAGE_CODE);
        WorkspaceResponse updated = service.updateSvnSettings(id, request);
        audit.record("SVN_SETTINGS_CHANGED", id, request.svnUrl(),
                "user " + request.svnUsername() + (request.svnPassword() != null ? ", password changed" : ""));
        return updated;
    }

    @PostMapping("/{id}/svn/test")
    public WorkspaceService.SvnConnectionResponse testSvnConnection(@PathVariable UUID id) {
        guard.require(id, Permission.MANAGE_CODE);
        return service.testSvnConnection(id);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable UUID id) {
        guard.requireAdmin();
        WorkspaceResponse workspace = service.get(id);
        service.delete(id);
        audit.record("WORKSPACE_DELETED", id, workspace.name(), null);
    }
}
