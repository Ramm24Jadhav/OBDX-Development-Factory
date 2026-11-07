package com.obdx.factory.model;

import org.springframework.stereotype.Component;

import java.time.OffsetDateTime;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * The connection tests run on the Models page since the factory started, per model server: the last test, the last one
 * that succeeded, and the error of the last one that failed. Kept in memory: a restart starts from "not tested", so the
 * page never shows a server as connected without a test.
 */
@Component
public class ProviderChecks {

    /**
     * @param lastOk      when a test last succeeded, or null
     * @param lastError   the error of the last failed test, or null when the last test succeeded
     * @param models      how many models the server listed in its last successful test
     */
    public record Check(String baseUrl, OffsetDateTime lastAt, boolean ok, long latencyMs, OffsetDateTime lastOk, String lastError,
                       int models) {
    }

    private final Map<String, Check> checks = new ConcurrentHashMap<>();

    public void succeeded(String baseUrl, long latencyMs, int models) {
        OffsetDateTime now = OffsetDateTime.now();
        checks.put(key(baseUrl), new Check(key(baseUrl), now, true, latencyMs, now, null, models));
    }

    public void failed(String baseUrl, long latencyMs, String error) {
        String key = key(baseUrl);
        Check before = checks.get(key);
        checks.put(key, new Check(key, OffsetDateTime.now(), false, latencyMs, before == null ? null : before.lastOk(),
                com.obdx.factory.common.Messages.redacted(error),
                before == null ? 0 : before.models()));
    }

    public List<Check> all() {
        return checks.values().stream().sorted(Comparator.comparing(Check::baseUrl)).toList();
    }

    static String key(String baseUrl) {
        return baseUrl == null ? "" : baseUrl.strip().replaceAll("/+$", "");
    }
}
