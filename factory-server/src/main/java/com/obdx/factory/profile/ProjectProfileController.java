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

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/workspaces/{workspaceId}/profile")
public class ProjectProfileController {

    static final String FACT_SET = "PROFILE_FACT_SET";
    static final String FACT_RESET = "PROFILE_FACT_RESET";

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

    /** Confirms (same value as detected) or corrects a fact. Recorded in the audit log once it is saved. */
    @PutMapping("/facts/{key}")
    public ProjectProfileService.ProfileResponse setValue(@PathVariable UUID workspaceId, @PathVariable String key,
                                                          @RequestBody FactValueRequest request) {
        guard.require(workspaceId, Permission.MANAGE_CODE);
        ProjectProfileService.ProfileResponse profile = service.setValue(workspaceId, key, request.value());
        audit.record(FACT_SET, workspaceId, key, request.value().trim());
        return profile;
    }

    /** Drops the confirmed or corrected value, going back to the detected one. */
    @DeleteMapping("/facts/{key}")
    public ProjectProfileService.ProfileResponse reset(@PathVariable UUID workspaceId, @PathVariable String key) {
        guard.require(workspaceId, Permission.MANAGE_CODE);
        ProjectProfileService.ProfileResponse profile = service.reset(workspaceId, key);
        audit.record(FACT_RESET, workspaceId, key, null);
        return profile;
    }

    /** Who confirmed, corrected or reset which fact, newest first: the profile's entries of the audit log. */
    @GetMapping("/history")
    public List<FactChange> history(@PathVariable UUID workspaceId) {
        guard.require(workspaceId, Permission.VIEW);
        return audit.recent(workspaceId, List.of(FACT_SET, FACT_RESET), 200).stream().map(FactChange::from).toList();
    }

    public record FactValueRequest(String value) {
    }

    /**
     * One change to a fact. action is "set" (a value was confirmed or corrected; value holds it) or "reset" (back to
     * the detected value).
     */
    public record FactChange(OffsetDateTime at, String username, String key, String action, String value) {

        static FactChange from(AuditLog.Event event) {
            return new FactChange(event.at(), event.username(), event.target(),
                    FACT_RESET.equals(event.action()) ? "reset" : "set", event.detail());
        }
    }
}
