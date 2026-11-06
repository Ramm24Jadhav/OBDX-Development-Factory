package com.obdx.factory.change;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Compares a JET view (component.html) with its view model (component.js), which a check of one file cannot: the
 * names the view binds that the view model never defines, and bindings that are not valid expressions
 * ("nls.fund-transfer.title"). A model writing the two files separately often names a property differently in each.
 * The findings are warnings (a view model can also take names from elsewhere), except when the view model is written
 * in the same change as the view and its shape is clear (see {@link Shape#recognised()}): the two were written for
 * each other, so a name it lacks is an error.
 *
 * <p>Every scan is linear in the size of the file: bindings are found by hand, the regular expressions are possessive
 * and bounded, and names, expressions and outlines have caps.
 */
final class ViewBindings {

    /** How the finding starts when the view model may take names from elsewhere: a warning. */
    static final String UNDEFINED = "The view binds names its view model does not define";
    /**
     * How the finding starts when the view model is written in the same change: the two were written for each other,
     * so a name the view model lacks is an error.
     */
    static final String UNDEFINED_IN_CHANGE = "The view binds names that the view model written in this change does not define";
    /** The most names a list of names (bound, defined for the outline) holds. */
    static final int MAX_NAMES = 80;
    /** Longer names are not names a view model would use: left out. */
    static final int MAX_NAME = 64;
    /** A binding longer than this is no expression (an unclosed one running into the page): skipped. */
    static final int MAX_BODY = 2_000;
    /** The most bindings read from one view. */
    static final int MAX_EXPRESSIONS = 5_000;
    /** The longest outline of a view model, in characters. */
    static final int MAX_OUTLINE = 4_000;
    /** The fewest public names a view model needs for its shape to be recognised. */
    static final int MIN_SHAPE = 2;

    private static final Pattern ROOT = Pattern.compile("[\\s!(]*+([A-Za-z_$][\\w$]*+)");
    /** nls.fund-transfer.labels: a hyphen between letters in a property path; not items().length-1, a subtraction */
    private static final Pattern HYPHENATED = Pattern.compile("\\.[A-Za-z_$][\\w$]*+(?<=[A-Za-z])-[A-Za-z]");
    /** as="row", as='row', data-oj-as="item", and knockout's foreach: { data: rows, as: 'r' } */
    private static final Pattern ALIAS = Pattern.compile("\\bas[ \\t]*+[=:][ \\t]*+[\"']([A-Za-z_$][\\w$]{0,63}+)[\"']");
    /**
     * A call that may copy names into an object (OBDX's rootModel, params, a mapping), with the start of its arguments:
     * it copies them into the view model only when its target argument is the view model (see {@link #copiesInto}).
     */
    private static final Pattern COPY_CALL = Pattern.compile("\\b(ko\\.utils\\.extend|ko\\.mapping\\.fromJS|Object\\.(?:assign|"
            + "defineProperties)|_\\.(?:assign|merge|extend|defaults)|\\$\\.extend|extend)[ \\t]*+\\(([^()\\n]{0,300}+)");
    /** Object.defineProperty(this, 'total', ...): a name of its own. */
    private static final Pattern DEFINE_PROPERTY = Pattern.compile("\\bObject\\.defineProperty[ \\t]*+\\([ \\t]*+([A-Za-z_$][\\w$]{0,63}+)"
            + "[ \\t]*+,[ \\t]*+['\"]([A-Za-z_$][\\w$]{0,63}+)['\"]");
    /**
     * The modifiers a class member may have, JavaScript's and TypeScript's, each followed by more of the member (so a
     * field named get or async is a name, not a modifier).
     */
    private static final String MODIFIERS = "(?:(?:static|async|get|set|public|private|protected|readonly|override|declare|abstract|accessor)"
            + "[ \\t]++(?=[A-Za-z_$#*]))";
    /** var that = this; */
    private static final Pattern THIS_ALIAS = Pattern.compile("\\b(?:var|let|const)[ \\t]++([A-Za-z_$][\\w$]{0,63}+)[ \\t]*+=[ \\t]*+this\\b");
    /**
     * receiver.name = value, receiver['name'] = value, receiver[expression] = value (a name made at run time): the
     * value is at most 80 characters of its line.
     */
    private static final Pattern ASSIGNED = Pattern.compile("\\b([A-Za-z_$][\\w$]{0,63}+)[ \\t]*+(?:\\.[ \\t]*+([A-Za-z_$][\\w$]{0,63}+)"
            + "|\\[[ \\t]*+(?:'([A-Za-z_$][\\w$]{0,63}+)'|\"([A-Za-z_$][\\w$]{0,63}+)\"|([^\\]\\n]{1,80}+))[ \\t]*+])[ \\t]*+=(?![=>])"
            + "[ \\t]*+([^\\n;]{0,80}+)");
    private static final Pattern CLASS = Pattern.compile("\\bclass\\b[^{\\n]{0,200}+\\{");
    /**
     * A class member where it starts: name(...) {, get name() {, name = value, static name = value, and TypeScript's
     * public send(): void {, private get total(): number {, readonly amount: ko.Observable&lt;number&gt; = ko.observable(0),
     * total!: number. Groups: modifiers, name, the rest's start, a plain field's value, a typed field's value.
     */
    private static final Pattern MEMBER = Pattern.compile("(" + MODIFIERS + "{0,6}+)(?:\\*[ \\t]*+)?#?([A-Za-z_$][\\w$]{0,63}+)[?!]?[ \\t]*+"
            + "(\\(|<|=(?![=>])[ \\t]*+([^\\n;]{0,80}+)|:[^=;\\n]{0,120}+(?:=(?![=>])[ \\t]*+([^\\n;]{0,80}+))?)");
    private static final Pattern RETURN_OBJECT = Pattern.compile("\\breturn[ \\t\\r\\n]*+\\{");
    /** VM.prototype = { send: function () {}, total: 1 }: the members of a view model's prototype. */
    private static final Pattern PROTOTYPE_OBJECT = Pattern.compile("\\b[A-Za-z_$][\\w$]{0,63}+\\.prototype[ \\t]*+=[ \\t\\r\\n]*+\\{");
    /** An entry of an object literal: name: value, 'name': value, name(...) { }, async name() { }, or name alone */
    private static final Pattern ENTRY = Pattern.compile("(?:(?:async|get|set)[ \\t]++(?=[A-Za-z_$'\"]))?+(?:(?:async|get|set)[ \\t]++"
            + "(?=[A-Za-z_$'\"]))?+['\"]?([A-Za-z_$][\\w$]{0,63}+)['\"]?[ \\t]*+(:|\\(|$)");
    /** The names a view model may define, read leniently (only for not reporting a name it may have). */
    private static final Pattern OBJECT_KEY = Pattern.compile("^[ \\t]*+['\"]?([A-Za-z_$][\\w$]{0,63}+)['\"]?[ \\t]*+:", Pattern.MULTILINE);
    private static final Pattern FUNCTION = Pattern.compile("\\bfunction[ \\t]++([A-Za-z_$][\\w$]{0,63}+)");
    private static final Pattern LINE_MEMBER = Pattern.compile("^[ \\t]*+" + MODIFIERS + "{0,6}+#?([A-Za-z_$][\\w$]{0,63}+)[?!]?[ \\t]*+"
            + "(?:\\([^()\\n]{0,300}+\\)[ \\t]*+(?::[^{;\\n]{0,120}+)?\\{|=(?![=>])|:)", Pattern.MULTILINE);
    private static final Pattern ARROW = Pattern.compile("^(?:async[ \\t]++)?(?:\\([^()]{0,200}+\\)|[A-Za-z_$][\\w$]*+)[ \\t]*+=>");
    /** Globals and keywords a binding may start with. */
    private static final Set<String> KNOWN = Set.of("true", "false", "null", "undefined", "oj", "Math", "JSON", "Number", "String",
            "Date", "window", "document", "$data", "$parent", "$parents", "$root", "$current", "$context", "$index", "$properties",
            "$props", "$element", "$component", "$event", "$item", "$value", "typeof", "new", "parseInt", "parseFloat", "isNaN",
            "isFinite", "Object", "Array", "Boolean", "Intl", "encodeURIComponent", "decodeURIComponent", "encodeURI", "decodeURI",
            "console", "Promise", "RegExp", "Symbol", "BigInt", "NaN", "Infinity", "ko", "this", "void", "instanceof", "in", "Error",
            "Set", "Map", "navigator", "location", "$", "_");
    /** Names that are no member a view binds (keywords that look like methods, the constructor). */
    private static final Set<String> NOT_NAMES = Set.of("if", "for", "while", "switch", "catch", "function", "return", "constructor",
            "define", "require", "else", "do", "try", "with", "new", "typeof", "class", "super", "this");
    private static final Set<String> RECEIVERS = Set.of("self", "this", "vm", "_this", "that", "me");

    private ViewBindings() {
    }

    // --- the view ---

    /** What is wrong between the view and its view model; empty when they agree or cannot be compared. */
    static List<String> problems(String view, String viewModel) {
        return problems(view, viewModel, false);
    }

    /**
     * @param inChange the view model is written in the same change as the view: names it lacks are an error (see
     *                 {@link #UNDEFINED_IN_CHANGE}) when its shape is clear, with the names it has, so that a fix of the
     *                 view can use them
     */
    static List<String> problems(String view, String viewModel, boolean inChange) {
        if (view == null) {
            return List.of();
        }
        List<String> problems = new ArrayList<>();
        Set<String> invalid = invalid(view);
        if (!invalid.isEmpty()) {
            problems.add("Bindings that are not valid expressions (a name with a hyphen): " + String.join(", ", invalid)
                    + ". Use bracket access, for example nls['fund-transfer'], or a name without hyphens.");
        }
        if (viewModel == null) {
            return problems;
        }
        Shape shape = shape(viewModel);
        List<String> missing = missing(view, shape);
        if (missing.isEmpty()) {
            return problems;
        }
        if (inChange && shape.recognised()) {
            String names = outline(shape);
            problems.add(UNDEFINED_IN_CHANGE + ": " + String.join(", ", missing) + ". Use the view model's names"
                    + (names.isEmpty() ? "" : " (" + names + ")") + ", or add the missing ones to the view model.");
        } else if (shape.copies()) {
            // The names may come with what it copies in: said, but only as a warning
            problems.add(UNDEFINED + ": " + String.join(", ", missing) + ". The view model copies names in from elsewhere, so they may "
                    + "be there; check them, or define them in the view model.");
        } else {
            problems.add(UNDEFINED + ": " + String.join(", ", missing) + ". Use the view model's names, or add them to it.");
        }
        return problems;
    }

    /** The names the view binds that the view model does not define itself (it may copy some in from elsewhere). */
    static List<String> missing(String view, String viewModel) {
        if (view == null || viewModel == null) {
            return List.of();
        }
        return missing(view, shape(viewModel));
    }

    private static List<String> missing(String view, Shape shape) {
        return bound(view).stream().filter(name -> !shape.defined().contains(name)).limit(MAX_NAMES).toList();
    }

    /**
     * The names a view binds at the root of its expressions (not its loop aliases, $current, nls.x's x), at most
     * {@link #MAX_NAMES}; bindings in comments and in script templates are not the view's own.
     */
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
        for (String expression : expressions(withoutTemplates(view))) {
            if (bound.size() >= MAX_NAMES) {
                break;
            }
            Matcher root = ROOT.matcher(unquoted(expression));
            if (root.lookingAt()) {
                String name = root.group(1);
                if (name.length() <= MAX_NAME && !KNOWN.contains(name) && !name.startsWith("$") && !aliases.contains(name)) {
                    bound.add(name);
                }
            }
        }
        return bound;
    }

    private static Set<String> invalid(String view) {
        Set<String> invalid = new LinkedHashSet<>();
        for (String expression : expressions(withoutTemplates(view))) {
            String compact = expression.strip().replaceAll("\\s++", " ");
            if (HYPHENATED.matcher(unquoted(compact)).find() && invalid.size() < MAX_NAMES) {
                invalid.add(compact.length() > 60 ? compact.substring(0, 60) + "..." : compact);
            }
        }
        return invalid;
    }

    /** An expression with its string literals emptied ('abc' to ''), read by hand. */
    private static String unquoted(String expression) {
        StringBuilder out = new StringBuilder(expression.length());
        char quote = 0;
        for (int i = 0; i < expression.length(); i++) {
            char c = expression.charAt(i);
            if (quote == 0) {
                out.append(c);
                if (c == '\'' || c == '"') {
                    quote = c;
                }
            } else if (c == quote) {
                out.append(c);
                quote = 0;
            }
        }
        return out.toString();
    }

    /**
     * The bodies of a view's [[...]] and {{...}} bindings, found by hand: each opening and each closing is looked for
     * once, so an unclosed binding cannot make the scan go over the rest of the view again for every opening.
     */
    static List<String> expressions(String view) {
        List<String> out = new ArrayList<>();
        int n = view.length();
        int i = 0;
        // -2: not looked for yet; -1: none after this point
        int square = -2;
        int curly = -2;
        int squareClose = -2;
        int curlyClose = -2;
        while (i < n && out.size() < MAX_EXPRESSIONS) {
            if (square != -1 && square < i) {
                square = view.indexOf("[[", i);
            }
            if (curly != -1 && curly < i) {
                curly = view.indexOf("{{", i);
            }
            if (square < 0 && curly < 0) {
                break;
            }
            boolean isSquare = curly < 0 || (square >= 0 && square < curly);
            int from = (isSquare ? square : curly) + 2;
            int close;
            if (isSquare) {
                if (squareClose != -1 && squareClose < from) {
                    squareClose = view.indexOf("]]", from);
                }
                close = squareClose;
            } else {
                if (curlyClose != -1 && curlyClose < from) {
                    curlyClose = view.indexOf("}}", from);
                }
                close = curlyClose;
            }
            if (close < 0) {
                // no closing after it, so none after any later opening of its kind either
                if (isSquare) {
                    square = -1;
                } else {
                    curly = -1;
                }
                continue;
            }
            if (close == from || close - from > MAX_BODY) {
                i = from;
                continue;
            }
            out.add(view.substring(from, close));
            i = close + 2;
        }
        return out;
    }

    /**
     * The view without its HTML comments and its script templates (script type="text/html"): their bindings belong to
     * a template's own data, or to nothing. Read by hand, each kind of tag looked for once per position.
     */
    static String withoutTemplates(String view) {
        // (lower-cased letter by letter in ASCII only, so that every index is the view's own: Java's lower case of
        // some letters, such as the Turkish dotted I, is longer than the letter)
        String lower = asciiLower(view);
        StringBuilder out = new StringBuilder(view.length());
        int n = view.length();
        int i = 0;
        int comment = -2;
        int script = -2;
        while (i < n) {
            if (comment != -1 && comment < i) {
                comment = lower.indexOf("<!--", i);
            }
            if (script != -1 && script < i) {
                script = lower.indexOf("<script", i);
            }
            int next = comment < 0 ? script : script < 0 ? comment : Math.min(comment, script);
            if (next < 0) {
                out.append(view, i, n);
                break;
            }
            out.append(view, i, next);
            if (next == comment) {
                int end = lower.indexOf("-->", comment + 4);
                i = end < 0 ? n : end + 3;
            } else {
                int tagEnd = lower.indexOf('>', script);
                if (tagEnd < 0) {
                    out.append(view, script, n);
                    break;
                }
                String tag = lower.substring(script, Math.min(tagEnd, script + 500));
                if (tag.contains("text/html") || tag.contains("text/x-")) {
                    int end = lower.indexOf("</script", tagEnd);
                    int endTag = end < 0 ? -1 : lower.indexOf('>', end);
                    i = endTag < 0 ? n : endTag + 1;
                } else {
                    out.append(view, script, tagEnd + 1);
                    i = tagEnd + 1;
                }
            }
        }
        return out.toString();
    }

    /** The text with A to Z lower-cased and every other character as it is: the same length, so indexes carry over. */
    static String asciiLower(String text) {
        char[] chars = text.toCharArray();
        for (int i = 0; i < chars.length; i++) {
            if (chars[i] >= 'A' && chars[i] <= 'Z') {
                chars[i] = (char) (chars[i] + ('a' - 'A'));
            }
        }
        return new String(chars);
    }

    // --- the view model ---

    /**
     * What a view model defines.
     *
     * @param defined every name it may define, read leniently (object keys, function names and the like too): a name
     *                bound in the view that is not among them is missing
     * @param names   its public names (self.x =, this.x =, a class's members, its prototype's or the object it returns)
     *                with their kind, for prompts and findings
     * @param copies  it copies names into itself from elsewhere (ko.utils.extend(self, ...)), so a name it lacks may be
     *                there: a warning, never an error
     * @param dynamic it sets names made at run time (self[key] =)
     */
    record Shape(Set<String> defined, Map<String, String> names, boolean copies, boolean dynamic) {

        /** Whether the view model's names are clear enough for a name it lacks to be an error rather than a warning. */
        boolean recognised() {
            return !copies && !dynamic && names.size() >= MIN_SHAPE;
        }
    }

    static Shape shape(String viewModel) {
        Set<String> defined = new LinkedHashSet<>();
        Map<String, String> names = new LinkedHashMap<>();
        if (viewModel == null) {
            return new Shape(defined, names, false, false);
        }
        Set<String> receivers = new LinkedHashSet<>(RECEIVERS);
        Matcher alias = THIS_ALIAS.matcher(viewModel);
        while (alias.find()) {
            receivers.add(alias.group(1));
        }
        boolean copies = false;
        Matcher copy = COPY_CALL.matcher(viewModel);
        while (!copies && copy.find()) {
            copies = copiesInto(copy.group(1), copy.group(2), receivers);
        }
        boolean dynamic = false;
        Matcher m = ASSIGNED.matcher(viewModel);
        while (m.find()) {
            String receiver = m.group(1);
            String name = m.group(2) != null ? m.group(2) : m.group(3) != null ? m.group(3) : m.group(4);
            if (!receivers.contains(receiver) && !"prototype".equals(receiver)) {
                continue;
            }
            if (name == null) {
                dynamic = true;
                continue;
            }
            defined.add(name);
            if (names.size() < MAX_NAMES) {
                names.putIfAbsent(name, kind(m.group(6).strip()));
            }
        }
        Matcher property = DEFINE_PROPERTY.matcher(viewModel);
        while (property.find()) {
            if (receivers.contains(property.group(1))) {
                defined.add(property.group(2));
                if (names.size() < MAX_NAMES) {
                    names.putIfAbsent(property.group(2), "Other values");
                }
            }
        }
        int[] depth = depths(viewModel);
        classMembers(viewModel, depth, defined, names);
        // the members of its prototype are the view model's own; the object a module returns only when it has no others
        objectEntries(viewModel, PROTOTYPE_OBJECT, defined).forEach((name, kind) -> {
            if (names.size() < MAX_NAMES) {
                names.putIfAbsent(name, kind);
            }
        });
        Map<String, String> returned = objectEntries(viewModel, RETURN_OBJECT, defined);
        if (names.isEmpty()) {
            returned.forEach(names::putIfAbsent);
        }
        for (Pattern lenient : List.of(OBJECT_KEY, FUNCTION, LINE_MEMBER)) {
            Matcher l = lenient.matcher(viewModel);
            while (l.find()) {
                defined.add(l.group(1));
            }
        }
        names.keySet().removeIf(NOT_NAMES::contains);
        return new Shape(defined, names, copies, dynamic);
    }

    /**
     * Whether a copying call copies into the view model: its target argument (the first; ko.mapping.fromJS's third;
     * after $.extend's deep flag) is the view model (self, this or an alias of this). ko.observable(...).extend({...})
     * copies nothing into it.
     */
    static boolean copiesInto(String call, String arguments, Set<String> receivers) {
        List<String> args = new ArrayList<>();
        for (String arg : arguments.split(",", 8)) {
            args.add(arg.strip());
        }
        // ($.extend(true, self, ...) copies deeply: its target follows the flag; "$." itself is not matched, as $ starts no word)
        if (call.endsWith("extend") && !args.isEmpty() && (args.getFirst().equals("true") || args.getFirst().equals("false"))) {
            args.removeFirst();
        }
        int target = call.equals("ko.mapping.fromJS") ? 2 : 0;
        return args.size() > target && receivers.contains(args.get(target));
    }

    /**
     * The members of the view model's classes (methods, getters, fields), each where it starts in the class body: at
     * the start of a line, or after a ; or } that ends a member on the same line (class A { send() {} total = 1; }).
     */
    private static void classMembers(String code, int[] depth, Set<String> defined, Map<String, String> names) {
        Matcher header = CLASS.matcher(code);
        if (!header.find()) {
            return;
        }
        do {
            int open = header.end() - 1;
            int body = depth[open] + 1;
            int i = open + 1;
            while (i < code.length() && depth[i] >= body) {
                int lineEnd = code.indexOf('\n', i);
                lineEnd = lineEnd < 0 ? code.length() : lineEnd;
                member(code, depth, body, blanksAfter(code, i, lineEnd), lineEnd, defined, names);
                for (int k = i; k < lineEnd; k++) {
                    char c = code.charAt(k);
                    if ((c == ';' || c == '}') && k + 1 < lineEnd && depth[k + 1] == body) {
                        member(code, depth, body, blanksAfter(code, k + 1, lineEnd), lineEnd, defined, names);
                    }
                }
                i = lineEnd + 1;
            }
            // (after the class body, or past the end when its last line has no line break)
            header.region(Math.min(Math.max(i, header.end()), code.length()), code.length());
        } while (header.find());
    }

    private static int blanksAfter(String code, int from, int end) {
        int i = from;
        while (i < end && (code.charAt(i) == ' ' || code.charAt(i) == '\t')) {
            i++;
        }
        return i;
    }

    /** The class member that starts at first, if one does at the class body's depth. */
    private static void member(String code, int[] depth, int body, int first, int lineEnd, Set<String> defined, Map<String, String> names) {
        if (first >= lineEnd || depth[first] != body) {
            return;
        }
        Matcher member = MEMBER.matcher(code).region(first, lineEnd);
        if (!member.lookingAt() || NOT_NAMES.contains(member.group(2))) {
            return;
        }
        String name = member.group(2);
        defined.add(name);
        String rest = member.group(3);
        String kind;
        if (rest.startsWith("(") || rest.startsWith("<")) {
            kind = member.group(1).contains("get ") ? "Computed" : "Functions";
        } else if (rest.startsWith("=")) {
            kind = kind(member.group(4).strip());
        } else if (member.group(5) != null) {
            kind = kind(member.group(5).strip());
        } else {
            // a typed field without a value: what its type says
            kind = code.startsWith("=>", member.end()) || rest.contains("=>") ? "Functions" : typeKind(rest);
        }
        if (names.size() < MAX_NAMES) {
            names.putIfAbsent(name, kind);
        }
    }

    /** The kind a TypeScript type gives a field: ko.Observable&lt;number&gt;, ko.PureComputed, ArrayDataProvider ... */
    private static String typeKind(String type) {
        if (type.contains("Observable")) {
            return "Observables";
        }
        if (type.contains("Computed")) {
            return "Computed";
        }
        return type.contains("DataProvider") ? "Data providers" : "Other values";
    }

    /**
     * The brace depth at each character of the code (the depth before it), strings, template literals, comments and
     * regular expression literals skipped. One pass.
     */
    static int[] depths(String code) {
        int n = code.length();
        int[] depth = new int[n + 1];
        int d = 0;
        int i = 0;
        while (i < n) {
            char c = code.charAt(i);
            int skip = skipped(code, i);
            if (skip > i) {
                for (int k = i; k < skip; k++) {
                    depth[k] = d;
                }
                i = skip;
                continue;
            }
            depth[i] = d;
            if (c == '{') {
                d++;
            } else if (c == '}' && d > 0) {
                d--;
            }
            i++;
        }
        depth[n] = d;
        return depth;
    }

    /** The longest regular expression literal read as one: a longer "literal" is a division. */
    static final int MAX_REGEX = 500;

    /** The end of the string, template literal, comment or regular expression literal that starts at i, or i when none does. */
    private static int skipped(String code, int i) {
        char c = code.charAt(i);
        int n = code.length();
        if (c == '/' && i + 1 < n && code.charAt(i + 1) == '/') {
            int end = code.indexOf('\n', i);
            return end < 0 ? n : end;
        }
        if (c == '/' && i + 1 < n && code.charAt(i + 1) == '*') {
            int end = code.indexOf("*/", i + 2);
            return end < 0 ? n : end + 2;
        }
        if (c == '/') {
            return regexEnd(code, i);
        }
        if (c == '\'' || c == '"' || c == '`') {
            int k = i + 1;
            while (k < n && code.charAt(k) != c && (c == '`' || code.charAt(k) != '\n')) {
                k += code.charAt(k) == '\\' ? 2 : 1;
            }
            return Math.min(k + 1, n);
        }
        return i;
    }

    /**
     * The end of a regular expression literal at i (/\{/, /[/*]/), or i when the slash is a division. A slash starts one
     * after an operator or punctuation that cannot end a value (( , = : [ ! &amp; | ? { } ; and the like), at the start, or
     * after return and typeof; it ends at the next slash outside a character class, on the same line, within
     * {@link #MAX_REGEX} characters.
     */
    private static int regexEnd(String code, int i) {
        int k = i - 1;
        while (k >= 0 && Character.isWhitespace(code.charAt(k))) {
            k--;
        }
        boolean starts = k < 0 || "(,=:[!&|?{};+-*%<>~^".indexOf(code.charAt(k)) >= 0 || word(code, k, "return") || word(code, k, "typeof");
        if (!starts) {
            return i;
        }
        boolean inClass = false;
        int end = Math.min(code.length(), i + MAX_REGEX);
        for (int j = i + 1; j < end; j++) {
            char ch = code.charAt(j);
            if (ch == '\\') {
                j++;
            } else if (ch == '\n') {
                return i;
            } else if (ch == '[') {
                inClass = true;
            } else if (ch == ']') {
                inClass = false;
            } else if (ch == '/' && !inClass) {
                return j + 1;
            }
        }
        return i;
    }

    /** Whether the word ends at k (and is a whole word). */
    private static boolean word(String code, int k, String word) {
        int start = k - word.length() + 1;
        return start >= 0 && code.startsWith(word, start) && (start == 0 || !Character.isJavaIdentifierPart(code.charAt(start - 1)));
    }

    /**
     * The entries of the object literals that start where the pattern ends (return { amount, send, total: ... },
     * VM.prototype = { send: function () {} }), with their kind.
     */
    private static Map<String, String> objectEntries(String code, Pattern start, Set<String> defined) {
        Map<String, String> names = new LinkedHashMap<>();
        Matcher m = start.matcher(code);
        int from = 0;
        while (from < code.length() && m.find(from)) {
            int i = m.end();
            int depth = 1;
            int entry = i;
            while (i < code.length() && depth > 0) {
                int skip = skipped(code, i);
                if (skip > i) {
                    i = skip;
                    continue;
                }
                char c = code.charAt(i);
                if (c == '{' || c == '(' || c == '[') {
                    depth++;
                } else if (c == '}' || c == ')' || c == ']') {
                    depth--;
                }
                if ((c == ',' && depth == 1) || depth == 0) {
                    entry(code.substring(entry, i).strip(), defined, names);
                    entry = i + 1;
                }
                i++;
            }
            // (an object inside it was read with it)
            from = Math.max(i, m.end());
        }
        return names;
    }

    private static void entry(String text, Set<String> defined, Map<String, String> names) {
        if (text.isEmpty()) {
            return;
        }
        Matcher e = ENTRY.matcher(text.length() > 200 ? text.substring(0, 200) : text);
        if (!e.lookingAt()) {
            return;
        }
        String name = e.group(1);
        defined.add(name);
        String kind = switch (e.group(2)) {
            case ":" -> kind(text.substring(text.indexOf(':') + 1).strip());
            case "(" -> "Functions";
            default -> "Other values";
        };
        if (names.size() < MAX_NAMES && !NOT_NAMES.contains(name)) {
            names.putIfAbsent(name, kind);
        }
    }

    /**
     * The public names of a view model for a prompt or a finding, by kind ("Observables: amount, payees; Functions:
     * sendTransfer; Data providers: accountsDataProvider"): its self./this. assignments (and those of an alias of this),
     * prototype methods, class members (methods, getters, fields) and, for a view model that is the object its module
     * returns, that object's entries. Not the constructor's name nor the keys of nested objects. Empty when it has none;
     * at most {@link #MAX_OUTLINE} characters.
     */
    static String outline(String viewModel) {
        return viewModel == null ? "" : outline(shape(viewModel));
    }

    private static String outline(Shape shape) {
        Map<String, List<String>> kinds = new LinkedHashMap<>();
        for (String kind : List.of("Observables", "Computed", "Functions", "Data providers", "Other values")) {
            kinds.put(kind, new ArrayList<>());
        }
        shape.names().forEach((name, kind) -> kinds.get(kind).add(name));
        StringBuilder outline = new StringBuilder();
        kinds.forEach((kind, list) -> {
            if (!list.isEmpty()) {
                outline.append(outline.isEmpty() ? "" : "; ").append(kind).append(": ").append(String.join(", ", list));
            }
        });
        if (!outline.isEmpty() && shape.copies()) {
            outline.append("; it also copies in names from elsewhere");
        }
        return outline.length() > MAX_OUTLINE ? outline.substring(0, MAX_OUTLINE) + " ..." : outline.toString();
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

    // --- which view goes with which view model ---

    /**
     * The view model paths of a view, most likely first: x.js and x.ts beside x.html, and for OBDX's and JET's
     * js/views/x.html layout js/viewModels/x.js and .ts.
     */
    static List<String> viewModelPaths(String viewPath) {
        String base = viewPath.substring(0, viewPath.length() - ".html".length());
        List<String> paths = new ArrayList<>(List.of(base + ".js", base + ".ts"));
        String other = swapFolder(base, "views", "viewModels");
        if (other != null) {
            paths.add(other + ".js");
            paths.add(other + ".ts");
        }
        return paths;
    }

    /** The view paths of a view model (x.js or x.ts): x.html beside it, and js/views/x.html for js/viewModels/x.js. */
    static List<String> viewPaths(String viewModelPath) {
        String base = viewModelPath.substring(0, viewModelPath.lastIndexOf('.'));
        List<String> paths = new ArrayList<>(List.of(base + ".html"));
        String other = swapFolder(base, "viewModels", "views");
        if (other != null) {
            paths.add(other + ".html");
        }
        return paths;
    }

    private static String swapFolder(String base, String from, String to) {
        int at = base.lastIndexOf("/" + from + "/");
        if (at >= 0) {
            return base.substring(0, at) + "/" + to + "/" + base.substring(at + from.length() + 2);
        }
        return base.startsWith(from + "/") ? to + "/" + base.substring(from.length() + 1) : null;
    }
}
