package com.obdx.factory.issue;

import java.util.List;

/**
 * What was found in an issue's logs, screenshots and the bank's code, each item with an id the diagnosis refers to.
 *
 * @param signature exception classes, error codes and the top code frame, lower case, space separated; used to find
 *                  similar past issues
 */
public record Evidence(List<Item> items, String signature) {

    /**
     * @param id     E1, E2... for log and screenshot evidence, C1, C2... for code
     * @param kind   EXCEPTION, CAUSE, FRAME, HTTP_STATUS, ERROR_CODE, URL, KEY, CORRELATION_ID, ERROR_LINE, SCREENSHOT, CODE
     * @param source "pasted log", a file name, or a path in the code
     * @param line   1-based line in the source; null when not known
     */
    public record Item(String id, String kind, String source, Integer line, String text) {
    }

    public static Evidence empty() {
        return new Evidence(List.of(), "");
    }
}
