package com.obdx.factory.auth;

import org.springframework.security.oauth2.core.OAuth2AuthenticationException;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.oidc.user.DefaultOidcUser;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.stereotype.Component;

/**
 * Turns a user signed in through single sign-on into a factory user: takes the username from the configured
 * claim, records the user, and refuses disabled accounts.
 */
@Component
public class OidcProvisioner {

    private final AuthProperties properties;
    private final UserDirectory directory;

    public OidcProvisioner(AuthProperties properties, UserDirectory directory) {
        this.properties = properties;
        this.directory = directory;
    }

    public OidcUser provision(OidcUser oidcUser) {
        String claim = properties.oidc().usernameClaim();
        String username = oidcUser.getClaimAsString(claim);
        if (username == null || username.isBlank()) {
            throw new OAuth2AuthenticationException(new OAuth2Error("missing_username"),
                    "The identity provider did not send the \"" + claim + "\" claim");
        }
        AppUser user = directory.signedIn(username, oidcUser.getClaimAsString(properties.oidc().displayNameClaim()),
                oidcUser.getEmail(), AppUser.Source.OIDC);
        if (!user.isEnabled()) {
            throw new OAuth2AuthenticationException(new OAuth2Error("disabled"), "Your factory account is disabled");
        }
        // The factory username becomes the principal's name.
        return new DefaultOidcUser(oidcUser.getAuthorities(), oidcUser.getIdToken(), oidcUser.getUserInfo(), claim);
    }
}
