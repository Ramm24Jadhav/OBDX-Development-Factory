package com.obdx.factory.issue;

import java.util.List;
import java.util.UUID;

/**
 * What was found in an issue's logs, screenshots, the bank's code and the OBDX Library, each item with an id the
 * diagnosis refers to.
 *
 * @param signature exception classes, error codes and the top code frame, lower case, space separated; used to find
 *                  similar past issues and to compare logs after a fix
 */
public record Evidence(List<Item> items, String signature) {

    /**
     * @param id         E1, E2... for log and screenshot evidence, C1... for code, O1... for Oracle notes, M1... for
     *                   OBDX manuals and Library notes
     * @param kind       EXCEPTION, CAUSE, FRAME, HTTP_STATUS, ERROR_CODE, URL, KEY, CORRELATION_ID, ERROR_LINE,
     *                   SCREENSHOT, CODE, ORACLE_NOTE, MANUAL
     * @param source     "pasted log", a file name, a path in the code, or a Library document's title
     * @param line       1-based line in the source (a page for Library documents); null when not known
     * @param documentId the Library document (ORACLE_NOTE, MANUAL); null otherwise
     * @param reference  Oracle's reference of a note ("Doc ID 2345678.1"); null otherwise
     * @param version    the OBDX version and patchset a Library document is for; null otherwise
     */
    public record Item(String id, String kind, String source, Integer line, String text, UUID documentId, String reference,
                       String version) {

        public Item(String id, String kind, String source, Integer line, String text) {
            this(id, kind, source, line, text, null, null, null);
        }
    }

    public static Evidence empty() {
        return new Evidence(List.of(), "");
    }
}
