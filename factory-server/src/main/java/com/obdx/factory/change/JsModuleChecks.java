package com.obdx.factory.change;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Predicate;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Checks of a JET view model that its parse check cannot see, all warnings: a method called while the constructor
 * runs before the line that sets it (this.load() before this.load = function...), a property used but set nowhere
 * in the module (this.amount() with no this.amount =), and a module in the define list that neither the code base nor
 * its RequireJS configuration knows. They are certain, so they go to the model when the file is written again.
 */
final class JsModuleChecks {

    static final String CALLED_BEFORE_SET = "Calls methods before the line that sets them";
    static final String NEVER_SET = "Uses view model names that are never set";
    static final String UNKNOWN_MODULES = "Loads modules the code base does not have";

    /** this.amount() or self.load(...): a call of a view model name (a DOM element's this.value in a handler is no call) */
    private static final Pattern OWNER = Pattern.compile("\\b(?:this|self)\\s*\\.\\s*([A-Za-z_$][\\w$]*)\\s*\\(");
    private static final Pattern AT_OWNER = Pattern.compile("(?:this|self)\\s*\\.\\s*([A-Za-z_$][\\w$]*)\\s*(\\(|=(?!=))");
    private static final Pattern ASSIGNED = Pattern.compile("\\b(?:this|self|vm|_this)\\s*\\.\\s*([A-Za-z_$][\\w$]*)\\s*=(?!=)"
            + "|\\.prototype\\.([A-Za-z_$][\\w$]*)\\s*=(?!=)"
            + "|^\\s*(?:(?:static|async|get|set)\\s+)*([A-Za-z_$][\\w$]*)\\s*\\([^()]*\\)\\s*\\{"
            + "|^\\s*(?:static\\s+)?([A-Za-z_$][\\w$]*)\\s*=(?![=>])"
            + "|^\\s*([A-Za-z_$][\\w$]*)\\s*:", Pattern.MULTILINE);
    /** A view model that copies names in from elsewhere cannot be checked by name. */
    private static final Pattern COPIES_NAMES = Pattern.compile("\\b(?:ko\\.utils\\.extend|Object\\.assign|\\$\\.extend|extend)\\s*\\("
            + "|\\.\\.\\.\\s*(?:params|rootParams|rootModel|this|self)\\b");
    private static final Pattern FUNCTION = Pattern.compile("\\bfunction\\s*[\\w$]*\\s*\\([^()]*\\)\\s*\\{");
    private static final Pattern DEFINE = Pattern.compile("\\bdefine\\s*\\(\\s*\\[([^\\]]*)]");
    private static final Pattern MODULE = Pattern.compile("['\"]([^'\"]+)['\"]");
    /** Names every object or JET view model has without setting them. */
    private static final Set<String> BUILT_IN = Set.of("constructor", "hasOwnProperty", "toString", "valueOf", "isPrototypeOf");

    private JsModuleChecks() {
    }

    /**
     * The findings for a view model.
     *
     * @param moduleKnown whether the code base knows a module (another file loads it, or a file has its name); null
     *                    when that cannot be told (no JavaScript is indexed), and modules are not checked
     */
    static List<String> problems(String content, Predicate<String> moduleKnown) {
        if (content == null || JavaScriptCheck.structure(content) != null) {
            return List.of();
        }
        String code = JavaScriptCheck.codeOnly(content);
        List<String> problems = new ArrayList<>();
        Set<String> assigned = assigned(code);
        Set<String> early = calledBeforeSet(code);
        if (!early.isEmpty()) {
            problems.add(CALLED_BEFORE_SET + ": " + String.join(", ", early.stream().map(n -> "this." + n + "()").toList())
                    + ". The constructor runs from top to bottom: set them before calling them, or call them at the end.");
        }
        if (!COPIES_NAMES.matcher(code).find()) {
            Set<String> unset = new LinkedHashSet<>();
            Matcher use = OWNER.matcher(code);
            while (use.find()) {
                String name = use.group(1);
                if (!assigned.contains(name) && !BUILT_IN.contains(name)) {
                    unset.add(name);
                }
            }
            if (!unset.isEmpty()) {
                problems.add(NEVER_SET + ": " + String.join(", ", unset.stream().map(n -> "this." + n).toList())
                        + ". Set each one in the view model (for example this.amount = ko.observable()), or use the name it has.");
            }
        }
        if (moduleKnown != null) {
            Matcher define = DEFINE.matcher(SourceScanText.withoutComments(content));
            if (define.find()) {
                List<String> unknown = new ArrayList<>();
                Matcher m = MODULE.matcher(define.group(1));
                while (m.find()) {
                    String module = m.group(1);
                    if (!module.startsWith(".") && !module.startsWith("/") && !module.contains("!") && !jetLibrary(module)
                            && !moduleKnown.test(module)) {
                        unknown.add(module);
                    }
                }
                if (!unknown.isEmpty()) {
                    problems.add(UNKNOWN_MODULES + ": " + String.join(", ", unknown) + ". No other file loads them and the RequireJS "
                            + "configuration does not name them: use the modules the code base uses, or add the library.");
                }
            }
        }
        return problems;
    }

