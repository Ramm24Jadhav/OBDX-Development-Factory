package com.obdx.factory.auth;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

import java.time.Duration;
import java.util.List;

/**
 * How people sign in.
 *
 * @param mode                 "local" (accounts kept in the factory), "ldap" (bank directory), "oidc" (single sign-on
 *                             with OpenID Connect) or "saml" (single sign-on with SAML 2.0, for example AD FS)
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
        @DefaultValue Oidc oidc,
        @DefaultValue Saml saml) {

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

    /**
     * The identity provider and the factory's own keys are configured with the standard
     * spring.security.saml2.relyingparty.registration.* settings.
     *
     * @param registrationId       name of that registration
     * @param usernameAttribute    assertion attribute used as the factory username; empty means the NameID
     * @param displayNameAttribute attribute with the person's name
     * @param emailAttribute       attribute with the email address
     */
    public record Saml(
            @DefaultValue("sso") String registrationId,
            @DefaultValue("") String usernameAttribute,
            @DefaultValue("http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name") String displayNameAttribute,
            @DefaultValue("http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress") String emailAttribute) {
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

    public boolean isSaml() {
        return "saml".equalsIgnoreCase(mode);
    }

    /** Single sign-on of either kind: people sign in at the identity provider, not with a password here. */
    public boolean isSso() {
        return isOidc() || isSaml();
    }
}
