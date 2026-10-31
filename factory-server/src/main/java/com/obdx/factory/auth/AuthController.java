package com.obdx.factory.auth;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.info.BuildProperties;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.DisabledException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.util.Arrays;
import java.util.List;
import java.util.UUID;

@RestController
public class AuthController {

    private final AuthenticationManager authenticationManager;
    private final SecurityContextRepository contextRepository;
    private final UserDirectory directory;
    private final LoginAttempts attempts;
    private final AccessGuard guard;
    private final MembershipRepository memberships;
    private final AuditLog audit;
    private final AuthProperties properties;
    private final BuildProperties buildInfo;

    public AuthController(AuthenticationManager authenticationManager, SecurityContextRepository contextRepository,
                          UserDirectory directory, LoginAttempts attempts, AccessGuard guard, MembershipRepository memberships,
                          AuditLog audit, AuthProperties properties,
                          ObjectProvider<BuildProperties> buildInfo) {
        this.authenticationManager = authenticationManager;
        this.contextRepository = contextRepository;
        this.directory = directory;
        this.attempts = attempts;
        this.guard = guard;
        this.memberships = memberships;
        this.audit = audit;
        this.properties = properties;
        this.buildInfo = buildInfo.getIfAvailable();
    }

    public record AuthConfig(String mode, String ssoLoginUrl, String version) {
    }

    public record LoginRequest(String username, String password) {
    }

    public record Membership(UUID workspaceId, WorkspaceRole role, List<WorkspaceRole.Permission> permissions) {
    }

    public record Me(String username, String displayName, String email, boolean admin, AppUser.Source source,
                     boolean canChangePassword, List<Membership> memberships) {
    }

    public record PasswordChange(String currentPassword, String newPassword) {
    }

    /** Tells the sign-in page which form to show, and the factory version for its top bar. */
    @GetMapping("/api/auth/config")
    public AuthConfig config() {
        String ssoLoginUrl = properties.isOidc() ? "oauth2/authorization/" + properties.oidc().registrationId()
                : properties.isSaml() ? "saml2/authenticate/" + properties.saml().registrationId() : null;
        return new AuthConfig(properties.mode().toLowerCase(), ssoLoginUrl, buildInfo == null ? null : buildInfo.getVersion());
    }

    @PostMapping("/api/auth/login")
    public ResponseEntity<?> login(@RequestBody LoginRequest login, HttpServletRequest request, HttpServletResponse response) {
        if (properties.isSso()) {
            return problem(HttpStatus.BAD_REQUEST, "This installation uses single sign-on");
        }
        String username = AppUser.normalize(login.username());
        if (username.isEmpty() || login.password() == null || login.password().isEmpty()) {
            return problem(HttpStatus.BAD_REQUEST, "Enter your username and password");
        }
        String address = request.getRemoteAddr();
        var locked = attempts.lockedFor(username, address);
        if (locked.isPresent()) {
            return problem(HttpStatus.TOO_MANY_REQUESTS, "Too many failed sign-ins. Try again in "
                    + Math.max(1, locked.get().toMinutes() + 1) + " minute(s).");
        }
        Authentication result;
        try {
            result = authenticationManager.authenticate(UsernamePasswordAuthenticationToken.unauthenticated(username, login.password()));
        } catch (DisabledException e) {
            // Only after the password was verified (see SecurityConfig): a wrong password gets the same 401 as anyone else
            attempts.succeeded(username, address);
            audit.recordAs(username, "LOGIN_FAILED", null, null, "account disabled");
            return problem(HttpStatus.FORBIDDEN, "Your account is disabled");
        } catch (AuthenticationException e) {
            attempts.failed(username, address);
            audit.recordAs(username, "LOGIN_FAILED", null, null, null);
            return problem(HttpStatus.UNAUTHORIZED, "Wrong username or password");
        }
        attempts.succeeded(username, address);

        String displayName = null;
        String email = null;
        if (result.getPrincipal() instanceof DirectoryUser directoryUser) {
            displayName = directoryUser.displayName();
            email = directoryUser.email();
        }
        AppUser user = directory.signedIn(username, displayName, email, properties.isLdap() ? AppUser.Source.LDAP : AppUser.Source.LOCAL);
        if (!user.isEnabled()) {
            audit.recordAs(username, "LOGIN_FAILED", null, null, "account disabled");
            return problem(HttpStatus.FORBIDDEN, "Your account is disabled");
        }

        // A new session id at sign-in prevents session fixation.
        request.getSession(true);
        request.changeSessionId();
        SecurityContext context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(UsernamePasswordAuthenticationToken.authenticated(user.getUsername(), null, List.of()));
        SecurityContextHolder.setContext(context);
        contextRepository.saveContext(context, request, response);
        audit.recordAs(user.getUsername(), "LOGIN", null, null, user.getSource().name());
        return ResponseEntity.ok(me());
    }

    @GetMapping("/api/auth/me")
    public Me me() {
        AppUser user = guard.current();
        List<Membership> list = memberships.rolesOf(user.getId()).entrySet().stream()
                .map(e -> new Membership(e.getKey(), e.getValue(), Arrays.stream(WorkspaceRole.Permission.values()).filter(e.getValue()::allows).toList()))
                .toList();
        return new Me(user.getUsername(), user.getDisplayName(), user.getEmail(), user.isAdmin(), user.getSource(),
                user.getSource() == AppUser.Source.LOCAL, list);
    }

    @PostMapping("/api/auth/password")
    public ResponseEntity<Void> changePassword(@RequestBody PasswordChange change) {
        AppUser user = guard.current();
        directory.changeOwnPassword(user.getUsername(), change.currentPassword(), change.newPassword());
        audit.record("PASSWORD_CHANGED", null, user.getUsername(), null);
        return ResponseEntity.noContent().build();
    }

    private static ResponseEntity<ProblemDetail> problem(HttpStatus status, String detail) {
        return ResponseEntity.status(status).body(ProblemDetail.forStatusAndDetail(status, detail));
    }
}
