package com.obdx.factory.change;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Compares a JET view (component.html) with its view model (component.js), which a check of one file cannot: the
 * names the view binds that the view model never defines, and bindings that are not valid expressions
 * ("nls.fund-transfer.title"). A model writing the two files separately often names a property differently in each.
 * The findings are warnings: a view model can also take names from elsewhere.
 */
final class ViewBindings {

    private static final Pattern BINDING = Pattern.compile("(?:\\[\\[|\\{\\{)(.+?)(?:]]|}})", Pattern.DOTALL);
    private static final Pattern ROOT = Pattern.compile("^[\\s!(]*([A-Za-z_$][\\w$]*)");
    private static final Pattern HYPHENATED = Pattern.compile("\\.[A-Za-z_]\\w*-[\\w-]+");
    private static final Pattern ALIAS = Pattern.compile("\\bas\\s*=\\s*\"([A-Za-z_]\\w*)\"");
    private static final Pattern DEFINED = Pattern.compile("(?:\\b(?:self|this|vm|_this)\\.([A-Za-z_$][\\w$]*)\\s*=(?!=)"
            + "|^\\s*([A-Za-z_$][\\w$]*)\\s*:|\\bfunction\\s+([A-Za-z_$][\\w$]*))", Pattern.MULTILINE);
    /** View models that copy names in from elsewhere (OBDX's rootModel, params) cannot be checked by name. */
    private static final Pattern COPIES_NAMES = Pattern.compile("\\b(?:ko\\.utils\\.extend|Object\\.assign|\\$\\.extend|extend)\\s*\\(");
    private static final Set<String> KNOWN = Set.of("true", "false", "null", "undefined", "oj", "Math", "JSON", "Number", "String",
            "Date", "window", "document", "$data", "$parent", "$parents", "$root", "$current", "$context", "$index", "$properties",
            "$props", "$element", "$component", "$event", "$item", "$value", "typeof", "new");

    private ViewBindings() {
    }

    /** What is wrong between the view and its view model; empty when they agree or cannot be compared. */
    static List<String> problems(String view, String viewModel) {
        if (view == null) {
            return List.of();
        }
        Set<String> aliases = new LinkedHashSet<>();
        Matcher alias = ALIAS.matcher(view);
        while (alias.find()) {
            aliases.add(alias.group(1));
        }
        Set<String> invalid = new LinkedHashSet<>();
        Set<String> bound = new LinkedHashSet<>();
        Matcher binding = BINDING.matcher(view);
        while (binding.find()) {
            String expression = binding.group(1).strip();
            String unquoted = expression.replaceAll("'[^']*'|\"[^\"]*\"", "''");
            Matcher hyphen = HYPHENATED.matcher(unquoted);
            if (hyphen.find()) {
                invalid.add(expression.length() > 60 ? expression.substring(0, 60) + "..." : expression);
            }
            Matcher root = ROOT.matcher(unquoted);
            if (root.find() && !KNOWN.contains(root.group(1)) && !root.group(1).startsWith("$") && !aliases.contains(root.group(1))) {
                bound.add(root.group(1));
            }
        }
        List<String> problems = new java.util.ArrayList<>();
        if (!invalid.isEmpty()) {
            problems.add("Bindings that are not valid expressions (a name with a hyphen): " + String.join(", ", invalid)
                    + ". Use bracket access, for example nls['fund-transfer'], or a name without hyphens.");
        }
        if (viewModel != null && !COPIES_NAMES.matcher(viewModel).find()) {
            Set<String> defined = new LinkedHashSet<>();
            Matcher definition = DEFINED.matcher(viewModel);
            while (definition.find()) {
                for (int group = 1; group <= 3; group++) {
                    if (definition.group(group) != null) {
                        defined.add(definition.group(group));
                    }
                }
            }
            List<String> missing = bound.stream().filter(name -> !defined.contains(name)).toList();
            if (!missing.isEmpty()) {
                problems.add("The view binds names its view model does not define: " + String.join(", ", missing)
                        + ". Use the view model's names, or add them to it.");
            }
        }
        return problems;
    }
}
