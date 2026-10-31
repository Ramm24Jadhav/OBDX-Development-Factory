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
        String line = message.replaceAll("[\\p{Cntrl}&&[^\\t]]+", " ").replaceAll("\\s{2,}", " ").strip();
        return line.length() <= MAX ? line : line.substring(0, MAX - 3) + "...";
    }
}
