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
import java.util.Arrays;
import java.util.List;
import java.util.Map;
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
    private final AppUserRepository users;
    private final AuthProperties properties;

    public AdminController(AccessGuard guard, UserDirectory directory, MembershipRepository memberships,
                           WorkspaceRepository workspaces, AuditLog audit, AppUserRepository users, AuthProperties properties) {
        this.guard = guard;
        this.directory = directory;
        this.memberships = memberships;
        this.workspaces = workspaces;
        this.audit = audit;
        this.users = users;
        this.properties = properties;
    }

    /** The actions that change what someone may do, for a user's privilege history. */
    static final List<String> PRIVILEGE_ACTIONS = List.of("USER_CREATED", "USER_CHANGED", "ADMIN_GRANTED", "ADMIN_REVOKED",
            "USER_DEACTIVATED", "USER_ACTIVATED", "MEMBER_SET", "MEMBER_REMOVED", "PASSWORD_RESET");

    /** What each permission lets a member do (resource and action), in the order of the role definitions. */
    static final Map<WorkspaceRole.Permission, String> PERMISSION_TEXT = Map.of(
            WorkspaceRole.Permission.VIEW, "Workspace: see its code search, profile, requirements, designs and changes",
            WorkspaceRole.Permission.COMMENT, "Designs and plans: comment",
            WorkspaceRole.Permission.MANAGE_CODE, "Code: SVN settings, imports, Project Profile, changes, builds and delivery",
            WorkspaceRole.Permission.EDIT_REQUIREMENTS, "Requirements: create, answer, edit and delete",
            WorkspaceRole.Permission.EDIT_DESIGNS, "Designs: create, change and share review links",
            WorkspaceRole.Permission.APPROVE, "Approvals: requirement specifications, designs and change plans");

    public record PermissionRow(String permission, String description, Map<String, Boolean> allowed) {
    }

    public record WorkspaceAccess(UUID workspaceId, String workspace, String role, List<String> allowed, List<String> denied) {
    }

    /** A user's effective access: every workspace they can open, with the role and what it allows and denies. */
    public record UserAccess(UUID userId, String username, boolean admin, boolean enabled, List<WorkspaceAccess> workspaces,
                             List<AuditLog.Event> history) {
    }

    /** Sign-in protection as configured (no secrets): the mode, the lockout and the administrators named in the settings. */
    public record SecuritySettings(String mode, int minPasswordLength, int maxFailedLogins, long lockMinutes, int maxFailedLoginsPerAddress,
                                   List<String> adminUsers) {
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

    /** The permission matrix of the roles, from their definitions (WorkspaceRole): the same rules every request is checked against. */
    @GetMapping("/api/admin/permissions")
    public List<PermissionRow> permissions() {
        guard.requireAdmin();
        return Arrays.stream(WorkspaceRole.Permission.values()).map(p -> {
            Map<String, Boolean> allowed = new java.util.LinkedHashMap<>();
            allowed.put("ADMIN", true);
            Arrays.stream(WorkspaceRole.values()).forEach(r -> allowed.put(r.name(), r.allows(p)));
            return new PermissionRow(p.name(), PERMISSION_TEXT.get(p), allowed);
        }).toList();
    }

    /** What a user may do in each workspace, and the changes to their access, newest first. */
    @GetMapping("/api/admin/users/{id}/access")
    public UserAccess access(@PathVariable UUID id) {
        guard.requireAdmin();
        AppUser user = users.findById(id).orElseThrow(() -> new NotFoundException("Unknown user"));
        Map<UUID, WorkspaceRole> roles = memberships.rolesOf(id);
        List<WorkspaceAccess> list = workspaces.findAll().stream()
                .filter(w -> user.isAdmin() || roles.containsKey(w.getId()))
                .sorted(java.util.Comparator.comparing(com.obdx.factory.workspace.Workspace::getName))
                .map(w -> {
                    WorkspaceRole role = roles.get(w.getId());
                    List<String> allowed = Arrays.stream(WorkspaceRole.Permission.values()).filter(p -> user.isAdmin() || role.allows(p)).map(Enum::name).toList();
                    List<String> denied = Arrays.stream(WorkspaceRole.Permission.values()).filter(p -> !user.isAdmin() && !role.allows(p)).map(Enum::name).toList();
                    return new WorkspaceAccess(w.getId(), w.getName(), user.isAdmin() ? "ADMIN" : role.name(), allowed, denied);
                }).toList();
        return new UserAccess(user.getId(), user.getUsername(), user.isAdmin(), user.isEnabled(), list,
                audit.about(List.of(user.getId().toString(), user.getUsername()), PRIVILEGE_ACTIONS, 100));
    }

    @GetMapping("/api/admin/security")
    public SecuritySettings security() {
        guard.requireAdmin();
        return new SecuritySettings(properties.mode(), UserDirectory.MIN_PASSWORD_LENGTH, properties.maxFailedLogins(),
                properties.lockDuration().toMinutes(), properties.maxFailedLoginsPerAddress(), properties.adminUsers());
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
        AppUser before = users.findById(id).orElseThrow(() -> new NotFoundException("Unknown user"));
        boolean wasAdmin = before.isAdmin();
        boolean wasEnabled = before.isEnabled();
        AppUser user = directory.update(id, change.displayName(), change.admin(), change.enabled(), admin.getUsername());
        audit.record("USER_CHANGED", null, user.getUsername(),
                "admin=" + user.isAdmin() + ", enabled=" + user.isEnabled());
        // Privilege changes on their own, so the history says exactly what changed
        if (wasAdmin != user.isAdmin()) {
            audit.record(user.isAdmin() ? "ADMIN_GRANTED" : "ADMIN_REVOKED", null, user.getUsername(), wasAdmin + " -> " + user.isAdmin());
        }
        if (wasEnabled != user.isEnabled()) {
            audit.record(user.isEnabled() ? "USER_ACTIVATED" : "USER_DEACTIVATED", null, user.getUsername(), null);
        }
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
        WorkspaceRole previous = memberships.role(workspaceId, userId).orElse(null);
        memberships.put(workspaceId, userId, request.role());
        // The role first (pages read it), then what it was
        audit.record("MEMBER_SET", workspaceId, userId.toString(), request.role().name()
                + (previous == null ? " (new member)" : previous == request.role() ? "" : " (was " + previous.name() + ")"));
        return memberships.members(workspaceId);
    }

    @DeleteMapping("/api/workspaces/{workspaceId}/members/{userId}")
    public List<MembershipRepository.Member> removeMember(@PathVariable UUID workspaceId, @PathVariable UUID userId) {
        guard.requireAdmin();
        WorkspaceRole previous = memberships.role(workspaceId, userId).orElse(null);
        memberships.remove(workspaceId, userId);
        audit.record("MEMBER_REMOVED", workspaceId, userId.toString(), previous == null ? null : "was " + previous.name());
        return memberships.members(workspaceId);
    }

    public record LastSignIn(AppUser.Source source, OffsetDateTime at) {
    }

    /**
     * When someone last signed in through the given source (LDAP for the factory's sign-in form); at is null when no
     * such sign-in is recorded. Single sign-on (OIDC, SAML) sign-ins are not recorded, so they always come back empty.
     */
    @GetMapping("/api/admin/last-sign-in")
    public LastSignIn lastSignIn(@RequestParam AppUser.Source source) {
        guard.requireAdmin();
        return new LastSignIn(source, audit.latest("LOGIN", source.name()).map(AuditLog.Event::at).orElse(null));
    }

    @GetMapping("/api/admin/audit")
    public List<AuditLog.Event> audit(@RequestParam(required = false) UUID workspaceId, @RequestParam(defaultValue = "200") int limit) {
        guard.requireAdmin();
        return audit.recent(workspaceId, limit);
    }
}
