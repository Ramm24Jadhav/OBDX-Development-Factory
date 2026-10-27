package com.obdx.factory.auth;

import java.util.EnumSet;
import java.util.Set;

/**
 * What a member may do in a workspace. Administrators may do everything everywhere.
 */
public enum WorkspaceRole {

    /** Writes and refines requirements, designs screens. */
    ANALYST(EnumSet.of(Permission.VIEW, Permission.COMMENT, Permission.EDIT_REQUIREMENTS, Permission.EDIT_DESIGNS)),
    /** Connects and imports code, corrects the Project Profile, designs screens. */
    DEVELOPER(EnumSet.of(Permission.VIEW, Permission.COMMENT, Permission.MANAGE_CODE, Permission.EDIT_DESIGNS)),
    /** Everything in the workspace, including approving requirements and designs. */
    LEAD(EnumSet.allOf(Permission.class));

    private final Set<Permission> permissions;

    WorkspaceRole(Set<Permission> permissions) {
        this.permissions = permissions;
    }

    public boolean allows(Permission permission) {
        return permissions.contains(permission);
    }

    public enum Permission {
        /** See the workspace, its code search, profile, requirements and designs. */
        VIEW,
        /** Comment on designs. */
        COMMENT,
        /** SVN settings, imports and Project Profile corrections. */
        MANAGE_CODE,
        /** Create, answer, edit and delete requirements. */
        EDIT_REQUIREMENTS,
        /** Create and change screen designs and share review links. */
        EDIT_DESIGNS,
        /** Approve requirement specs and screen designs. */
        APPROVE
    }
}
