package com.obdx.factory.common;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/**
 * The secret values the factory holds: SVN passwords, Jenkins tokens, model API keys and the sign-in secrets (LDAP
 * manager password, OIDC client secrets). A server's error can echo any of them, and the patterns of
 * {@link Messages#redacted} only find the ones that look like a secret ("Bearer ...", "sk-..."); a password echoed as
 * "login svc:Winter2026" or a key without a known prefix is found here, by its value. The values are kept in memory
 * only, as they are when the factory uses them.
 */
public final class KnownSecrets {

    /** Shorter values are not masked: "abc" would hide parts of ordinary words. */
    static final int MIN_LENGTH = 4;

    /** Values shorter than this are masked only as a whole word, so a short password does not cut words in two. */
    static final int WHOLE_WORD_BELOW = 8;

    /** Values of letters only shorter than this are taken for a plain word ("Failing", "revision"), not a secret. */
    static final int PLAIN_WORD_BELOW = 12;

    /** Longer values are not kept (no secret the factory stores is this long), so a scan stays short. */
    static final int MAX_LENGTH = 1024;

    /** The most values used at run time kept (SVN passwords, Jenkins tokens); the oldest go first. Settings are not counted. */
    static final int MAX_KEPT = 256;

    /**
     * Keys that are no secret: what local model servers and examples take as a placeholder. Masking them would hide
     * ordinary words in messages.
     */
    static final Set<String> DUMMIES = Set.of("ollama", "empty", "lm-studio", "lmstudio", "test", "not-needed", "none", "dummy", "null",
            "changeme", "password", "secret", "token", "apikey", "api-key", "sk-no-key-required");

    /** The secrets of the settings, one slot per source (replaced when the setting changes, never dropped otherwise). */
    private static final java.util.Map<String, String> settings = new java.util.LinkedHashMap<>();

    /** Values used at run time, after the request was authorized (at most MAX_KEPT, oldest first). */
    private static final Set<String> used = new LinkedHashSet<>();

    /** The values and their encoded forms, longest first; rebuilt when a value is added. */
    private static volatile List<String> forms = List.of();

    private KnownSecrets() {
    }

    /**
     * The secret of a setting, under its source ("model.apiKey", "env:FACTORY_LDAP_MANAGER_PASSWORD"): it replaces the
     * value the source had (which is no longer masked); null or blank removes it. Kept for the life of the process.
     */
    public static void setting(String source, String value) {
        synchronized (used) {
            String secret = maskable(value);
            String before = secret == null ? settings.remove(source) : settings.put(source, secret);
            if (!java.util.Objects.equals(before, secret)) {
                rebuild();
            }
        }
    }

    /**
     * A secret the factory has just used for an authorized request (an SVN password sent to the server, a Jenkins token,
     * a key a test connection sends). Call it only after the request's permission checks: a value registered here is
     * masked everywhere.
     */
    public static void used(String value) {
        synchronized (used) {
            String secret = maskable(value);
            if (secret == null || settings.containsValue(secret) || !used.add(secret)) {
                return;
            }
            while (used.size() > MAX_KEPT) {
                used.remove(used.iterator().next());
            }
            rebuild();
        }
    }

    /** What would be masked, or null for a value that is no secret worth masking (see DUMMIES). */
    static String maskable(String value) {
        if (value == null) {
            return null;
        }
        String secret = value.strip();
        if (secret.length() < MIN_LENGTH || secret.length() > MAX_LENGTH || DUMMIES.contains(secret.toLowerCase(java.util.Locale.ROOT))) {
            return null;
        }
        // a short plain word ("Failing", "revision") would hide that word in every message
        if (secret.length() < PLAIN_WORD_BELOW && secret.chars().allMatch(Character::isLetter)) {
            return null;
        }
        return secret;
    }

    private static void rebuild() {
        Set<String> all = new LinkedHashSet<>();
        List<String> values = new ArrayList<>(settings.values());
        values.addAll(used);
        for (String v : values) {
            all.add(v);
            // as a server can echo it: in a URL (user:p%40ss@host), in JSON ("p\"ss"), in XML or HTML (p&amp;ss)
            all.add(URLEncoder.encode(v, StandardCharsets.UTF_8));
            all.add(v.replace("\\", "\\\\").replace("\"", "\\\""));
            all.add(v.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;").replace("'", "&#39;"));
            all.add(v.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;").replace("'", "&apos;"));
        }
        List<String> sorted = new ArrayList<>(all);
        sorted.sort(Comparator.comparingInt(String::length).reversed());
        forms = List.copyOf(sorted);
    }

    /** Forgets every value (for tests: the values are kept for the life of the process otherwise). */
    public static void clear() {
        synchronized (used) {
            settings.clear();
            used.clear();
            forms = List.of();
        }
    }

    /**
     * The text with every known secret value replaced by "[hidden]". Each value is looked for with indexOf, one pass
     * per value: at most MAX_KEPT values of at most MAX_LENGTH characters.
     */
    public static String masked(String text) {
        List<String> current = forms;
        if (text == null || current.isEmpty() || text.length() < MIN_LENGTH) {
            return text;
        }
        String out = text;
        for (String secret : current) {
            out = maskedValue(out, secret);
        }
        return out;
    }

    private static String maskedValue(String text, String secret) {
        int at = text.indexOf(secret);
        if (at < 0) {
            return text;
        }
        boolean wholeWord = secret.length() < WHOLE_WORD_BELOW;
        StringBuilder out = new StringBuilder(text.length());
        int from = 0;
        while (at >= 0) {
            int end = at + secret.length();
            if (!wholeWord || (!wordChar(text, at - 1) && !wordChar(text, end))) {
                out.append(text, from, at).append("[hidden]");
                from = end;
                at = text.indexOf(secret, end);
            } else {
                at = text.indexOf(secret, at + 1);
            }
        }
        return out.append(text, from, text.length()).toString();
    }

    private static boolean wordChar(String text, int i) {
        return i >= 0 && i < text.length() && Character.isLetterOrDigit(text.charAt(i));
    }
}
