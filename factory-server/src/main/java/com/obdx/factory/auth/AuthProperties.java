package com.obdx.factory.auth;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

import java.time.Duration;
import java.util.List;

/**
 * How people sign in.
 *
 * @param mode                 "local" (accounts kept in the factory), "ldap" (bank directory) or "oidc" (single sign-on)
 * @param adminUsers           usernames that are always administrators, to set up a new installation
 * @param initialAdminPassword password for the first local "admin" account; if empty, a random one is logged once
 * @param maxFailedLogins      failed sign-ins in a row before a username is locked for lockDuration
 */
@ConfigurationProperties(prefix = "factory.auth")
public record AuthProperties(
        @DefaultValue("local") String mode,
        @DefaultValue({}) List<String> adminUsers,
        @DefaultValue("") String initialAdminPassword,
        @DefaultValue("5") int maxFailedLogins,
        @DefaultValue("15m") Duration lockDuration,
        @DefaultValue Ldap ldap,
        @DefaultValue Oidc oidc) {

    /**
     * @param url               for example ldaps://ad.bank.local:636
     * @param userSearchBase    where users are searched, for example ou=Users,dc=bank,dc=local
     * @param userSearchFilter  {0} is the username; "(sAMAccountName={0})" for Active Directory
     * @param managerDn         service account used to search (empty for anonymous search)
     */
    public record Ldap(
            @DefaultValue("") String url,
            @DefaultValue("") String userSearchBase,
            @DefaultValue("(uid={0})") String userSearchFilter,
            @DefaultValue("") String managerDn,
            @DefaultValue("") String managerPassword,
            @DefaultValue("displayName") String displayNameAttribute,
            @DefaultValue("mail") String emailAttribute) {
    }

    /**
     * The client itself is configured with the standard spring.security.oauth2.client.registration.* settings.
     *
     * @param registrationId  name of that registration
     * @param usernameClaim   claim used as the factory username
     */
    public record Oidc(
            @DefaultValue("sso") String registrationId,
            @DefaultValue("preferred_username") String usernameClaim,
            @DefaultValue("name") String displayNameClaim) {
    }

    public boolean isLocal() {
        return "local".equalsIgnoreCase(mode);
    }

    public boolean isLdap() {
        return "ldap".equalsIgnoreCase(mode);
    }

    public boolean isOidc() {
        return "oidc".equalsIgnoreCase(mode);
    }
}
