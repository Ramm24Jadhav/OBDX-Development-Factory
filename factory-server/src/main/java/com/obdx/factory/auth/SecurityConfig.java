package com.obdx.factory.auth;

import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.AuthenticationProvider;
import org.springframework.security.authentication.ProviderManager;
import org.springframework.security.authentication.dao.DaoAuthenticationProvider;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.ldap.LdapBindAuthenticationManagerFactory;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.ldap.DefaultSpringSecurityContextSource;
import org.springframework.security.ldap.userdetails.UserDetailsContextMapper;
import org.springframework.security.oauth2.client.oidc.userinfo.OidcUserRequest;
import org.springframework.security.oauth2.client.oidc.userinfo.OidcUserService;
import org.springframework.security.oauth2.client.userinfo.OAuth2UserService;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.security.saml2.provider.service.authentication.OpenSaml5AuthenticationProvider;
import org.springframework.security.saml2.provider.service.authentication.Saml2Authentication;
import org.springframework.security.saml2.provider.service.registration.RelyingPartyRegistrationRepository;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.security.web.context.SecurityContextRepository;

import java.util.Collection;
import java.util.List;

/**
 * Sign-in and protection of the API. The UI's static files and customer review links are public; everything
 * else under /api needs a signed-in user. Sessions use a cookie, and changes need the CSRF token the UI sends back
 * in the X-XSRF-TOKEN header.
 */
@Configuration
public class SecurityConfig {

