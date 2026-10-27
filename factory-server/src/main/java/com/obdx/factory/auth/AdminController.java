package com.obdx.factory.auth;

import com.obdx.factory.common.NotFoundException;
import com.obdx.factory.workspace.WorkspaceRepository;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/**
 * Administration: users, workspace members and roles, and the audit log.
 */
@RestController
public class AdminController {

    private final AccessGuard guard;
    private final UserDirectory directory;
    private final MembershipRepository memberships;
    private final WorkspaceRepository workspaces;
    private final AuditLog audit;

    public AdminController(AccessGuard guard, UserDirectory directory, MembershipRepository memberships,
                           WorkspaceRepository workspaces, AuditLog audit) {
        this.guard = guard;
        this.directory = directory;
        this.memberships = memberships;
        this.workspaces = workspaces;
        this.audit = audit;
    }

    public record UserView(UUID id, String username, String displayName, String email, AppUser.Source source, boolean admin,
                           boolean enabled, OffsetDateTime createdAt, OffsetDateTime lastLoginAt) {
        static UserView of(AppUser user) {
            return new UserView(user.getId(), user.getUsername(), user.getDisplayName(), user.getEmail(), user.getSource(),
                    user.isAdmin(), user.isEnabled(), user.getCreatedAt(), user.getLastLoginAt());
        }
    }

    public record NewUser(String username, String displayName, String email, String password, Boolean admin) {
    }

    public record UserChange(String displayName, Boolean admin, Boolean enabled) {
    }

    public record PasswordReset(String newPassword) {
    }

    public record RoleRequest(WorkspaceRole role) {
    }

    @GetMapping("/api/admin/users")
    public List<UserView> users() {
        guard.requireAdmin();
        return directory.list().stream().map(UserView::of).toList();
    }

    @PostMapping("/api/admin/users")
    @ResponseStatus(HttpStatus.CREATED)
    public UserView createUser(@RequestBody NewUser request) {
        guard.requireAdmin();
        boolean admin = Boolean.TRUE.equals(request.admin());
        AppUser user = directory.create(request.username(), request.displayName(), request.email(), request.password(), admin);
        audit.record("USER_CREATED", null, user.getUsername(), admin ? "administrator" : null);
        return UserView.of(user);
    }

    @PutMapping("/api/admin/users/{id}")
    public UserView updateUser(@PathVariable UUID id, @RequestBody UserChange change) {
        AppUser admin = guard.requireAdmin();
        AppUser user = directory.update(id, change.displayName(), change.admin(), change.enabled(), admin.getUsername());
        audit.record("USER_CHANGED", null, user.getUsername(),
                "admin=" + user.isAdmin() + ", enabled=" + user.isEnabled());
        return UserView.of(user);
    }

    @PostMapping("/api/admin/users/{id}/password")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void resetPassword(@PathVariable UUID id, @RequestBody PasswordReset request) {
        guard.requireAdmin();
        directory.resetPassword(id, request.newPassword());
        audit.record("PASSWORD_RESET", null, id.toString(), null);
    }

    @GetMapping("/api/workspaces/{workspaceId}/members")
    public List<MembershipRepository.Member> members(@PathVariable UUID workspaceId) {
        guard.require(workspaceId, WorkspaceRole.Permission.VIEW);
        return memberships.members(workspaceId);
    }

    @PutMapping("/api/workspaces/{workspaceId}/members/{userId}")
    public List<MembershipRepository.Member> setMember(@PathVariable UUID workspaceId, @PathVariable UUID userId,
                                                       @RequestBody RoleRequest request) {
        guard.requireAdmin();
        if (!workspaces.existsById(workspaceId)) {
            throw new NotFoundException("Workspace not found: " + workspaceId);
        }
        if (request.role() == null) {
            throw new com.obdx.factory.common.BadRequestException("Choose a role");
        }
        memberships.put(workspaceId, userId, request.role());
        audit.record("MEMBER_SET", workspaceId, userId.toString(), request.role().name());
        return memberships.members(workspaceId);
    }

    @DeleteMapping("/api/workspaces/{workspaceId}/members/{userId}")
    public List<MembershipRepository.Member> removeMember(@PathVariable UUID workspaceId, @PathVariable UUID userId) {
        guard.requireAdmin();
        memberships.remove(workspaceId, userId);
        audit.record("MEMBER_REMOVED", workspaceId, userId.toString(), null);
        return memberships.members(workspaceId);
    }

    @GetMapping("/api/admin/audit")
    public List<AuditLog.Event> audit(@RequestParam(required = false) UUID workspaceId, @RequestParam(defaultValue = "200") int limit) {
        guard.requireAdmin();
        return audit.recent(workspaceId, limit);
    }
}
