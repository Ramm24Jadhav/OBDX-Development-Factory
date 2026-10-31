package com.obdx.factory.jenkins;

import com.obdx.factory.auth.AccessGuard;
import com.obdx.factory.auth.AuditLog;
import com.obdx.factory.auth.WorkspaceRole.Permission;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
public class JenkinsController {

    private final JenkinsSettingsService service;
    private final AccessGuard guard;
    private final AuditLog audit;

    public JenkinsController(JenkinsSettingsService service, AccessGuard guard, AuditLog audit) {
        this.service = service;
        this.guard = guard;
        this.audit = audit;
    }

    @GetMapping("/api/workspaces/{workspaceId}/jenkins")
    public ResponseEntity<JenkinsSettings> get(@PathVariable UUID workspaceId) {
        guard.require(workspaceId, Permission.VIEW);
        return service.find(workspaceId).map(ResponseEntity::ok).orElse(ResponseEntity.noContent().build());
    }

    @PutMapping("/api/workspaces/{workspaceId}/jenkins")
    public JenkinsSettings save(@PathVariable UUID workspaceId, @RequestBody JenkinsSettingsService.SettingsRequest request) {
        guard.require(workspaceId, Permission.MANAGE_CODE);
        boolean hadToken = service.find(workspaceId).map(JenkinsSettings::tokenSet).orElse(false);
        JenkinsSettings settings = service.save(workspaceId, request);
        boolean dropped = hadToken && request.token() == null && !settings.tokenSet();
        audit.record("JENKINS_SETTINGS_CHANGED", workspaceId, settings.url(), "jobs " + settings.jobs() + ", mode " + settings.mode()
                + (request.token() != null ? ", token changed" : "")
                + (dropped ? ", stored token removed because the URL points to another server" : ""));
        return settings;
    }

    @PostMapping("/api/workspaces/{workspaceId}/jenkins/test")
    public JenkinsSettingsService.ConnectionResult test(@PathVariable UUID workspaceId) {
        guard.require(workspaceId, Permission.MANAGE_CODE);
        return service.test(workspaceId);
    }
}
