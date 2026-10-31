package com.obdx.factory.pack;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Checks of generated Java that a pattern rule cannot express, for the mistakes a bank's review rejects: a JAX-RS
 * method whose @Path has {name} without a matching @PathParam, or JAX-RS annotations without their import (both fail
 * the deployment), and, as warnings, exception text sent to the client, log messages built with +, and the customer
 * taken from the request rather than the session. Like the pack rules, a modified file is judged on its added lines.
 */
final class JavaChecks {

    static final String PATH_PARAM = "java-path-param";
    static final String JAXRS_IMPORT = "java-jaxrs-import";
    static final String EXCEPTION_TEXT = "java-exception-text";
    static final String LOG_CONCAT = "java-log-concat";
    static final String USER_FROM_REQUEST = "java-user-from-request";

    private static final Pattern PATH = Pattern.compile("@(?:(?:javax|jakarta)\\.ws\\.rs\\.)?Path\\s*\\(\\s*(?:value\\s*=\\s*)?\"([^\"]*)\"\\s*\\)");
    private static final Pattern TEMPLATE = Pattern.compile("\\{\\s*(\\w+)\\s*(?::[^}]*)?}");
    private static final Pattern PATH_PARAM_NAME = Pattern.compile("@(?:(?:javax|jakarta)\\.ws\\.rs\\.)?PathParam\\s*\\(\\s*(?:value\\s*=\\s*)?\"([^\"]+)\"");
    private static final Pattern ANNOTATION = Pattern.compile("@[\\w.]+(?:\\s*\\((?:[^()\"]|\"(?:[^\"\\\\]|\\\\.)*\"|\\([^()]*\\))*\\))?");
    private static final Pattern METHOD_NAME = Pattern.compile("(\\w+)\\s*\\(");
    private static final Pattern IMPORT = Pattern.compile("(?m)^\\s*import\\s+([\\w.]+(?:\\.\\*)?)\\s*;");
    /** The JAX-RS annotations a resource uses, and the package each is in. */
    private static final Map<String, String> JAXRS = Map.of("Context", "ws.rs.core", "PathParam", "ws.rs", "QueryParam", "ws.rs",
            "GET", "ws.rs", "POST", "ws.rs", "PUT", "ws.rs", "DELETE", "ws.rs", "Produces", "ws.rs", "Consumes", "ws.rs", "Path", "ws.rs");
    private static final Pattern ENTITY_MESSAGE = Pattern.compile("\\.entity\\s*\\([^;]*?\\bget(?:Localized)?Message\\s*\\(\\s*\\)");
    private static final Pattern RETURNED_MESSAGE = Pattern.compile("\\breturn\\b[^;]*\"[^;]*\\bget(?:Localized)?Message\\s*\\(\\s*\\)");
    private static final Pattern LOG_CALL = Pattern.compile("\\b(?:log|logger|LOG|LOGGER|_logger|\\w+Logger)\\s*\\.\\s*"
            + "(?:trace|debug|info|warn|warning|error|severe|fine|finer|finest|config|log)\\s*\\(([^;]*)\\)\\s*;");
    private static final Pattern CONCAT = Pattern.compile("\"\\s*\\+|\\+\\s*\"");
    private static final Pattern USER_FROM_BODY = Pattern.compile("\\b(?:request|req|dto|body|payload|input|\\w+(?:Request|RequestDTO|DTO|Dto))"
            + "\\s*\\.\\s*get(?:CustomerId|UserId|PartyId)\\s*\\(\\s*\\)"
            + "|@(?:QueryParam|FormParam|HeaderParam|PathParam)\\s*\\(\\s*\"(?:customerId|userId|partyId)\"");

    private JavaChecks() {
    }

    /** The findings in a Java file; original is the file before the change (null for a new file). */
    static List<LocalChecks.Finding> findings(String path, String original, String content) {
        String text = SourceText.withoutComments(path, content);
        List<LocalChecks.Finding> found = new ArrayList<>();
        boolean resource = PATH.matcher(text).find();
        pathParams(text, found);
        imports(text, found);
        warn(text, ENTITY_MESSAGE, EXCEPTION_TEXT, "Sends the exception's text to the client. Return an error code or a message "
                + "from the resource bundle, and log the exception.", found);
        if (resource) {
            warn(text, RETURNED_MESSAGE, EXCEPTION_TEXT, "Returns the exception's text to the client. Return an error code or a "
                    + "message from the resource bundle, and log the exception.", found);
            warn(text, USER_FROM_BODY, USER_FROM_REQUEST, "Takes the customer or user from the request. Take it from the session "
                    + "(the SecurityContext or the session context the codebase uses), so no one can act for another customer.", found);
        }
        Matcher log = LOG_CALL.matcher(text);
        while (log.find()) {
            if (CONCAT.matcher(log.group(1)).find()) {
                found.add(new LocalChecks.Finding(LOG_CONCAT, PackRule.Severity.WARNING, lineOf(text, log.start()),
                        "Builds the log message with +. Use placeholders (\"Saved {}\" with SLF4J, \"Saved {0}\" with "
                                + "java.util.logging), and do not log personal data."));
            }
        }
        return onAddedLines(found, original, content);
    }

