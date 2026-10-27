package com.obdx.factory.auth;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;

@Repository
public class MembershipRepository {

    private final JdbcTemplate jdbc;

    public MembershipRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public record Member(UUID userId, String username, String displayName, WorkspaceRole role) {
    }

    public Optional<WorkspaceRole> role(UUID workspaceId, UUID userId) {
        return jdbc.query("SELECT role FROM workspace_member WHERE workspace_id = ? AND user_id = ?",
                (rs, row) -> WorkspaceRole.valueOf(rs.getString("role")), workspaceId, userId).stream().findFirst();
    }

    /** Workspace id to role, for one user. */
    public Map<UUID, WorkspaceRole> rolesOf(UUID userId) {
        return jdbc.query("SELECT workspace_id, role FROM workspace_member WHERE user_id = ?",
                        (rs, row) -> Map.entry(rs.getObject("workspace_id", UUID.class), WorkspaceRole.valueOf(rs.getString("role"))), userId)
                .stream().collect(Collectors.toMap(Map.Entry::getKey, Map.Entry::getValue));
    }

    public List<Member> members(UUID workspaceId) {
        return jdbc.query("SELECT u.id, u.username, u.display_name, m.role FROM workspace_member m JOIN app_user u ON u.id = m.user_id "
                        + "WHERE m.workspace_id = ? ORDER BY u.username",
                (rs, row) -> new Member(rs.getObject("id", UUID.class), rs.getString("username"), rs.getString("display_name"),
                        WorkspaceRole.valueOf(rs.getString("role"))),
                workspaceId);
    }

    public void put(UUID workspaceId, UUID userId, WorkspaceRole role) {
        jdbc.update("INSERT INTO workspace_member (workspace_id, user_id, role) VALUES (?, ?, ?) "
                + "ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = EXCLUDED.role", workspaceId, userId, role.name());
    }

    public void remove(UUID workspaceId, UUID userId) {
        jdbc.update("DELETE FROM workspace_member WHERE workspace_id = ? AND user_id = ?", workspaceId, userId);
    }
}