    private static final Logger log = LoggerFactory.getLogger(SecurityConfig.class);

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    public SecurityContextRepository securityContextRepository() {
        return new HttpSessionSecurityContextRepository();
    }

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http, AuthProperties properties,
                                                   SecurityContextRepository contextRepository,
                                                   ObjectProvider<OAuth2UserService<OidcUserRequest, OidcUser>> oidcUsers,
                                                   ObjectProvider<RelyingPartyRegistrationRepository> samlRegistrations,
                                                   SamlProvisioner samlProvisioner, Environment environment) throws Exception {
        http
                .csrf(csrf -> csrf.spa())
                .securityContext(context -> context.securityContextRepository(contextRepository))
                .authorizeHttpRequests(requests -> requests
                        .requestMatchers("/api/auth/login", "/api/auth/config", "/api/review/**",
                                "/actuator/health", "/actuator/health/**").permitAll()
                        .requestMatchers("/api/**", "/actuator/**").authenticated()
                        .anyRequest().permitAll())
                .exceptionHandling(errors -> errors
                        .authenticationEntryPoint((request, response, e) ->
                                problem(response, HttpStatus.UNAUTHORIZED, "Sign in to continue"))
                        .accessDeniedHandler((request, response, e) ->
                                problem(response, HttpStatus.FORBIDDEN, e.getMessage())))
                // The designer shows its preview in an iframe from the same origin.
                .headers(headers -> headers.frameOptions(frame -> frame.sameOrigin()))
                .logout(logout -> logout
                        .logoutUrl("/api/auth/logout")
                        .logoutSuccessHandler((request, response, auth) -> response.setStatus(HttpServletResponse.SC_NO_CONTENT)))
                .formLogin(form -> form.disable())
                .httpBasic(basic -> basic.disable());
        if (properties.isOidc()) {
            http.oauth2Login(login -> login
                    .userInfoEndpoint(userInfo -> userInfo.oidcUserService(oidcUsers.getObject()))
                    .defaultSuccessUrl("/", true)
                    .failureUrl("/?signInError=sso"));
        }
        if (properties.isSaml()) {
            RelyingPartyRegistrationRepository registrations = samlRegistrations.getIfAvailable();
            if (registrations == null || registrations.findByRegistrationId(properties.saml().registrationId()) == null) {
                throw new IllegalStateException("FACTORY_AUTH_MODE is saml, but there is no SAML registration \""
                        + properties.saml().registrationId() + "\": set spring.security.saml2.relyingparty.registration."
                        + properties.saml().registrationId() + ".* (see docs/DEVELOPMENT.md)");
            }
            if (!"none".equalsIgnoreCase(environment.getProperty("server.servlet.session.cookie.same-site", "lax"))) {
                log.warn("SAML sign-in: the identity provider posts its response from another site, so the session cookie must be "
                        + "sent cross-site. Set FACTORY_COOKIE_SAME_SITE=none and FACTORY_COOKIE_SECURE=true (HTTPS), or sign-in "
                        + "fails with \"no saved authentication request\".");
            }
            http.saml2Login(login -> login
                            .authenticationManager(new ProviderManager(samlAuthentication(samlProvisioner)))
                            .defaultSuccessUrl("/", true)
                            .failureUrl("/?signInError=sso"))
                    // The factory's SAML metadata, for the identity provider's administrators: /saml2/metadata/{registrationId}
                    .saml2Metadata(Customizer.withDefaults());
        }
        return http.build();
    }

    /** Checks username and password for the sign-in form: local accounts or the bank's LDAP directory. */
    @Bean
    public AuthenticationManager authenticationManager(AuthProperties properties, AppUserRepository users, PasswordEncoder encoder) {
        if (properties.isLdap()) {
            AuthProperties.Ldap ldap = properties.ldap();
            DefaultSpringSecurityContextSource contextSource = new DefaultSpringSecurityContextSource(ldap.url());
            if (!ldap.managerDn().isBlank()) {
                contextSource.setUserDn(ldap.managerDn());
                contextSource.setPassword(ldap.managerPassword());
            }
            contextSource.afterPropertiesSet();
            LdapBindAuthenticationManagerFactory factory = new LdapBindAuthenticationManagerFactory(contextSource);
            factory.setUserSearchBase(ldap.userSearchBase());
            factory.setUserSearchFilter(ldap.userSearchFilter());
            factory.setUserDetailsContextMapper(directoryMapper(ldap));
            return factory.createAuthenticationManager();
        }
        UserDetailsService localUsers = username -> users.findByUsername(AppUser.normalize(username))
                .filter(user -> user.getSource() == AppUser.Source.LOCAL && user.getPasswordHash() != null)
                .map(user -> User.withUsername(user.getUsername()).password(user.getPasswordHash())
                        .disabled(!user.isEnabled()).authorities(List.of()).build())
                .orElseThrow(() -> new UsernameNotFoundException("Unknown user"));
        DaoAuthenticationProvider provider = new DaoAuthenticationProvider(localUsers);
        provider.setPasswordEncoder(encoder);
        return new ProviderManager(provider);
    }

    /** Keeps the display name and email from the directory entry, to show and record them in the factory. */
    private static UserDetailsContextMapper directoryMapper(AuthProperties.Ldap ldap) {
        return new UserDetailsContextMapper() {
            @Override
            public org.springframework.security.core.userdetails.UserDetails mapUserFromContext(
                    org.springframework.ldap.core.DirContextOperations ctx, String username, Collection<? extends GrantedAuthority> authorities) {
                return new DirectoryUser(username, ctx.getStringAttribute(ldap.displayNameAttribute()), ctx.getStringAttribute(ldap.emailAttribute()));
            }

            @Override
            public void mapUserToContext(org.springframework.security.core.userdetails.UserDetails user,
                                         org.springframework.ldap.core.DirContextAdapter ctx) {
                throw new UnsupportedOperationException("The factory does not write to the directory");
            }
        };
    }

    /** Single sign-on: loads the user from the identity provider, then records them in the factory. */
    @Bean
    public OAuth2UserService<OidcUserRequest, OidcUser> provisioningOidcUserService(OidcProvisioner provisioner) {
        OidcUserService delegate = new OidcUserService();
        return request -> provisioner.provision(delegate.loadUser(request));
    }

    /** Spring Security checks the SAML response (signature, issuer, audience, times, InResponseTo); then the user is recorded. */
    private static AuthenticationProvider samlAuthentication(SamlProvisioner provisioner) {
        OpenSaml5AuthenticationProvider openSaml = new OpenSaml5AuthenticationProvider();
        return new AuthenticationProvider() {
            @Override
            public Authentication authenticate(Authentication authentication) {
                return provisioner.provision((Saml2Authentication) openSaml.authenticate(authentication));
            }

            @Override
            public boolean supports(Class<?> type) {
                return openSaml.supports(type);
            }
        };
    }

    private static void problem(HttpServletResponse response, HttpStatus status, String detail) throws java.io.IOException {
        response.setStatus(status.value());
        response.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
        String safe = detail == null ? status.getReasonPhrase() : detail.replace("\\", "\\\\").replace("\"", "\\\"");
        response.getWriter().write("{\"status\":" + status.value() + ",\"title\":\"" + status.getReasonPhrase()
                + "\",\"detail\":\"" + safe + "\"}");
    }
}
