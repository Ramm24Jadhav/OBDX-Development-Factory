package com.obdx.factory.auth;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.OffsetDateTime;
import java.util.Locale;
import java.util.UUID;

/**
 * A person who uses the factory.
 */
@Entity
@Table(name = "app_user")
public class AppUser {

    /** Where the account comes from: kept in the factory, the bank's directory, or single sign-on. */
    public enum Source { LOCAL, LDAP, OIDC }

    @Id
    private UUID id;

    @Column(nullable = false, unique = true, length = 200)
    private String username;

    @Column(name = "display_name", nullable = false, length = 200)
    private String displayName;

    @Column(length = 300)
    private String email;

    @Column(name = "password_hash", length = 200)
    private String passwordHash;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Source source;

    @Column(nullable = false)
    private boolean admin;

    @Column(nullable = false)
    private boolean enabled;

    @Column(name = "created_at", nullable = false)
    private OffsetDateTime createdAt;

    @Column(name = "last_login_at")
    private OffsetDateTime lastLoginAt;

    protected AppUser() {
        // for JPA
    }

    public AppUser(String username, String displayName, String email, Source source) {
        this.id = UUID.randomUUID();
        this.username = normalize(username);
        this.displayName = displayName == null || displayName.isBlank() ? this.username : displayName.trim();
        this.email = email;
        this.source = source;
        this.enabled = true;
        this.createdAt = OffsetDateTime.now();
    }

    /** Usernames are compared without case, as directories do. */
    public static String normalize(String username) {
        return username == null ? "" : username.trim().toLowerCase(Locale.ROOT);
    }

    void loggedIn(String displayName, String email) {
        if (displayName != null && !displayName.isBlank()) {
            this.displayName = displayName.trim();
        }
        if (email != null && !email.isBlank()) {
            this.email = email.trim();
        }
        this.lastLoginAt = OffsetDateTime.now();
    }

    void setPasswordHash(String passwordHash) {
        this.passwordHash = passwordHash;
    }

    void setAdmin(boolean admin) {
        this.admin = admin;
    }

    void setEnabled(boolean enabled) {
        this.enabled = enabled;
    }

    void setDisplayName(String displayName) {
        this.displayName = displayName;
    }

    public UUID getId() {
        return id;
    }

    public String getUsername() {
        return username;
    }

    public String getDisplayName() {
        return displayName;
    }

    public String getEmail() {
        return email;
    }

    public String getPasswordHash() {
        return passwordHash;
    }

    public Source getSource() {
        return source;
    }

    public boolean isAdmin() {
        return admin;
    }

    public boolean isEnabled() {
        return enabled;
    }

    public OffsetDateTime getCreatedAt() {
        return createdAt;
    }

    public OffsetDateTime getLastLoginAt() {
        return lastLoginAt;
    }
}