    /** The libraries every Oracle JET application has, which need not appear elsewhere in the bank's code. */
    private static final Set<String> JET_LIBRARIES = Set.of("knockout", "jquery", "jqueryui-amd", "hammerjs", "ojdnd", "promise", "signals",
            "require", "exports", "module", "text", "css", "ojL10n", "preact", "touchr", "customElements", "ojtranslations");

    static boolean jetLibrary(String module) {
        return module.startsWith("ojs/") || module.startsWith("jqueryui-amd/") || module.startsWith("preact/") || JET_LIBRARIES.contains(module);
    }

    /** The names the module sets: this.x =, Name.prototype.x =, class methods and fields, object keys. */
    static Set<String> assigned(String code) {
        Set<String> names = new LinkedHashSet<>();
        Matcher m = ASSIGNED.matcher(code);
        while (m.find()) {
            for (int g = 1; g <= m.groupCount(); g++) {
                if (m.group(g) != null) {
                    names.add(m.group(g));
                }
            }
        }
        return names;
    }

    /**
     * Methods a function body calls in its own top-level statements (not inside a nested function or block) before the
     * top-level statement that sets them, and that nothing sets before (a prototype method, an earlier assignment).
     */
    static Set<String> calledBeforeSet(String code) {
        Set<String> early = new LinkedHashSet<>();
        Set<String> prototype = new LinkedHashSet<>();
        Matcher p = Pattern.compile("\\.prototype\\.([A-Za-z_$][\\w$]*)\\s*=(?!=)").matcher(code);
        while (p.find()) {
            prototype.add(p.group(1));
        }
        Matcher f = FUNCTION.matcher(code);
        while (f.find()) {
            int start = f.end();
            int end = closing(code, start - 1);
            if (end < 0) {
                continue;
            }
            // Calls and assignments at the body's own level, in order
            Map<String, Integer> firstCall = new LinkedHashMap<>();
            Map<String, Integer> firstSet = new LinkedHashMap<>();
            int depth = 0;
            for (int i = start; i < end; i++) {
                char c = code.charAt(i);
                if (c == '{') {
                    depth++;
                } else if (c == '}') {
                    depth--;
                } else if (depth == 0 && (code.startsWith("this", i) || code.startsWith("self", i))
                        && (i == 0 || !Character.isJavaIdentifierPart(code.charAt(i - 1)))) {
                    Matcher m = AT_OWNER.matcher(code).region(i, Math.min(end, i + 200));
                    if (m.lookingAt()) {
                        Map<String, Integer> into = m.group(2).equals("(") ? firstCall : firstSet;
                        into.putIfAbsent(m.group(1), i);
                    }
                }
            }
            firstCall.forEach((name, at) -> {
                Integer set = firstSet.get(name);
                if (set != null && set > at && !prototype.contains(name)) {
                    early.add(name);
                }
            });
        }
        return early;
    }

    /** The index of the brace that closes the one at open, or -1. */
    private static int closing(String code, int open) {
        int depth = 0;
        for (int i = open; i < code.length(); i++) {
            char c = code.charAt(i);
            if (c == '{') {
                depth++;
            } else if (c == '}' && --depth == 0) {
                return i;
            }
        }
        return -1;
    }

    /** Comments blanked, strings kept (the define list's module names are strings). */
    private static final class SourceScanText {

        static String withoutComments(String content) {
            return com.obdx.factory.pack.SourceScan.blank(content,
                    com.obdx.factory.pack.SourceScan.scan(content, com.obdx.factory.pack.SourceScan.Syntax.CODE).comments());
        }
    }
}
