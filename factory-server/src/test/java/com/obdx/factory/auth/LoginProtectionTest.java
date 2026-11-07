package com.obdx.factory.auth;

import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.DisabledException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** Sign-in throttling, the disabled-account answer, and the security headers. */
class LoginProtectionTest {

    private final AtomicReference<Instant> now = new AtomicReference<>(Instant.parse("2026-10-31T10:00:00Z"));
    private final Clock clock = new Clock() {
        @Override
        public java.time.ZoneId getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(java.time.ZoneId zone) {
            return this;
        }

        @Override
        public Instant instant() {
            return now.get();
        }
    };
    private final AuthProperties properties = new AuthProperties("local", List.of(), "", 3, Duration.ofMinutes(15), 5,
            null, null, null);
    private final LoginAttempts attempts = new LoginAttempts(properties, clock);

    @Test
    void someoneElseCannotLockTheAdministratorOut() {
        for (int i = 0; i < 3; i++) {
            attempts.failed("admin", "10.0.0.66");
        }

        assertThat(attempts.lockedFor("admin", "10.0.0.66")).isPresent();
        assertThat(attempts.lockedFor("admin", "10.0.0.5")).isEmpty();
    }

    @Test
    void anAddressTryingManyUsernamesWaitsLongerEachTime() {
        for (int i = 0; i < 4; i++) {
            attempts.failed("user" + i, "10.0.0.66");
        }
        assertThat(attempts.lockedFor("someone", "10.0.0.66")).isEmpty();

        attempts.failed("user4", "10.0.0.66");
        assertThat(attempts.lockedFor("someone", "10.0.0.66")).contains(Duration.ofSeconds(1));
        attempts.failed("user5", "10.0.0.66");
        attempts.failed("user6", "10.0.0.66");
        assertThat(attempts.lockedFor("someone", "10.0.0.66")).contains(Duration.ofSeconds(4));
        assertThat(attempts.lockedFor("someone", "10.0.0.7")).isEmpty();
        assertThat(LoginAttempts.backoff(40, Duration.ofMinutes(15))).isEqualTo(Duration.ofMinutes(15));

        // forgotten once the lock duration passes without failures
        now.set(now.get().plus(Duration.ofMinutes(16)));
        attempts.failed("user7", "10.0.0.66");
        assertThat(attempts.lockedFor("someone", "10.0.0.66")).isEmpty();
    }

    @Test
    void keepsABoundedNumberOfEntries() {
        for (int i = 0; i < LoginAttempts.MAX_ENTRIES + 500; i++) {
            attempts.failed("user" + i, "10.1." + (i / 250) + "." + (i % 250));
        }

        assertThat(attempts.entries()).isLessThanOrEqualTo(2 * LoginAttempts.MAX_ENTRIES);
    }

    @Test
    void aDisabledAccountIsReportedOnlyAfterTheRightPassword() {
        BCryptPasswordEncoder encoder = new BCryptPasswordEncoder(4);
        UserDetailsService users = username -> User.withUsername(username).password(encoder.encode("Right-Password-1"))
                .disabled(true).authorities(List.of()).build();
        var provider = SecurityConfig.localProvider(users, encoder);

        assertThatThrownBy(() -> provider.authenticate(UsernamePasswordAuthenticationToken.unauthenticated("ravi", "wrong")))
                .isInstanceOf(BadCredentialsException.class);
        assertThatThrownBy(() -> provider.authenticate(UsernamePasswordAuthenticationToken.unauthenticated("ravi", "Right-Password-1")))
                .isInstanceOf(DisabledException.class);
    }

    @Test
    void theContentSecurityPolicyKeepsScriptsAndStylesAlone() {
        String policy = SecurityConfig.contentSecurityPolicy(null);
        assertThat(policy).isEqualTo("frame-ancestors 'self'; object-src 'none'; base-uri 'self'; form-action 'self'");
        assertThat(policy).doesNotContain("script-src").doesNotContain("style-src");
        // SAML's sign-in step posts a form to the identity provider
        assertThat(SecurityConfig.contentSecurityPolicy("https://adfs.bank.local/adfs/ls/"))
                .endsWith("form-action 'self' https://adfs.bank.local");
    }
}
