package com.obdx.factory.jenkins;

import com.obdx.factory.common.BadRequestException;
import com.obdx.factory.common.NotFoundException;
import com.obdx.factory.common.Urls;
import com.obdx.factory.security.SecretCipher;
import com.obdx.factory.workspace.WorkspaceRepository;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Jenkins settings of workspaces. The API token is stored encrypted, like SVN passwords.
 */
@Service
public class JenkinsSettingsService {

    private final JdbcTemplate jdbc;
    private final SecretCipher cipher;
    private final WorkspaceRepository workspaces;
    private final JenkinsProperties properties;

    public JenkinsSettingsService(JdbcTemplate jdbc, SecretCipher cipher, WorkspaceRepository workspaces, JenkinsProperties properties) {
        this.jdbc = jdbc;
        this.cipher = cipher;
        this.workspaces = workspaces;
        this.properties = properties;
    }

    /** token: null keeps the stored one (while the URL points to the same server), empty removes it. */
    public record SettingsRequest(String url, String jobs, JenkinsSettings.Mode mode, String branchParameter,
                                  JenkinsSettings.BranchValue branchValue, String patchParameter, String username, String token) {
    }

    public record ConnectionResult(List<JenkinsClient.JobInfo> jobs, List<String> warnings) {
    }

    public Optional<JenkinsSettings> find(UUID workspaceId) {
        return jdbc.query("SELECT * FROM jenkins_settings WHERE workspace_id = ?", (rs, row) -> new JenkinsSettings(
                rs.getString("url"), rs.getString("jobs"), JenkinsSettings.Mode.valueOf(rs.getString("mode")),
                rs.getString("branch_parameter"), JenkinsSettings.BranchValue.valueOf(rs.getString("branch_value")),
                rs.getString("patch_parameter"), rs.getString("username"), rs.getString("token_encrypted") != null), workspaceId)
                .stream().findFirst();
    }

    public JenkinsSettings save(UUID workspaceId, SettingsRequest request) {
        if (!workspaces.existsById(workspaceId)) {
            throw new NotFoundException("Workspace not found: " + workspaceId);
        }
        if (request.url() == null || !request.url().trim().matches("https?://.+")) {
            throw new BadRequestException("Enter the Jenkins URL, for example https://jenkins.bank.local");
        }
        if (request.jobs() == null || request.jobs().isBlank()) {
            throw new BadRequestException("Enter at least one job name");
        }
        String[] stored = jdbc.query("SELECT url, token_encrypted FROM jenkins_settings WHERE workspace_id = ?",
                (rs, row) -> new String[] {rs.getString(1), rs.getString(2)}, workspaceId).stream().findFirst().orElse(new String[2]);
        // The stored token goes only to the server it was entered for: a URL to another server needs it entered again
        String tokenEncrypted = keepsToken(stored[0], request.url()) ? stored[1] : null;
        if (request.token() != null) {
            tokenEncrypted = request.token().isEmpty() ? null : cipher.encrypt(request.token());
        }
        jdbc.update("INSERT INTO jenkins_settings (workspace_id, url, jobs, mode, branch_parameter, branch_value, patch_parameter, "
                        + "username, token_encrypted, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) "
                        + "ON CONFLICT (workspace_id) DO UPDATE SET url = EXCLUDED.url, jobs = EXCLUDED.jobs, mode = EXCLUDED.mode, "
                        + "branch_parameter = EXCLUDED.branch_parameter, branch_value = EXCLUDED.branch_value, "
                        + "patch_parameter = EXCLUDED.patch_parameter, username = EXCLUDED.username, "
                        + "token_encrypted = EXCLUDED.token_encrypted, updated_at = EXCLUDED.updated_at",
                workspaceId, request.url().trim().replaceAll("/+$", ""), request.jobs().trim(),
                (request.mode() == null ? JenkinsSettings.Mode.BRANCH : request.mode()).name(),
                blankTo(request.branchParameter(), "BRANCH"),
                (request.branchValue() == null ? JenkinsSettings.BranchValue.PATH : request.branchValue()).name(),
                blankTo(request.patchParameter(), "PATCH"), blankTo(request.username(), null), tokenEncrypted,
                Timestamp.from(Instant.now()));
        return find(workspaceId).orElseThrow();
    }

    /** Checks access to every job and that each accepts the parameter the factory will send. */
    public ConnectionResult test(UUID workspaceId) {
        JenkinsSettings settings = require(workspaceId);
        JenkinsClient client = client(workspaceId);
        List<JenkinsClient.JobInfo> jobs = settings.jobList().stream().map(client::job).toList();
        String parameter = settings.mode() == JenkinsSettings.Mode.BRANCH ? settings.branchParameter() : settings.patchParameter();
        List<String> warnings = jobs.stream().filter(job -> !job.parameters().contains(parameter))
                .map(job -> "Job " + job.name() + " has no build parameter \"" + parameter + "\"; add it so the factory can tell it what to build.")
                .toList();
        return new ConnectionResult(jobs, warnings);
    }

    public JenkinsSettings require(UUID workspaceId) {
        return find(workspaceId).orElseThrow(() -> new BadRequestException("Set up Jenkins for this workspace first (Code page)"));
    }

    public JenkinsClient client(UUID workspaceId) {
        JenkinsSettings settings = require(workspaceId);
        String encrypted = jdbc.query("SELECT token_encrypted FROM jenkins_settings WHERE workspace_id = ?",
                (rs, row) -> rs.getString(1), workspaceId).stream().findFirst().orElse(null);
        return new JenkinsClient(settings.url(), settings.username(), encrypted == null ? null : cipher.decrypt(encrypted), properties);
    }

    /** Whether a stored token may stay with a new URL: the same scheme, host and port as the stored URL. */
    static boolean keepsToken(String storedUrl, String newUrl) {
        return Urls.sameServer(storedUrl, newUrl == null ? null : newUrl.trim());
    }

    private static String blankTo(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value.trim();
    }
}
