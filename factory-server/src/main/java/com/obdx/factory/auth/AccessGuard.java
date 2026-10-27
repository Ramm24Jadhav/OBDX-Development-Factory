package com.obdx.factory.auth;

import com.obdx.factory.common.NotFoundException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.AuthenticationCredentialsNotFoundException;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.UUID;

/**
 * Checks what the signed-in user may do. Controllers call it before acting, so the services stay free of
 * security concerns. Administrators may do everything; others need a role in the workspace concerned.
 */
@Component
public class AccessGuard {

    private final AppUserRepository users;
    private final MembershipRepository memberships;
    private final JdbcTemplate jdbc;

    public AccessGuard(AppUserRepository users, MembershipRepository memberships, JdbcTemplate jdbc) {
        this.users = users;
        this.memberships = memberships;
        this.jdbc = jdbc;
    }

    /** The signed-in user. */
    public AppUser current() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated() || auth.getName() == null) {
            throw new AuthenticationCredentialsNotFoundException("Sign in first");
        }
        AppUser user = users.findByUsername(AppUser.normalize(auth.getName()))
                .orElseThrow(() -> new AuthenticationCredentialsNotFoundException("Sign in first"));
        if (!user.isEnabled()) {
            throw new AccessDeniedException("Your account is disabled");
        }
        return user;
    }

    public AppUser requireAdmin() {
        AppUser user = current();
        if (!user.isAdmin()) {
            throw new AccessDeniedException("Only administrators can do this");
        }
        return user;
    }

    public AppUser require(UUID workspaceId, WorkspaceRole.Permission permission) {
        AppUser user = current();
        if (user.isAdmin()) {
            return user;
        }
        WorkspaceRole role = memberships.role(workspaceId, user.getId())
                .orElseThrow(() -> new AccessDeniedException("You are not a member of this workspace"));
        if (!role.allows(permission)) {
            throw new AccessDeniedException("Your role in this workspace (" + role.name().toLowerCase() + ") does not allow this");
        }
        return user;
    }

    public AppUser requireForRequirement(UUID requirementId, WorkspaceRole.Permission permission) {
        return require(workspaceOf("requirement", requirementId, "Requirement"), permission);
    }

    public AppUser requireForDesign(UUID designId, WorkspaceRole.Permission permission) {
        return require(workspaceOf("screen_design", designId, "Design"), permission);
    }

    /** Workspace id to role for the signed-in user; null means "all workspaces" (administrator). */
    public Map<UUID, WorkspaceRole> visibleWorkspaces() {
        AppUser user = current();
        return user.isAdmin() ? null : memberships.rolesOf(user.getId());
    }

    private UUID workspaceOf(String table, UUID id, String what) {
        return jdbc.query("SELECT workspace_id FROM " + table + " WHERE id = ?", (rs, row) -> rs.getObject(1, UUID.class), id)
                .stream().findFirst().orElseThrow(() -> new NotFoundException(what + " not found: " + id));
    }
}
