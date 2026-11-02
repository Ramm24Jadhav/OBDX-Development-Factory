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

    /** Each result is recorded (JENKINS_TEST_PASSED, _WARNING or _FAILED), so the Integrations page can show the last one. */
    @PostMapping("/api/workspaces/{workspaceId}/jenkins/test")
    public JenkinsSettingsService.ConnectionResult test(@PathVariable UUID workspaceId) {
        guard.require(workspaceId, Permission.MANAGE_CODE);
        JenkinsSettingsService.ConnectionResult result;
        try {
            result = service.test(workspaceId);
        } catch (JenkinsException e) {
            audit.record("JENKINS_TEST_FAILED", workspaceId, null, e.getMessage());
            throw e;
        }
        String jobs = result.jobs().size() + (result.jobs().size() == 1 ? " job" : " jobs");
        if (result.warnings().isEmpty()) {
            audit.record("JENKINS_TEST_PASSED", workspaceId, null, jobs);
        } else {
            audit.record("JENKINS_TEST_WARNING", workspaceId, null, jobs + ". " + String.join(" ", result.warnings()));
        }
        return result;
    }
}
