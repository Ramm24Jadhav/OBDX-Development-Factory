package com.obdx.factory.importing;

import com.obdx.factory.auth.WorkspaceRole.Permission;
import com.obdx.factory.auth.AuditLog;
import com.obdx.factory.auth.AccessGuard;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/workspaces/{workspaceId}")
public class ImportController {

    private final ImportService service;
    private final AccessGuard guard;
    private final AuditLog audit;

    public ImportController(ImportService service, AccessGuard guard, AuditLog audit) {
        this.service = service;
        this.guard = guard;
        this.audit = audit;
    }

    @PostMapping("/imports")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public ImportJobResponse start(@PathVariable UUID workspaceId) {
        guard.require(workspaceId, Permission.MANAGE_CODE);
        ImportJobResponse job = service.start(workspaceId);
        audit.record("IMPORT_STARTED", workspaceId, job.id().toString(), null);
        return job;
    }

    @GetMapping("/imports")
    public List<ImportJobResponse> recent(@PathVariable UUID workspaceId, @RequestParam(defaultValue = "10") int limit) {
        guard.require(workspaceId, Permission.VIEW);
        return service.recent(workspaceId, limit);
    }

    @GetMapping("/index")
    public ImportService.IndexStatusResponse indexStatus(@PathVariable UUID workspaceId) {
        guard.require(workspaceId, Permission.VIEW);
        return service.indexStatus(workspaceId);
    }
}
