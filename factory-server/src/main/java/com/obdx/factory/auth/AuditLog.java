package com.obdx.factory.auth;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * Records who did what: sign-ins, workspace and code changes, approvals, user and role changes.
 */
@Component
public class AuditLog {

    private final JdbcTemplate jdbc;

    public AuditLog(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public record Event(long id, OffsetDateTime at, String username, String action, UUID workspaceId, String target, String detail) {
    }

    /** Records an action by the signed-in user. */
    public void record(String action, UUID workspaceId, String target, String detail) {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        recordAs(auth == null ? null : auth.getName(), action, workspaceId, target, detail);
    }

    public void recordAs(String username, String action, UUID workspaceId, String target, String detail) {
        jdbc.update("INSERT INTO audit_event (at, username, action, workspace_id, target, detail) VALUES (?, ?, ?, ?, ?, ?)",
                Timestamp.from(Instant.now()), username, action, workspaceId,
                target == null || target.length() <= 500 ? target : target.substring(0, 500), detail);
    }

    public List<Event> recent(UUID workspaceId, int limit) {
        List<Object> args = new ArrayList<>();
        String where = "";
        if (workspaceId != null) {
            where = "WHERE workspace_id = ? ";
            args.add(workspaceId);
        }
        args.add(Math.clamp(limit, 1, 1000));
        return jdbc.query("SELECT id, at, username, action, workspace_id, target, detail FROM audit_event " + where
                        + "ORDER BY at DESC, id DESC LIMIT ?",
                (rs, row) -> new Event(rs.getLong("id"), rs.getTimestamp("at").toInstant().atOffset(ZoneOffset.UTC),
                        rs.getString("username"), rs.getString("action"), rs.getObject("workspace_id", UUID.class),
                        rs.getString("target"), rs.getString("detail")),
                args.toArray());
    }
}
