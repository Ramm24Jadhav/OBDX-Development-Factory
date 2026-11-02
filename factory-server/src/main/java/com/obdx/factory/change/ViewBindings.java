package com.obdx.factory.change;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Compares a JET view (component.html) with its view model (component.js), which a check of one file cannot: the
 * names the view binds that the view model never defines, and bindings that are not valid expressions
 * ("nls.fund-transfer.title"). A model writing the two files separately often names a property differently in each.
 * The findings are warnings (a view model can also take names from elsewhere), except when the view model is written
 * in the same change as the view: the two were written for each other, so a name it lacks is an error.
 */
final class ViewBindings {

    private static final Pattern BINDING = Pattern.compile("(?:\\[\\[|\\{\\{)(.+?)(?:]]|}})", Pattern.DOTALL);
    private static final Pattern ROOT = Pattern.compile("^[\\s!(]*([A-Za-z_$][\\w$]*)");
    /** nls.fund-transfer.labels: a hyphen between letters in a property path; not items().length-1, a subtraction */
    private static final Pattern HYPHENATED = Pattern.compile("\\.[A-Za-z_$][\\w$]*(?<=[A-Za-z])-[A-Za-z]");
    private static final Pattern ALIAS = Pattern.compile("\\bas\\s*=\\s*\"([A-Za-z_]\\w*)\"");
    /**
     * The names a view model defines: self.x = / this.x = (also in a class constructor), object properties (x:),
     * functions, Name.prototype.x =, and a class's methods (x(event) {, get x() {) and fields (x = ko.observable()).
     */
    private static final Pattern DEFINED = Pattern.compile("(?:\\b(?:self|this|vm|_this)\\.([A-Za-z_$][\\w$]*)\\s*=(?!=)"
            + "|^\\s*([A-Za-z_$][\\w$]*)\\s*:|\\bfunction\\s+([A-Za-z_$][\\w$]*)"
            + "|\\.prototype\\.([A-Za-z_$][\\w$]*)\\s*=(?!=)"
            + "|^\\s*(?:(?:static|async|get|set)\\s+)*([A-Za-z_$][\\w$]*)\\s*\\([^()]*\\)\\s*\\{"
            + "|^\\s*(?:static\\s+)?([A-Za-z_$][\\w$]*)\\s*=(?![=>]))", Pattern.MULTILINE);
    /** View models that copy names in from elsewhere (OBDX's rootModel, params) cannot be checked by name. */
    private static final Pattern COPIES_NAMES = Pattern.compile("\\b(?:ko\\.utils\\.extend|Object\\.assign|\\$\\.extend|extend)\\s*\\(");
    private static final Set<String> KNOWN = Set.of("true", "false", "null", "undefined", "oj", "Math", "JSON", "Number", "String",
            "Date", "window", "document", "$data", "$parent", "$parents", "$root", "$current", "$context", "$index", "$properties",
            "$props", "$element", "$component", "$event", "$item", "$value", "typeof", "new");

    private ViewBindings() {
    }

    /** How the finding starts when the view model may take names from elsewhere: a warning. */
    static final String UNDEFINED = "The view binds names its view model does not define";
    /**
     * How the finding starts when the view model is written in the same change: the two were written for each other,
     * so a name the view model lacks is an error.
     */
    static final String UNDEFINED_IN_CHANGE = "The view binds names that the view model written in this change does not define";
    /** The most names an outline or a finding lists. */
    static final int MAX_NAMES = 80;

    /** What is wrong between the view and its view model; empty when they agree or cannot be compared. */
    static List<String> problems(String view, String viewModel) {
        return problems(view, viewModel, false);
    }

    /**
     * @param inChange the view model is written in the same change as the view: names it lacks are an error (see
     *                 {@link #UNDEFINED_IN_CHANGE}), with the names it has, so that a fix of the view can use them
     */
    static List<String> problems(String view, String viewModel, boolean inChange) {
        if (view == null) {
            return List.of();
        }
        Set<String> bound = bound(view);
        List<String> problems = new java.util.ArrayList<>();
        Set<String> invalid = invalid(view);
        if (!invalid.isEmpty()) {
            problems.add("Bindings that are not valid expressions (a name with a hyphen): " + String.join(", ", invalid)
                    + ". Use bracket access, for example nls['fund-transfer'], or a name without hyphens.");
        }
        if (viewModel != null && !COPIES_NAMES.matcher(viewModel).find()) {
            Set<String> defined = defined(viewModel);
            List<String> missing = bound.stream().filter(name -> !defined.contains(name)).limit(MAX_NAMES).toList();
            if (!missing.isEmpty() && inChange) {
                String names = outline(viewModel);
                problems.add(UNDEFINED_IN_CHANGE + ": " + String.join(", ", missing) + ". Use the view model's names"
                        + (names.isEmpty() ? "" : " (" + names + ")") + ", or add the missing ones to the view model.");
            } else if (!missing.isEmpty()) {
                problems.add(UNDEFINED + ": " + String.join(", ", missing) + ". Use the view model's names, or add them to it.");
            }
        }
        return problems;
    }

