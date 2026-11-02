package com.obdx.factory.common;

/** Why something failed, as a short line for a status message that people read (the full error goes to the log). */
public final class Messages {

    /** The longest reason shown: a model server's error can quote the whole request. */
    static final int MAX = 300;

    private Messages() {
    }

    /**
     * The exception's message on one line, without control characters, at most 300 characters; for a stack overflow
     * (a check that could not follow the file) a sentence that says so.
     */
    public static String reason(Throwable e) {
        if (e instanceof StackOverflowError) {
            return "the factory's checks could not follow this content (it is too deeply nested or too long). Check it by hand";
        }
        String message = e == null || e.getMessage() == null ? (e == null ? "unknown error" : e.getClass().getSimpleName()) : e.getMessage();
        String line = redacted(message.length() > MAX_READ ? message.substring(0, MAX_READ) : message)
                .replaceAll("[\\p{Cntrl}&&[^\\t]]+", " ").replaceAll("\\s{2,}", " ").strip();
        return line.length() <= MAX ? line : line.substring(0, MAX - 3) + "...";
    }

    /** The most of a message read for its reason (it is cut to MAX after). */
    static final int MAX_READ = 4096;

    /**
     * "Bearer abc", an API key (sk-..., gsk_..., hf_..., AIza...), "api_key=abc", "?key=abc", "Authorization: abc",
     * "password": "abc", and the user and password in an address (https://user:pass@host). Group 1 or 2 is what stays
     * before the hidden part.
     */
    private static final java.util.regex.Pattern SECRET = java.util.regex.Pattern.compile(
            "(?i)(\\bbearer\\s++)[^\\s\"',;)]++"
                    + "|\\b(?:sk|pk|rk|xai)-[A-Za-z0-9_-]{8,}+|\\b(?:gsk|hf|ghp|gho|glpat|xoxb|xoxp)_[A-Za-z0-9_-]{8,}+|\\bAIza[A-Za-z0-9_-]{20,}+"
                    + "|((?:api[-_]?key|access[-_]?token|auth[-_]?token|client[-_]?secret|subscription[-_]?key|secret|password|passwd"
                    + "|authorization)\"?\\s{0,3}+[=:]\\s{0,3}+\"?(?:bearer\\s++)?|[?&](?:key|token|sig|signature|code)=)[^\\s\"',;&)]++"
                    + "|(\\b[a-z][a-z0-9+.-]{0,15}+://)[^\\s/?#]{1,200}@");

    /**
     * The text with what looks like a secret replaced by "[hidden]": a bearer token, an API key (sk-..., gsk_...), a
     * key, token or password given as name=value or "name": "value", and every secret value the factory holds
     * ({@link KnownSecrets}: an SVN password or an API key without a known prefix, echoed as it is). A model server's
     * error can echo the request's headers, and messages are shown to every member of a workspace.
     */
    public static String redacted(String text) {
        if (text == null) {
            return null;
        }
        java.util.regex.Matcher m = SECRET.matcher(KnownSecrets.masked(text));
        StringBuilder out = new StringBuilder();
        while (m.find()) {
            String keep = m.group(1) != null ? m.group(1) : m.group(2) != null ? m.group(2) : "";
            // an address keeps its scheme and host: https://[hidden]@host
            String hidden = m.group(3) != null ? m.group(3) + "[hidden]@" : keep + "[hidden]";
            m.appendReplacement(out, java.util.regex.Matcher.quoteReplacement(hidden));
        }
        m.appendTail(out);
        return out.toString();
    }
}
