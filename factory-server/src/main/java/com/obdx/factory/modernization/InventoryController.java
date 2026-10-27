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

    public InventoryController(InventoryService service, AccessGuard guard, AuditLog audit) {
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

    @GetMapping("/api/workspaces/{workspaceId}/inventory/screens.csv")
    public ResponseEntity<byte[]> screensCsv(@PathVariable UUID workspaceId) {
        guard.require(workspaceId, Permission.VIEW);
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"screens-inventory.csv\"")
                .contentType(new MediaType("text", "csv", StandardCharsets.UTF_8))
                .body(service.screensCsv(workspaceId).getBytes(StandardCharsets.UTF_8));
    }
}
