package com.obdx.factory.modernization;

import com.obdx.factory.auth.AccessGuard;
import com.obdx.factory.auth.AuditLog;
import com.obdx.factory.auth.WorkspaceRole.Permission;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

import java.nio.charset.StandardCharsets;
import java.util.UUID;

@RestController
public class InventoryController {

    private final InventoryService service;
    private final AccessGuard guard;
    private final AuditLog audit;
    private final AnalysisJobs jobs;

    public InventoryController(InventoryService service, AccessGuard guard, AuditLog audit, AnalysisJobs jobs) {
        this.jobs = jobs;
        this.service = service;
        this.guard = guard;
        this.audit = audit;
    }

    /** The inventory, or 204 when the workspace has not been scanned. */
    @GetMapping("/api/workspaces/{workspaceId}/inventory")
    public ResponseEntity<Inventory> get(@PathVariable UUID workspaceId) {
        guard.require(workspaceId, Permission.VIEW);
        return service.find(workspaceId).map(ResponseEntity::ok).orElse(ResponseEntity.noContent().build());
    }

    @PostMapping("/api/workspaces/{workspaceId}/inventory/scan")
    public Inventory scan(@PathVariable UUID workspaceId) {
        guard.require(workspaceId, Permission.MANAGE_CODE);
        Inventory inventory = service.scan(workspaceId);
        audit.record("INVENTORY_SCANNED", workspaceId, "r" + inventory.revision(),
                inventory.summary().screens() + " screens, " + inventory.summary().endpoints() + " services");
        return inventory;
    }

    /** Starts the analysis in the background; the page follows its steps (GET) and can stop it. */
    @PostMapping("/api/workspaces/{workspaceId}/inventory/analysis")
    @org.springframework.web.bind.annotation.ResponseStatus(org.springframework.http.HttpStatus.ACCEPTED)
    public AnalysisJobs.Job startAnalysis(@PathVariable UUID workspaceId) {
        var user = guard.require(workspaceId, Permission.MANAGE_CODE);
        AnalysisJobs.Job job = jobs.start(workspaceId, user.getDisplayName());
        audit.record("INVENTORY_ANALYSIS_STARTED", workspaceId, "analysis", "started");
        return job;
    }

    /** The workspace's analysis job, or 204 when none ran since the factory started. */
    @GetMapping("/api/workspaces/{workspaceId}/inventory/analysis")
    public ResponseEntity<AnalysisJobs.Job> analysis(@PathVariable UUID workspaceId) {
        guard.require(workspaceId, Permission.VIEW);
        AnalysisJobs.Job job = jobs.find(workspaceId);
        return job == null ? ResponseEntity.noContent().build() : ResponseEntity.ok(job);
    }

    @PostMapping("/api/workspaces/{workspaceId}/inventory/analysis/stop")
    public ResponseEntity<AnalysisJobs.Job> stopAnalysis(@PathVariable UUID workspaceId) {
        guard.require(workspaceId, Permission.MANAGE_CODE);
        AnalysisJobs.Job job = jobs.stop(workspaceId);
        return job == null ? ResponseEntity.noContent().build() : ResponseEntity.ok(job);
    }

    @GetMapping("/api/workspaces/{workspaceId}/inventory/screens.csv")
    public ResponseEntity<byte[]> screensCsv(@PathVariable UUID workspaceId) {
        guard.require(workspaceId, Permission.VIEW);
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"screens-inventory.csv\"")
                .contentType(new MediaType("text", "csv", StandardCharsets.UTF_8))
                .body(service.screensCsv(workspaceId).getBytes(StandardCharsets.UTF_8));
    }
}
