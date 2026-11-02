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
 * Checks of a JET view model that its parse check cannot see. Warnings: a method called while the constructor runs
 * before the line that sets it (this.load() before this.load = function...), a property used but set nowhere in the
 * module (this.amount() with no this.amount =), and a module in the define list that neither the code base nor its
 * RequireJS configuration knows; they go to the model when the file is written again. Errors (see defineProblems): a
 * define list bound to the wrong parameters, a module of the code base no parameter receives, and a resource bundle
 * used as something it is not.
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

    static final String WRONG_BINDING = "Binds define modules to the wrong parameters";
    static final String NOT_RECEIVED = "Loads modules that no parameter receives";
    static final String BUNDLE_GET = "Calls .get on a resource bundle";
    static final String BUNDLE_KEYS = "Uses resource bundle keys that the bundle does not have";
    /** The findings above that are certain errors: the module does not work as written. */
    static final List<String> ERRORS = List.of(WRONG_BINDING, NOT_RECEIVED, BUNDLE_GET, BUNDLE_KEYS);

    /** The largest view model the define checks read (larger ones are not view models a person wrote), and its longest line. */
    static final int MAX_DEFINE_TEXT = 200_000;
    static final int MAX_DEFINE_LINE = 4_000;
    /** The most parameters and modules of a define list that are compared. */
    static final int MAX_PARAMETERS = 64;

    /** The module list and the parameters of a define call; a parameter that is no plain name (destructured) is null. */
    record Define(List<String> modules, List<String> parameters) {
    }

    /**
     * The first define([...], function (a, b) / (a, b) => / a =>) of a text without comments, read by hand so that no
     * input makes it slow; null when there is none.
     */
    static Define define(String text) {
        int at = 0;
        while ((at = text.indexOf("define", at)) >= 0) {
            int start = at;
            at += 6;
            if (start > 0 && (Character.isJavaIdentifierPart(text.charAt(start - 1)) || text.charAt(start - 1) == '.')) {
                continue;
            }
            int i = skipSpace(text, at);
            if (i >= text.length() || text.charAt(i) != '(') {
                continue;
            }
            i = skipSpace(text, i + 1);
            if (i >= text.length() || text.charAt(i) != '[') {
                continue;
            }
            int close = text.indexOf(']', i);
            if (close < 0) {
                return null;
            }
            String list = text.substring(i + 1, close);
            i = skipSpace(text, close + 1);
            if (i >= text.length() || text.charAt(i) != ',') {
                continue;
            }
            i = skipSpace(text, i + 1);
            String parameters;
            if (text.startsWith("async", i) && !Character.isJavaIdentifierPart(charAt(text, i + 5))) {
                i = skipSpace(text, i + 5);
            }
            if (text.startsWith("function", i) && !Character.isJavaIdentifierPart(charAt(text, i + 8))) {
                int open = text.indexOf('(', i + 8);
                int end = open < 0 ? -1 : closingParen(text, open);
                if (end < 0) {
                    return null;
                }
                parameters = text.substring(open + 1, end);
            } else if (i < text.length() && text.charAt(i) == '(') {
                int end = closingParen(text, i);
                if (end < 0) {
                    return null;
                }
                parameters = text.substring(i + 1, end);
            } else {
                int end = i;
                while (end < text.length() && (Character.isJavaIdentifierPart(text.charAt(end)) || text.charAt(end) == '$')) {
                    end++;
                }
                if (end == i) {
                    continue;
                }
                parameters = text.substring(i, end);
            }
            List<String> modules = new ArrayList<>();
            Matcher m = MODULE.matcher(list);
            while (m.find() && modules.size() < MAX_PARAMETERS) {
                modules.add(m.group(1));
            }
            return new Define(modules, splitParameters(parameters));
        }
        return null;
    }

    /** The parameters by their commas outside braces and brackets; a destructured one ({ A, B }) or a rest one is null. */
    static List<String> splitParameters(String list) {
        List<String> parameters = new ArrayList<>();
        int depth = 0;
        int begin = 0;
        for (int i = 0; i <= list.length() && parameters.size() < MAX_PARAMETERS; i++) {
            char c = i < list.length() ? list.charAt(i) : ',';
            if (c == '{' || c == '[' || c == '(') {
                depth++;
            } else if (c == '}' || c == ']' || c == ')') {
                depth--;
            } else if (c == ',' && depth <= 0) {
                String part = list.substring(begin, i);
                int equals = part.indexOf('=');
                String name = (equals < 0 ? part : part.substring(0, equals)).strip();
                if (!name.isEmpty() || i < list.length()) {
                    parameters.add(name.matches("[A-Za-z_$][\\w$]*+") ? name : null);
                }
                begin = i + 1;
            }
        }
        return parameters;
    }

    private static int skipSpace(String text, int i) {
        while (i < text.length() && Character.isWhitespace(text.charAt(i))) {
            i++;
        }
        return i;
    }

    private static char charAt(String text, int i) {
        return i < text.length() ? text.charAt(i) : ' ';
    }

    private static int closingParen(String text, int open) {
        int depth = 0;
        for (int i = open; i < text.length(); i++) {
            char c = text.charAt(i);
            if (c == '(') {
                depth++;
            } else if (c == ')' && --depth == 0) {
                return i;
            }
        }
        return -1;
    }

    /** The module a conventional parameter name stands for. */
    private static final Map<String, String> CONVENTIONAL = Map.of("ko", "knockout", "oj", "ojs/ojcore", "$", "jquery", "Bootstrap", "ojs/ojbootstrap",
            "ArrayDataProvider", "ojs/ojarraydataprovider", "Context", "ojs/ojcontext", "ResponsiveUtils", "ojs/ojresponsiveutils",
            "Translations", "ojs/ojtranslation", "Logger", "ojs/ojlogger");
    /** JET modules loaded only for what they register (the knockout bindings, custom elements): their value is no object to use. */
    private static final Pattern SIDE_EFFECT = Pattern.compile("ojs/oj(knockout|button|inputtext|inputnumber|formlayout|selectsingle|selectcombobox"
            + "|select|label|labelvalue|dialog|popup|table|listview|listitemlayout|checkboxset|radioset|switch|datetimepicker|menu"
            + "|navigationlist|tabbar|progress|progress-bar|progress-circle|avatar|chart|validationgroup|messages|message|collapsible"
            + "|accordion|textarea|toolbar|conveyorbelt|filmstrip|train|switcher|module-element|defer|bind-for-each"
            + "|inputsearch|inputpassword|optgroup|option)");

    /**
     * The certain findings about the define list and the resource bundles of a view model: a parameter that receives a
     * module of another position (oj receiving ojs/ojknockout, then oj.getLogger() fails), a parameter used as an object
     * although its module only registers elements, a module of the code base (./model) that no parameter receives, and a
     * resource bundle (ojL10n!) used as something it is not: .get('key') on the plain object a bundle is, or keys its file
     * does not define.
     *
     * @param source the content of a module the change writes, by module name as the define list names it ('./model',
     *               'ojL10n!nls/quick-transfer'); null when not known
     */
    static List<String> defineProblems(String content, java.util.function.Function<String, String> source) {
        if (content == null || content.length() > MAX_DEFINE_TEXT || content.lines().anyMatch(l -> l.length() > MAX_DEFINE_LINE)
                || JavaScriptCheck.structure(content) != null) {
            return List.of();
        }
        String text = SourceScanText.withoutComments(content);
        Define define = define(text);
        if (define == null) {
            return List.of();
        }
        List<String> modules = define.modules();
        List<String> parameters = define.parameters();
        String code = JavaScriptCheck.codeOnly(content);
        List<String> problems = new ArrayList<>();
        List<String> wrong = new ArrayList<>();
        for (int i = 0; i < parameters.size(); i++) {
            String parameter = parameters.get(i);
            if (parameter == null) {
                continue;
            }
            String module = i < modules.size() ? modules.get(i) : null;
            String expected = CONVENTIONAL.get(parameter);
            boolean used = Pattern.compile("(?<![\\w$.])" + Pattern.quote(parameter) + "\\s*+[.(\\[]").matcher(code).find();
            if (!used) {
                continue;
            }
            if (module == null) {
                wrong.add(parameter + " receives nothing (the list has " + modules.size() + " module(s))");
            } else if (expected != null && !conventional(module, expected)) {
                wrong.add(parameter + " receives '" + module + "' (module " + (i + 1) + "), not '" + expected + "'");
            } else if (expected == null && SIDE_EFFECT.matcher(module).matches()) {
                wrong.add(parameter + " receives '" + module + "' (module " + (i + 1) + "), which only registers elements");
            }
        }
        if (!wrong.isEmpty()) {
            problems.add(WRONG_BINDING + ": " + String.join("; ", wrong) + ". Each parameter receives the module at its position in the "
                    + "define list: list the modules the function uses first, in the order of its parameters, and the others after them.");
        }
        List<String> notReceived = new ArrayList<>();
        for (int i = parameters.size(); i < modules.size(); i++) {
            String module = modules.get(i);
            String other = (module.startsWith("./") || module.startsWith("../")) && source != null ? source.apply(module) : null;
            // Only a module this change writes, whose functions this file calls: a loader kept for what it does is no finding
            List<String> functions = other == null ? List.of() : exported(other).stream().limit(200)
                    .filter(f -> Pattern.compile("\\.\\s*+" + Pattern.quote(f) + "\\s*+\\(").matcher(code).find()).toList();
            if (!functions.isEmpty()) {
                notReceived.add(module + " (whose " + String.join(", ", functions) + " this file calls on other objects)");
            }
        }
        if (!notReceived.isEmpty()) {
            problems.add(NOT_RECEIVED + ": " + String.join("; ", notReceived) + ". Its value is lost: give the function a parameter for it "
                    + "at its position (for example Model for ./model) and call its functions on that parameter.");
        }
        for (int i = 0; i < Math.min(parameters.size(), modules.size()); i++) {
            if (parameters.get(i) != null && modules.get(i).startsWith("ojL10n!") && source != null) {
                String bundle = source.apply(modules.get(i));
                if (bundle != null) {
                    problems.addAll(bundleProblems(text, code, parameters.get(i), modules.get(i), bundle));
                }
            }
        }
        return problems;
    }

    /** The module is the one the name stands for: the same, a variant of it (ojs/ojcore-base for ojs/ojcore), or the same file elsewhere. */
    private static boolean conventional(String module, String expected) {
        String file = expected.substring(expected.lastIndexOf('/') + 1);
        return module.equals(expected) || module.startsWith(expected + "-") || module.endsWith("/" + file) || module.endsWith("/" + file + "-base");
    }

    /** foo: function, foo() {, this.foo = function: the functions a module (a model.js) offers. */
    private static final Pattern EXPORTED = Pattern.compile("(?m)(?:^|[{,])\\s*+([A-Za-z_$][\\w$]*+)\\s*+(?::\\s*+(?:async\\s++)?function\\b"
            + "|:\\s*+\\([^()]*+\\)\\s*+=>|\\([^()]*+\\)\\s*+\\{)"
            + "|\\.\\s*+([A-Za-z_$][\\w$]*+)\\s*+=\\s*+(?:async\\s++)?function\\b");

    static Set<String> exported(String module) {
        Set<String> names = new LinkedHashSet<>();
        Matcher m = EXPORTED.matcher(JavaScriptCheck.codeOnly(module));
        while (m.find()) {
            String name = m.group(1) != null ? m.group(1) : m.group(2);
            if (!Set.of("if", "for", "while", "switch", "catch", "function", "return").contains(name)) {
                names.add(name);
            }
        }
        return names;
    }

    /**
     * The bundle a parameter receives used wrongly: .get(...) on it (a bundle is a plain object, without get unless its
     * file defines one), or a key read from it (bundle.payees, bundle.get('payees')) that its file defines nowhere.
     */
    private static List<String> bundleProblems(String text, String code, String parameter, String module, String bundle) {
        // The names the bundle goes by: the parameter, and what is set to it (self.nls = resourceBundle)
        Set<String> names = new LinkedHashSet<>();
        names.add(Pattern.quote(parameter));
        // From the start of a name only, and possessive: a long name is not tried again from each of its letters
        Matcher alias = Pattern.compile("(?<![\\w$.])((?:(?:this|self)\\s*+\\.\\s*+)?[A-Za-z_$][\\w$]*+)\\s*+=\\s*+" + Pattern.quote(parameter)
                + "(?![\\w$])\\s*+[;,\\n]").matcher(code);
        while (alias.find() && names.size() < 20) {
            String name = alias.group(1).replaceAll("\\s+", "");
            names.add(name.contains(".") ? Pattern.quote(name.substring(0, name.indexOf('.'))) + "\\s*+\\.\\s*+"
                    + Pattern.quote(name.substring(name.indexOf('.') + 1)) : Pattern.quote(name));
        }
        String either = "(?<![\\w$.])(?:" + String.join("|", names) + ")";
        // every key of the bundle: a key left out of a shortened list would be reported as missing
        Set<String> keys = new LinkedHashSet<>(CodeGenerator.bundleKeys(bundle, Integer.MAX_VALUE));
        List<String> problems = new ArrayList<>();
        boolean hasGet = keys.contains("get");
        if (!hasGet && Pattern.compile(either + "\\s*+\\.\\s*+get\\s*+\\(").matcher(code).find()) {
            problems.add(BUNDLE_GET + " (" + module + "): a bundle is a plain object of its keys, without get. Read the keys as properties "
                    + "(for example nls.amount), as the bundle file defines them.");
        }
        Set<String> missing = new java.util.TreeSet<>();
        // bundle.key, and bundle.get('key') in the text with its strings
        Matcher read = Pattern.compile(either + "\\s*+\\.\\s*+([A-Za-z_$][\\w$]*+)").matcher(code);
        while (read.find()) {
            String key = read.group(1);
            if (!key.equals("get") && !keys.contains(key)) {
                missing.add(key);
            }
        }
        Matcher got = Pattern.compile(either + "\\s*+\\.\\s*+get\\s*+\\(\\s*+['\"]([^'\"\\n]{1,200}+)['\"]").matcher(text);
        while (got.find()) {
            String key = got.group(1);
            String first = key.contains(".") ? key.substring(0, key.indexOf('.')) : key;
            if (!keys.contains(first)) {
                missing.add(key);
            }
        }
        if (!missing.isEmpty() && !keys.isEmpty()) {
            problems.add(BUNDLE_KEYS + " (" + module + "): " + String.join(", ", missing) + ". Add them to the bundle file, or use the keys "
                    + "it has: " + String.join(", ", keys.stream().limit(30).toList()) + ".");
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
