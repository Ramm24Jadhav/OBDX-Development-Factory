package com.obdx.factory.target;

import com.obdx.factory.auth.AccessGuard;
import com.obdx.factory.auth.AuditLog;
import com.obdx.factory.auth.WorkspaceRole.Permission;
import com.obdx.factory.design.ScreenDesignService;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

@RestController
public class TargetController {

    private final TargetService service;
    private final ScreenDesignService designs;
    private final AccessGuard guard;
    private final AuditLog audit;

    public TargetController(TargetService service, ScreenDesignService designs, AccessGuard guard, AuditLog audit) {
        this.service = service;
        this.designs = designs;
        this.guard = guard;
        this.audit = audit;
    }

    /** The target packs (signed-in users). */
    @GetMapping("/api/targets")
    public List<TargetService.PackSummary> list() {
        return service.list();
    }

    @GetMapping("/api/targets/{id}/starter.zip")
    public ResponseEntity<byte[]> starter(@PathVariable String id) {
        byte[] zip = service.starterZip(id);
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + id + "-starter.zip\"")
                .contentType(MediaType.parseMediaType("application/zip"))
                .body(zip);
    }

    /** The code a screen design becomes in the workspace's React Native or React app (current version). */
    @GetMapping("/api/designs/{designId}/code")
    public List<TargetService.CodeFile> code(@PathVariable UUID designId, @RequestParam(required = false) String module) {
        guard.requireForDesign(designId, Permission.VIEW);
        ScreenDesignService.DesignDetail design = designs.get(designId);
        return service.code(design.workspaceId(), design.model(), module);
    }

    @GetMapping("/api/workspaces/{workspaceId}/target")
    public TargetService.WorkspaceTarget get(@PathVariable UUID workspaceId) {
        guard.require(workspaceId, Permission.VIEW);
        return service.get(workspaceId);
    }

    @PutMapping("/api/workspaces/{workspaceId}/target")
    public TargetService.WorkspaceTarget update(@PathVariable UUID workspaceId, @RequestBody TargetService.TargetRequest request) {
        guard.require(workspaceId, Permission.MANAGE_CODE);
        TargetService.WorkspaceTarget target = service.update(workspaceId, request);
        audit.record("WORKSPACE_TARGET_CHANGED", workspaceId, target.target(), target.appFolder());
        return target;
    }
}
