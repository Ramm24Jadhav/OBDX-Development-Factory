package com.obdx.factory.issue;

import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Compares error signatures without a model: whether new logs after a fix still show the original error, and whether
 * two issues report the same error.
 */
public final class Signatures {

    /** Kinds of evidence that are errors (not context such as URLs, keys or frames). */
    static final Set<String> ERRORS = Set.of("EXCEPTION", "CAUSE", "ERROR_CODE", "HTTP_STATUS", "ERROR_LINE");

    public record Comparison(String result, String summary) {
    }

    private Signatures() {
    }

    static Set<String> tokens(String signature) {
        return signature == null || signature.isBlank() ? Set.of() : new LinkedHashSet<>(Arrays.asList(signature.split(" ")));
    }

    /** An error code token ("digx_py_0131", "ora-12541"): no dots, unlike exception classes and frames. */
    static boolean errorCode(String token) {
        return !token.contains(".");
    }

    /**
     * What new logs and screenshots after a fix say about the original error.
     *
     * @param original the first report's evidence
     * @param latest   the new evidence (logs and screenshots only)
     */
    public static Comparison compare(Evidence original, Evidence latest) {
        Set<String> before = tokens(original.signature());
        if (before.isEmpty()) {
            return new Comparison("NOT_COMPARABLE", "The first report had no error the factory could recognise, so the new logs "
                    + "cannot be compared with it. Check them yourself.");
        }
        Set<String> after = tokens(latest.signature());
        List<String> still = before.stream().filter(after::contains).toList();
        List<Evidence.Item> errors = latest.items().stream().filter(i -> ERRORS.contains(i.kind())).toList();
        if (!still.isEmpty()) {
            return new Comparison("STILL_FAILING", "The original error is still there: " + String.join(", ", still) + ".");
        }
        if (!errors.isEmpty()) {
            return new Comparison("DIFFERENT_ERROR", "The original error is gone, but there are other errors: "
                    + errors.stream().limit(3).map(i -> shorten(i.text())).collect(Collectors.joining("; ")) + ".");
        }
        return new Comparison("ERROR_GONE", "None of the original errors (" + String.join(", ", before)
                + ") appear in the new logs, and they show no other errors.");
    }

    /** Two issues report the same error: two signature tokens in common, or the same error code. */
    public static boolean sameError(String a, String b) {
        Set<String> first = tokens(a);
        List<String> common = tokens(b).stream().filter(first::contains).toList();
        return common.size() >= 2 || common.stream().anyMatch(Signatures::errorCode);
    }

    private static String shorten(String text) {
        String one = text.replace('\n', ' ');
        return one.length() > 120 ? one.substring(0, 120) + "..." : one;
    }
}
