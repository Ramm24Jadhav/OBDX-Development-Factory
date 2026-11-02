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

    /** Longer values are not kept (no secret the factory stores is this long), so a scan stays short. */
    static final int MAX_LENGTH = 1024;

    /** The most values kept; the oldest go first (a changed password keeps the old one masked for a while). */
    static final int MAX_KEPT = 256;

    private static final Set<String> values = new LinkedHashSet<>();

    /** The values and their encoded forms, longest first; rebuilt when a value is added. */
    private static volatile List<String> forms = List.of();

    private KnownSecrets() {
    }

    /** Masks this value in messages and in the log from now on. Null, blank and very short or long values are ignored. */
    public static void remember(String value) {
        if (value == null) {
            return;
        }
        String secret = value.strip();
        if (secret.length() < MIN_LENGTH || secret.length() > MAX_LENGTH || secret.equals("not-needed")) {
            return;
        }
        synchronized (values) {
            if (!values.add(secret)) {
                return;
            }
            while (values.size() > MAX_KEPT) {
                values.remove(values.iterator().next());
            }
            Set<String> all = new LinkedHashSet<>();
            for (String v : values) {
                all.add(v);
                // as a server can echo it: in a URL (user:p%40ss@host), in JSON ("p\"ss")
                all.add(URLEncoder.encode(v, StandardCharsets.UTF_8));
                all.add(v.replace("\\", "\\\\").replace("\"", "\\\""));
            }
            List<String> sorted = new ArrayList<>(all);
            sorted.sort(Comparator.comparingInt(String::length).reversed());
            forms = List.copyOf(sorted);
        }
    }

    /** Forgets every value (for tests: the values are kept for the life of the process otherwise). */
    public static void clear() {
        synchronized (values) {
            values.clear();
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