    /** The names a view binds at the root of its expressions (not its loop aliases, $current, nls.x's x). */
    static Set<String> bound(String view) {
        Set<String> bound = new LinkedHashSet<>();
        if (view == null) {
            return bound;
        }
        Set<String> aliases = new LinkedHashSet<>();
        Matcher alias = ALIAS.matcher(view);
        while (alias.find()) {
            aliases.add(alias.group(1));
        }
        Matcher binding = BINDING.matcher(view);
        while (binding.find()) {
            String unquoted = binding.group(1).strip().replaceAll("\\s+", " ").replaceAll("'[^']*'|\"[^\"]*\"", "''");
            Matcher root = ROOT.matcher(unquoted);
            if (root.find() && !KNOWN.contains(root.group(1)) && !root.group(1).startsWith("$") && !aliases.contains(root.group(1))) {
                bound.add(root.group(1));
            }
        }
        return bound;
    }

    private static Set<String> invalid(String view) {
        Set<String> invalid = new LinkedHashSet<>();
        Matcher binding = BINDING.matcher(view);
        while (binding.find()) {
            String expression = binding.group(1).strip().replaceAll("\\s+", " ");
            String unquoted = expression.replaceAll("'[^']*'|\"[^\"]*\"", "''");
            if (HYPHENATED.matcher(unquoted).find()) {
                invalid.add(expression.length() > 60 ? expression.substring(0, 60) + "..." : expression);
            }
        }
        return invalid;
    }

    private static Set<String> defined(String viewModel) {
        Set<String> defined = new LinkedHashSet<>();
        Matcher definition = DEFINED.matcher(viewModel);
        while (definition.find()) {
            for (int group = 1; group <= definition.groupCount(); group++) {
                if (definition.group(group) != null) {
                    defined.add(definition.group(group));
                }
            }
        }
        return defined;
    }

    /**
     * self.x = ko.observable(...): a public name of a view model and the start of its value (at most 80 characters of
     * one line, so the scan stays linear).
     */
    private static final Pattern PUBLIC = Pattern.compile("\\b(?:self|this|vm|_this)\\.([A-Za-z_$][\\w$]*+)\\s*+=(?!=)\\s*+([^\\n;]{0,80})"
            + "|\\.prototype\\.([A-Za-z_$][\\w$]*+)\\s*+=(?!=)\\s*+([^\\n;]{0,80})");
    private static final Pattern ARROW = Pattern.compile("^(?:async\\s++)?(?:\\([^()]{0,200}\\)|[A-Za-z_$][\\w$]*+)\\s*+=>");
    private static final Set<String> NOT_NAMES = Set.of("if", "for", "while", "switch", "catch", "function", "return", "constructor",
            "define", "require", "else", "do", "try");

    /**
     * The public names of a view model for a prompt or a finding, by kind ("Observables: amount, payees; Functions:
     * sendTransfer; Data providers: accountsDataProvider"): its self./this. assignments and prototype methods, or, for a
     * class, every name it defines. Empty when it has none.
     */
    static String outline(String viewModel) {
        if (viewModel == null) {
            return "";
        }
        Map<String, Set<String>> kinds = new java.util.LinkedHashMap<>();
        for (String kind : List.of("Observables", "Computed", "Functions", "Data providers", "Other values")) {
            kinds.put(kind, new LinkedHashSet<>());
        }
        Set<String> seen = new LinkedHashSet<>();
        Matcher m = PUBLIC.matcher(viewModel);
        while (m.find() && seen.size() < MAX_NAMES) {
            String name = m.group(1) != null ? m.group(1) : m.group(3);
            String value = (m.group(1) != null ? m.group(2) : m.group(4)).strip();
            if (!seen.add(name)) {
                continue;
            }
            kinds.get(kind(value)).add(name);
        }
        if (seen.isEmpty()) {
            // A class's methods and fields
            defined(viewModel).stream().filter(n -> !NOT_NAMES.contains(n)).limit(MAX_NAMES).forEach(kinds.get("Other values")::add);
        }
        String outline = kinds.entrySet().stream().filter(e -> !e.getValue().isEmpty())
                .map(e -> e.getKey() + ": " + String.join(", ", e.getValue())).collect(java.util.stream.Collectors.joining("; "));
        return outline + (!outline.isEmpty() && COPIES_NAMES.matcher(viewModel).find() ? "; it also copies in names from elsewhere" : "");
    }

    private static String kind(String value) {
        if (value.startsWith("ko.observable")) {
            return "Observables";
        }
        if (value.startsWith("ko.computed") || value.startsWith("ko.pureComputed")) {
            return "Computed";
        }
        if (value.contains("DataProvider")) {
            return "Data providers";
        }
        if (value.startsWith("function") || value.startsWith("async function") || ARROW.matcher(value).find()) {
            return "Functions";
        }
        return "Other values";
    }
}
