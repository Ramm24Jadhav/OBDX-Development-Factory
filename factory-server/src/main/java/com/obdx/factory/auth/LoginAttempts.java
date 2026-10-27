package com.obdx.factory.auth;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Locks a username for a while after too many failed sign-ins in a row, to slow down password guessing.
 * Kept in memory: a restart clears it.
 */
@Component
public class LoginAttempts {

    private record State(int failures, Instant lockedUntil) {
    }

    private final Map<String, State> states = new ConcurrentHashMap<>();
    private final AuthProperties properties;
    private final Clock clock;

    @Autowired
    public LoginAttempts(AuthProperties properties) {
        this(properties, Clock.systemUTC());
    }

    LoginAttempts(AuthProperties properties, Clock clock) {
        this.properties = properties;
        this.clock = clock;
    }

    /** How long the username stays locked, if it is. */
    public Optional<Duration> lockedFor(String username) {
        State state = states.get(username);
        if (state == null || state.lockedUntil() == null) {
            return Optional.empty();
        }
        Duration left = Duration.between(clock.instant(), state.lockedUntil());
        if (left.isNegative() || left.isZero()) {
            states.remove(username);
            return Optional.empty();
        }
        return Optional.of(left);
    }

    public void failed(String username) {
        states.compute(username, (name, state) -> {
            int failures = (state == null ? 0 : state.failures()) + 1;
            Instant lockedUntil = failures >= properties.maxFailedLogins() ? clock.instant().plus(properties.lockDuration()) : null;
            return new State(lockedUntil == null ? failures : 0, lockedUntil);
        });
    }

    public void succeeded(String username) {
        states.remove(username);
    }
}
