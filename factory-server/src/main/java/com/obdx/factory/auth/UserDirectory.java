package com.obdx.factory.auth;

import com.obdx.factory.common.BadRequestException;
import com.obdx.factory.common.ConflictException;
import com.obdx.factory.common.NotFoundException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * The factory's users: local accounts, and directory or single sign-on users recorded at their first sign-in.
 */
@Service
public class UserDirectory {

    private static final Logger log = LoggerFactory.getLogger(UserDirectory.class);
    static final int MIN_PASSWORD_LENGTH = 12;

    private final AppUserRepository users;
    private final PasswordEncoder passwordEncoder;
    private final AuthProperties properties;
    private final Set<String> configuredAdmins;

    public UserDirectory(AppUserRepository users, PasswordEncoder passwordEncoder, AuthProperties properties) {
        this.users = users;
        this.passwordEncoder = passwordEncoder;
        this.properties = properties;
        this.configuredAdmins = properties.adminUsers().stream().map(AppUser::normalize).collect(Collectors.toSet());
    }

    /** For a new local installation: creates the first administrator, "admin". */
    @EventListener(ApplicationReadyEvent.class)
    @Transactional
    public void createFirstAdmin() {
        // Only local administrators can sign in with local accounts, so directory or SSO administrators do not count.
        if (!properties.isLocal() || users.countBySourceAndAdminTrueAndEnabledTrue(AppUser.Source.LOCAL) > 0) {
            return;
        }
        String password = properties.initialAdminPassword();
        boolean generated = password == null || password.isBlank();
        if (generated) {
            password = randomPassword();
        }
        AppUser admin = users.findByUsername("admin").orElseGet(() -> new AppUser("admin", "Administrator", null, AppUser.Source.LOCAL));
        admin.setPasswordHash(passwordEncoder.encode(password));
        admin.setAdmin(true);
        admin.setEnabled(true);
        users.save(admin);
        if (generated) {
            log.warn("Created the first administrator. Username: admin  Password: {}  (shown once; change it after signing in)", password);
        } else {
            log.warn("Created the first administrator \"admin\" with the password from FACTORY_ADMIN_PASSWORD.");
        }
    }

    /**
     * Records a successful sign-in. Directory and SSO users get an account the first time; usernames listed in
     * factory.auth.admin-users become administrators.
     */
    @Transactional
    public AppUser signedIn(String username, String displayName, String email, AppUser.Source source) {
        String name = AppUser.normalize(username);
        AppUser user = users.findByUsername(name).orElseGet(() -> new AppUser(name, displayName, email, source));
        if (configuredAdmins.contains(name)) {
            user.setAdmin(true);
        }
        user.loggedIn(displayName, email);
        return users.save(user);
    }

    @Transactional(readOnly = true)
    public AppUser find(String username) {
        return users.findByUsername(AppUser.normalize(username))
                .orElseThrow(() -> new NotFoundException("Unknown user: " + username));
    }

    @Transactional(readOnly = true)
    public List<AppUser> list() {
        return users.findAllByOrderByUsername();
    }

    /** Creates a local account (in local mode), or registers a directory/SSO user before their first sign-in. */
    @Transactional
    public AppUser create(String username, String displayName, String email, String password, boolean admin) {
        String name = AppUser.normalize(username);
        if (!name.matches("[a-z0-9._@-]{2,200}")) {
            throw new BadRequestException("Usernames use letters, digits, dot, dash, underscore or @ (2 to 200 characters)");
        }
        if (users.findByUsername(name).isPresent()) {
            throw new ConflictException("User " + name + " already exists");
        }
        AppUser.Source source = properties.isLocal() ? AppUser.Source.LOCAL : properties.isLdap() ? AppUser.Source.LDAP : AppUser.Source.OIDC;
        AppUser user = new AppUser(name, displayName, email, source);
        if (source == AppUser.Source.LOCAL) {
            user.setPasswordHash(passwordEncoder.encode(checkPassword(password)));
        }
        user.setAdmin(admin);
        return users.save(user);
    }

    @Transactional
    public AppUser update(UUID id, String displayName, Boolean admin, Boolean enabled, String actingUsername) {
        AppUser user = users.findById(id).orElseThrow(() -> new NotFoundException("Unknown user"));
        boolean self = user.getUsername().equals(AppUser.normalize(actingUsername));
        if (self && (Boolean.FALSE.equals(admin) || Boolean.FALSE.equals(enabled))) {
            throw new BadRequestException("You cannot remove your own administrator role or disable yourself");
        }
        if (displayName != null && !displayName.isBlank()) {
            user.setDisplayName(displayName.trim());
        }
        if (admin != null) {
            user.setAdmin(admin);
        }
        if (enabled != null) {
            user.setEnabled(enabled);
        }
        return users.save(user);
    }

    @Transactional
    public void resetPassword(UUID id, String newPassword) {
        AppUser user = users.findById(id).orElseThrow(() -> new NotFoundException("Unknown user"));
        requireLocal(user);
        user.setPasswordHash(passwordEncoder.encode(checkPassword(newPassword)));
        users.save(user);
    }

    @Transactional
    public void changeOwnPassword(String username, String currentPassword, String newPassword) {
        AppUser user = find(username);
        requireLocal(user);
        if (currentPassword == null || !passwordEncoder.matches(currentPassword, user.getPasswordHash())) {
            throw new BadRequestException("The current password is wrong");
        }
        user.setPasswordHash(passwordEncoder.encode(checkPassword(newPassword)));
        users.save(user);
    }

    private static void requireLocal(AppUser user) {
        if (user.getSource() != AppUser.Source.LOCAL) {
            throw new BadRequestException("This account signs in through the bank's directory or SSO; its password is managed there");
        }
    }

    static String checkPassword(String password) {
        if (password == null || password.length() < MIN_PASSWORD_LENGTH) {
            throw new BadRequestException("Passwords need at least " + MIN_PASSWORD_LENGTH + " characters");
        }
        return password;
    }

    private static String randomPassword() {
        String alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
        SecureRandom random = new SecureRandom();
        StringBuilder password = new StringBuilder();
        for (int i = 0; i < 20; i++) {
            password.append(alphabet.charAt(random.nextInt(alphabet.length())));
        }
        return password.toString();
    }
}