    /** Every {name} in a method's @Path needs a parameter with @PathParam("name"). */
    private static void pathParams(String text, List<LocalChecks.Finding> found) {
        Matcher path = PATH.matcher(text);
        while (path.find()) {
            Set<String> names = new LinkedHashSet<>();
            Matcher template = TEMPLATE.matcher(path.group(1));
            while (template.find()) {
                names.add(template.group(1));
            }
            if (names.isEmpty()) {
                continue;
            }
            String header = declaration(text, path.end());
            String withoutAnnotations = ANNOTATION.matcher(header).replaceAll(" ");
            if (withoutAnnotations.matches("(?s).*\\b(class|interface|enum)\\b.*")) {
                // A class's @Path: its names may be injected into fields
                continue;
            }
            Matcher params = PATH_PARAM_NAME.matcher(header);
            while (params.find()) {
                names.remove(params.group(1));
            }
            if (!names.isEmpty()) {
                Matcher method = METHOD_NAME.matcher(withoutAnnotations);
                String name = method.find() ? method.group(1) + ": " : "";
                found.add(new LocalChecks.Finding(PATH_PARAM, PackRule.Severity.ERROR, lineOf(text, path.start()), name + "@Path has "
                        + String.join(", ", names.stream().map(n -> "{" + n + "}").toList()) + " but no parameter has "
                        + String.join(", ", names.stream().map(n -> "@PathParam(\"" + n + "\")").toList())
                        + ". Add the parameter, or the resource will not deploy."));
            }
        }
    }

    /** What follows an annotation up to the body or the end of the declaration, skipping strings and parentheses. */
    private static String declaration(String text, int from) {
        int depth = 0;
        for (int i = from; i < text.length(); i++) {
            char c = text.charAt(i);
            if (c == '"') {
                for (i++; i < text.length() && text.charAt(i) != '"'; i++) {
                    if (text.charAt(i) == '\\') {
                        i++;
                    }
                }
            } else if (c == '(') {
                depth++;
            } else if (c == ')') {
                depth--;
            } else if ((c == '{' || c == ';') && depth <= 0) {
                return text.substring(from, i);
            }
        }
        return text.substring(from);
    }

    /** JAX-RS annotations need their import (a wildcard of javax.ws.rs does not cover javax.ws.rs.core.Context). */
    private static void imports(String text, List<LocalChecks.Finding> found) {
        Set<String> imports = new LinkedHashSet<>();
        Matcher m = IMPORT.matcher(text);
        while (m.find()) {
            imports.add(m.group(1));
        }
        // A wildcard of the bank's own packages may supply an annotation of the same name: it cannot be told here
        if (imports.stream().anyMatch(i -> i.endsWith(".*") && !i.startsWith("java.") && !i.startsWith("javax.") && !i.startsWith("jakarta."))) {
            return;
        }
        String root = imports.stream().anyMatch(i -> i.startsWith("jakarta.ws.rs")) ? "jakarta" : "javax";
        for (Map.Entry<String, String> annotation : JAXRS.entrySet()) {
            String name = annotation.getKey();
            Matcher use = Pattern.compile("(?<![\\w.])@" + name + "\\b").matcher(text);
            if (!use.find()) {
                continue;
            }
            boolean imported = imports.stream().anyMatch(i -> i.endsWith("." + name)
                    || i.equals("javax." + annotation.getValue() + ".*") || i.equals("jakarta." + annotation.getValue() + ".*"));
            if (!imported) {
                found.add(new LocalChecks.Finding(JAXRS_IMPORT, PackRule.Severity.ERROR, lineOf(text, use.start()), "Uses @" + name
                        + " without importing it. Add import " + root + "." + annotation.getValue() + "." + name + ";"));
            }
        }
    }

    private static void warn(String text, Pattern pattern, String rule, String message, List<LocalChecks.Finding> found) {
        Matcher m = pattern.matcher(text);
        int count = 0;
        while (m.find() && count++ < 3) {
            found.add(new LocalChecks.Finding(rule, PackRule.Severity.WARNING, lineOf(text, m.start()), message));
        }
    }

    /** In a modified file, findings on lines that were there before the change are the bank's own code: left out. */
    private static List<LocalChecks.Finding> onAddedLines(List<LocalChecks.Finding> found, String original, String content) {
        if (original == null) {
            return found;
        }
        Set<String> before = new java.util.HashSet<>();
        for (String line : original.split("\n", -1)) {
            before.add(line.strip());
        }
        String[] lines = content.split("\n", -1);
        return found.stream().filter(f -> f.line() <= 0 || f.line() > lines.length || !before.contains(lines[f.line() - 1].strip())).toList();
    }

    private static int lineOf(String text, int offset) {
        int line = 1;
        for (int i = 0; i < offset; i++) {
            if (text.charAt(i) == '\n') {
                line++;
            }
        }
        return line;
    }
}
