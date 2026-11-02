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

    /** "Bearer abc", "sk-abc...", "api_key=abc", "Authorization: abc", "password": "abc" */
    private static final java.util.regex.Pattern SECRET = java.util.regex.Pattern.compile(
            "(?i)(\\bbearer\\s++)[^\\s\"',;)]++"
                    + "|\\b(?:sk|pk|rk|gsk|xai)-[A-Za-z0-9_-]{8,}+"
                    + "|((?:api[-_]?key|access[-_]?token|auth[-_]?token|client[-_]?secret|secret|password|passwd|authorization)\"?\\s{0,3}+[=:]"
                    + "\\s{0,3}+\"?(?:bearer\\s++)?)[^\\s\"',;&)]++");

    /**
     * The text with what looks like a secret replaced by "[hidden]": a bearer token, an API key (sk-..., gsk_...), a
     * key, token or password given as name=value or "name": "value". A model server's error can echo the request's
     * headers, and messages are shown to every member of a workspace.
     */
    public static String redacted(String text) {
        if (text == null) {
            return null;
        }
        java.util.regex.Matcher m = SECRET.matcher(text);
        StringBuilder out = new StringBuilder();
        while (m.find()) {
            String keep = m.group(1) != null ? m.group(1) : m.group(2) != null ? m.group(2) : "";
            m.appendReplacement(out, java.util.regex.Matcher.quoteReplacement(keep + "[hidden]"));
        }
        m.appendTail(out);
        return out.toString();
    }
}
