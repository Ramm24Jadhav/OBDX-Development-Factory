package com.obdx.factory.auth;

import org.springframework.security.saml2.core.Saml2Error;
import org.springframework.security.saml2.provider.service.authentication.DefaultSaml2AuthenticatedPrincipal;
import org.springframework.security.saml2.provider.service.authentication.Saml2AuthenticatedPrincipal;
import org.springframework.security.saml2.provider.service.authentication.Saml2Authentication;
import org.springframework.security.saml2.provider.service.authentication.Saml2AuthenticationException;
import org.springframework.stereotype.Component;

/**
 * Turns a user signed in with SAML into a factory user: takes the username from the configured attribute (or the
 * NameID), records the user with name and email, and refuses disabled accounts. The signature, audience, validity
 * and InResponseTo of the response have already been checked by Spring Security before this runs.
 */
@Component
public class SamlProvisioner {

    private final AuthProperties properties;
    private final UserDirectory directory;

    public SamlProvisioner(AuthProperties properties, UserDirectory directory) {
        this.properties = properties;
        this.directory = directory;
    }

    public Saml2Authentication provision(Saml2Authentication authentication) {
        Saml2AuthenticatedPrincipal principal = (Saml2AuthenticatedPrincipal) authentication.getPrincipal();
        AuthProperties.Saml saml = properties.saml();
        String username = saml.usernameAttribute().isBlank() ? principal.getName() : text(principal, saml.usernameAttribute());
        if (username == null || username.isBlank()) {
            throw new Saml2AuthenticationException(new Saml2Error("missing_username", "The identity provider did not send "
                    + (saml.usernameAttribute().isBlank() ? "a NameID" : "the \"" + saml.usernameAttribute() + "\" attribute")));
        }
        AppUser user = directory.signedIn(username, text(principal, saml.displayNameAttribute()), text(principal, saml.emailAttribute()),
                AppUser.Source.SAML);
        if (!user.isEnabled()) {
            throw new Saml2AuthenticationException(new Saml2Error("disabled", "Your factory account is disabled"));
        }
        // The factory username becomes the principal's name, as for the other sign-in modes.
        DefaultSaml2AuthenticatedPrincipal factoryPrincipal = new DefaultSaml2AuthenticatedPrincipal(user.getUsername(),
                principal.getAttributes(), principal.getSessionIndexes());
        String registrationId = principal.getRelyingPartyRegistrationId();
        factoryPrincipal.setRelyingPartyRegistrationId(registrationId != null ? registrationId : saml.registrationId());
        return new Saml2Authentication(factoryPrincipal, authentication.getSaml2Response(), authentication.getAuthorities());
    }

    private static String text(Saml2AuthenticatedPrincipal principal, String attribute) {
        Object value = attribute == null || attribute.isBlank() ? null : principal.getFirstAttribute(attribute);
        return value == null ? null : value.toString();
    }
}
