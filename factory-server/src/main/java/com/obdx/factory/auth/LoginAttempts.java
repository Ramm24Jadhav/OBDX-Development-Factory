package com.obdx.factory.auth;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Comparator;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Slows down password guessing. A username is locked for a while after too many failed sign-ins in a row from one
 * address, so someone elsewhere cannot lock the administrator out. An address that fails often, whatever usernames it
 * tries (password spraying), waits longer after each further failure. Kept in memory and bounded: a restart clears it,
 * and entries without recent failures are dropped.
 */
@Component
public class LoginAttempts {

    /** The most usernames or addresses kept; the oldest go first beyond it. */
    static final int MAX_ENTRIES = 10_000;

    private record State(int failures, Instant last, Instant lockedUntil) {
    }

    private final Map<String, State> users = new ConcurrentHashMap<>();
    private final Map<String, State> addresses = new ConcurrentHashMap<>();
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

    /** How long sign-in stays refused for this username from this address, if it is. */
    public Optional<Duration> lockedFor(String username, String address) {
        Instant now = clock.instant();
        Duration user = left(users.get(userKey(username, address)), now);
        Duration from = left(addresses.get(addressKey(address)), now);
        Duration longest = user.compareTo(from) >= 0 ? user : from;
        return longest.isZero() ? Optional.empty() : Optional.of(longest);
    }

    public void failed(String username, String address) {
        Instant now = clock.instant();
        users.compute(userKey(username, address), (key, state) -> {
            int failures = (state == null || stale(state, now) ? 0 : state.failures()) + 1;
            return failures >= properties.maxFailedLogins() ? new State(0, now, now.plus(properties.lockDuration()))
                    : new State(failures, now, null);
        });
        addresses.compute(addressKey(address), (key, state) -> {
            int failures = (state == null || stale(state, now) ? 0 : state.failures()) + 1;
            int over = failures - properties.maxFailedLoginsPerAddress();
            return new State(failures, now, over < 0 ? null : now.plus(backoff(over, properties.lockDuration())));
        });
        trim(users, now);
        trim(addresses, now);
    }

    public void succeeded(String username, String address) {
        users.remove(userKey(username, address));
    }

    int entries() {
        return users.size() + addresses.size();
    }

    /** 1 second after the first failure over the limit, doubling with each further one, at most maxWait. */
    static Duration backoff(int over, Duration maxWait) {
        Duration wait = Duration.ofSeconds(1L << Math.min(over, 30));
        return wait.compareTo(maxWait) > 0 ? maxWait : wait;
    }

    private static Duration left(State state, Instant now) {
        if (state == null || state.lockedUntil() == null || !state.lockedUntil().isAfter(now)) {
            return Duration.ZERO;
        }
        return Duration.between(now, state.lockedUntil());
    }

    /** No lock in force and no failure within the lock duration: forgotten. */
    private boolean stale(State state, Instant now) {
        return left(state, now).isZero() && !state.last().plus(properties.lockDuration()).isAfter(now);
    }

    private void trim(Map<String, State> map, Instant now) {
        if (map.size() <= MAX_ENTRIES) {
            return;
        }
        map.entrySet().removeIf(e -> stale(e.getValue(), now));
        if (map.size() > MAX_ENTRIES) {
            map.entrySet().stream().sorted(Comparator.comparing(e -> e.getValue().last())).limit(map.size() - MAX_ENTRIES * 9L / 10)
                    .map(Map.Entry::getKey).toList().forEach(map::remove);
        }
    }

    private static String userKey(String username, String address) {
        return username + "|" + addressKey(address);
    }

    private static String addressKey(String address) {
        return address == null ? "" : address;
    }
}
