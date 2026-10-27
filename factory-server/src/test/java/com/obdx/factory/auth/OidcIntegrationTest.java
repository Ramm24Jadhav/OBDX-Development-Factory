package com.obdx.factory.auth;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.security.oauth2.core.OAuth2AuthenticationException;
import org.springframework.security.oauth2.core.oidc.OidcIdToken;
import org.springframework.security.oauth2.core.oidc.user.DefaultOidcUser;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import java.nio.file.Path;
import java.time.Instant;
import java.util.Base64;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.hamcrest.Matchers.startsWith;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.oidcLogin;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Single sign-on configuration and the mapping of identity-provider users to factory users.
 * The identity provider itself is not contacted. Runs when FACTORY_TEST_DB_URL is set.
 */
@SpringBootTest(properties = {"factory.auth.mode=oidc", "factory.auth.admin-users=lead@bank.local",
        "factory.auth.oidc.username-claim=email",
        "spring.security.oauth2.client.registration.sso.client-id=obdx-factory",
        "spring.security.oauth2.client.registration.sso.client-secret=secret",
        "spring.security.oauth2.client.registration.sso.scope=openid,profile,email",
        "spring.security.oauth2.client.registration.sso.authorization-grant-type=authorization_code",
        "spring.security.oauth2.client.registration.sso.redirect-uri={baseUrl}/login/oauth2/code/{registrationId}",
        "spring.security.oauth2.client.provider.sso.authorization-uri=https://idp.bank.local/authorize",
        "spring.security.oauth2.client.provider.sso.token-uri=https://idp.bank.local/token",
        "spring.security.oauth2.client.provider.sso.jwk-set-uri=https://idp.bank.local/keys",
        "spring.security.oauth2.client.provider.sso.user-info-uri=https://idp.bank.local/userinfo",
        "spring.security.oauth2.client.provider.sso.user-name-attribute=sub"})
@AutoConfigureMockMvc
@EnabledIfEnvironmentVariable(named = "FACTORY_TEST_DB_URL", matches = ".+")
class OidcIntegrationTest {

    @TempDir
    static Path temp;

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", () -> System.getenv("FACTORY_TEST_DB_URL"));
        registry.add("spring.datasource.username", () -> System.getenv().getOrDefault("FACTORY_TEST_DB_USER", "factory"));
        registry.add("spring.datasource.password", () -> System.getenv().getOrDefault("FACTORY_TEST_DB_PASSWORD", "factory"));
        registry.add("factory.storage.root", () -> temp.resolve("data").toString());
        registry.add("factory.security.secret-key", () -> Base64.getEncoder().encodeToString(new byte[32]));
    }

    @Autowired
    private MockMvc mvc;

    @Autowired
    private OidcProvisioner provisioner;

    @Autowired
    private UserDirectory directory;

    @Test
    void sendsUsersToTheIdentityProviderAndRefusesPasswordSignIn() throws Exception {
        mvc.perform(get("/api/auth/config"))
                .andExpect(jsonPath("$.mode").value("oidc"))
                .andExpect(jsonPath("$.ssoLoginUrl").value("oauth2/authorization/sso"));
        mvc.perform(get("/oauth2/authorization/sso"))
                .andExpect(status().is3xxRedirection())
                .andExpect(header().string("Location", startsWith("https://idp.bank.local/authorize?response_type=code&client_id=obdx-factory")));
        mvc.perform(post("/api/auth/login").with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\": \"x\", \"password\": \"y\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void recordsSsoUsersAndUsesTheConfiguredClaimAsUsername() throws Exception {
        OidcUser fromIdp = oidcUser(Map.of("sub", "00u1abc", "email", "Lead@Bank.Local", "name", "Lakshmi Iyer"));

        OidcUser signedIn = provisioner.provision(fromIdp);

        assertThat(signedIn.getName()).isEqualTo("Lead@Bank.Local");
        AppUser user = directory.find("lead@bank.local");
        assertThat(user.getDisplayName()).isEqualTo("Lakshmi Iyer");
        assertThat(user.getSource()).isEqualTo(AppUser.Source.OIDC);
        assertThat(user.isAdmin()).isTrue();

        mvc.perform(get("/api/auth/me").with(oidcLogin().oidcUser(signedIn)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.username").value("lead@bank.local"))
                .andExpect(jsonPath("$.admin").value(true));

        assertThatThrownBy(() -> provisioner.provision(oidcUser(Map.of("sub", "00u2"))))
                .isInstanceOf(OAuth2AuthenticationException.class)
                .hasMessageContaining("\"email\" claim");
    }

    private static OidcUser oidcUser(Map<String, Object> claims) {
        OidcIdToken token = new OidcIdToken("token", Instant.now(), Instant.now().plusSeconds(300), claims);
        return new DefaultOidcUser(List.of(), token, "sub");
    }
}
