package com.obdx.factory.pack;

import com.github.javaparser.JavaParser;
import com.github.javaparser.ParseResult;
import com.github.javaparser.ParserConfiguration;
import com.github.javaparser.ast.CompilationUnit;
import com.github.javaparser.ast.body.ClassOrInterfaceDeclaration;
import com.github.javaparser.ast.body.EnumDeclaration;
import com.github.javaparser.ast.body.MethodDeclaration;
import com.github.javaparser.ast.body.RecordDeclaration;
import com.github.javaparser.ast.body.TypeDeclaration;
import com.github.javaparser.ast.expr.MethodCallExpr;
import com.github.javaparser.ast.expr.ObjectCreationExpr;
import com.github.javaparser.ast.type.ClassOrInterfaceType;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Mistakes inside one Java class that stop it compiling, which a parser alone does not see: calls to methods the class
 * never declares (createValidEntry(...) used 31 times, never written), and a method declared twice with the same
 * parameters. Both fail the file. The first is not checked where the class may inherit or statically import the method.
 */
public final class JavaCompileChecks {

    public static final String UNDECLARED_RULE = "java-undeclared-method";
    public static final String DUPLICATE_RULE = "java-duplicate-method";

    /** Methods every object has, callable without a qualifier. */
    private static final Set<String> OBJECT_METHODS = Set.of("equals", "hashCode", "toString", "getClass", "notify", "notifyAll", "wait",
            "clone", "finalize");
    /** Methods every enum has. */
    private static final Set<String> ENUM_METHODS = Set.of("values", "valueOf", "name", "ordinal", "compareTo", "getDeclaringClass");

    private JavaCompileChecks() {
    }

    static List<LocalChecks.Finding> findings(String path, String original, String content) {
        CompilationUnit unit = parse(content);
        if (unit == null) {
            return List.of();
        }
        List<LocalChecks.Finding> found = new ArrayList<>();
        Set<String> before = original == null ? Set.of() : undeclaredCalls(original).keySet();
        undeclaredCalls(unit).forEach((name, line) -> {
            if (!before.contains(name)) {
                found.add(new LocalChecks.Finding(UNDECLARED_RULE, PackRule.Severity.ERROR, line, "Calls " + name + "(...), which this "
                        + "class does not declare. Write the method " + name + " in this class, or call one that exists."));
            }
        });
        for (Duplicate duplicate : duplicates(unit)) {
            found.add(new LocalChecks.Finding(DUPLICATE_RULE, PackRule.Severity.ERROR, duplicate.line(), "The method " + duplicate.signature()
                    + " is declared twice (also on line " + duplicate.firstLine() + "). Keep one of them."));
        }
        return found;
    }

    /**
     * Unqualified calls (foo(...)) to methods the file declares nowhere, by name with the line of the first call. Empty
     * when the file does not parse, has a wildcard static import, or a type in it (an anonymous class too) extends a
     * class or implements an interface that is not the JDK's: those bring methods this file does not show.
     */
    public static Map<String, Integer> undeclaredCalls(String content) {
        CompilationUnit unit = parse(content);
        return unit == null ? Map.of() : undeclaredCalls(unit);
    }

    private static Map<String, Integer> undeclaredCalls(CompilationUnit unit) {
        if (unit.getImports().stream().anyMatch(i -> i.isStatic() && i.isAsterisk()) || inherits(unit)) {
            return Map.of();
        }
        Set<String> declared = new HashSet<>(OBJECT_METHODS);
        unit.findAll(MethodDeclaration.class).forEach(m -> declared.add(m.getNameAsString()));
        unit.getImports().stream().filter(i -> i.isStatic()).forEach(i -> declared.add(i.getName().getIdentifier()));
        if (!unit.findAll(EnumDeclaration.class).isEmpty()) {
            declared.addAll(ENUM_METHODS);
        }
        // a record's accessors
        unit.findAll(RecordDeclaration.class).forEach(r -> r.getParameters().forEach(p -> declared.add(p.getNameAsString())));
        Map<String, Integer> undeclared = new LinkedHashMap<>();
        for (MethodCallExpr call : unit.findAll(MethodCallExpr.class)) {
            if (call.getScope().isEmpty() && !declared.contains(call.getNameAsString())) {
                undeclared.putIfAbsent(call.getNameAsString(), call.getBegin().map(p -> p.line).orElse(0));
            }
        }
        return undeclared;
    }

    /**
     * Whether a type of the file has methods it does not declare: a class that extends another (even the JDK's: Thread,
     * TestCase), a type implementing an interface that is not the JDK's (its default methods), or an anonymous class of a
     * type that is not the JDK's.
     */
    private static boolean inherits(CompilationUnit unit) {
        for (TypeDeclaration<?> type : unit.findAll(TypeDeclaration.class)) {
            if (type instanceof ClassOrInterfaceDeclaration c && (!c.isInterface() && !c.getExtendedTypes().isEmpty()
                    || c.isInterface() && c.getExtendedTypes().stream().anyMatch(t -> !jdk(unit, t))
                    || c.getImplementedTypes().stream().anyMatch(t -> !jdk(unit, t)))) {
                return true;
            }
            if (type instanceof RecordDeclaration r && r.getImplementedTypes().stream().anyMatch(t -> !jdk(unit, t))
                    || type instanceof EnumDeclaration e && e.getImplementedTypes().stream().anyMatch(t -> !jdk(unit, t))) {
                return true;
            }
        }
        // Any anonymous class inherits its methods, the JDK's too: new HashMap<>() {{ put(...); }}, new TimerTask() { ... cancel(); }
        return unit.findAll(ObjectCreationExpr.class).stream().anyMatch(o -> o.getAnonymousClassBody().isPresent());
    }

    /** A type of the JDK: imported from java.* or javax.*, written with such a package, or of java.lang. */
    private static boolean jdk(CompilationUnit unit, ClassOrInterfaceType type) {
        String name = type.getNameAsString();
        String imported = unit.getImports().stream().filter(i -> !i.isAsterisk() && i.getName().getIdentifier().equals(name))
                .map(i -> i.getNameAsString()).findFirst().orElse(null);
        if (imported != null) {
            return imported.startsWith("java.") || imported.startsWith("javax.");
        }
        if (type.getScope().isPresent()) {
            return type.getScope().get().toString().startsWith("java.");
        }
        try {
            Class.forName("java.lang." + name, false, JavaCompileChecks.class.getClassLoader());
            return true;
        } catch (ClassNotFoundException | LinkageError e) {
            return false;
        }
    }

    /** A method declared a second time with the same name and parameter types in the same class. */
    public record Duplicate(String signature, int firstLine, int line, int endLine, int fromLine) {
    }

    /** The second (and later) declarations of a method with the same name and parameter types in one class. */
    public static List<Duplicate> duplicates(String content) {
        CompilationUnit unit = parse(content);
        return unit == null ? List.of() : duplicates(unit);
    }

    private static List<Duplicate> duplicates(CompilationUnit unit) {
        List<Duplicate> duplicates = new ArrayList<>();
        for (TypeDeclaration<?> type : unit.findAll(TypeDeclaration.class)) {
            Map<String, Integer> seen = new LinkedHashMap<>();
            for (MethodDeclaration method : type.getMethods()) {
                if (!method.getTypeParameters().isEmpty()) {
                    // generic methods may differ only by their bounds: not told apart here
                    continue;
                }
                String signature = method.getNameAsString() + "(" + String.join(", ", method.getParameters().stream()
                        .map(p -> p.getType().asString().replaceAll("\\s+", "") + (p.isVarArgs() ? "..." : "")).toList()) + ")";
                int line = method.getBegin().map(p -> p.line).orElse(0);
                Integer first = seen.putIfAbsent(signature, line);
                if (first != null) {
                    // from its Javadoc or comment, so the whole declaration can be taken out
                    int from = method.getComment().flatMap(c -> c.getBegin()).map(p -> p.line).orElse(line);
                    duplicates.add(new Duplicate(signature, first, line, method.getEnd().map(p -> p.line).orElse(line), from));
                }
            }
        }
        return duplicates;
    }

    /**
     * A method declaration on one line (checked line by line, lines over 300 characters skipped). Parameters may carry
     * annotations with arguments (@PathParam("id")); every part is possessive and the throws clause unambiguous, so no
     * line can make it backtrack for long.
     */
    private static final Pattern METHOD = Pattern.compile("^\\s*+(?:@\\w++(?:\\([^()]*+\\))?\\s++)*+(?:(?:public|protected|private|static|final|"
            + "synchronized|abstract|default)\\s++)*+(?:<[^>]*+>\\s*+)?[\\w<>\\[\\],.?]++(?:\\s*+<[^>]*+>)?\\s++(\\w++)\\s*+"
            + "\\((?:[^()]|\\([^()]*+\\))*+\\)\\s*+(?:throws\\s++[\\w.]++(?:\\s*+,\\s*+[\\w.]++)*+)?\\s*+\\{");
    /** After a name's parameter list: the start of its body, so the name is declared there, not called. */
    private static final Pattern BODY_AFTER = Pattern.compile("\\s*+(?:throws\\s++[\\w.]++(?:\\s*+,\\s*+[\\w.]++)*+)?\\s*+\\{");
    static final int LONGEST_LINE = 300;
    private static final Pattern FIELD = Pattern.compile("(?m)^\\s*(?:private|protected|public)\\s+(?:static\\s+)?(?:final\\s+)?"
            + "[\\w<>\\[\\],.? ]+?\\s+(\\w+)\\s*(?:=|;)");
    private static final Pattern CALL = Pattern.compile("(?<![\\w$.])([a-z_]\\w*)\\s*\\(");
    private static final Pattern STATIC_IMPORT = Pattern.compile("(?m)^\\s*import\\s+static\\s+[\\w.]+\\.(\\w+|\\*)\\s*;");
    private static final Set<String> KEYWORDS = Set.of("if", "for", "while", "switch", "catch", "synchronized", "return", "new", "throw",
            "super", "this", "assert", "try", "else", "do", "case");

    /** What a file cut off part-way already has, and what it calls but has not written yet: for a continuation. */
    public record Outline(Set<String> methods, Set<String> fields, Set<String> missing) {
    }

    /**
     * The outline of a part of a Java file that does not parse yet (it is cut off): the methods and fields it declares,
     * and the methods it calls without a qualifier that it does not declare (none are told when it has a wildcard static
     * import, or its class extends another).
     */
    public static Outline outline(String partial) {
        SourceScan.Parts parts = SourceScan.scan(partial, SourceScan.Syntax.CODE);
        List<SourceScan.Range> literal = new ArrayList<>(parts.comments());
        literal.addAll(parts.strings());
        String code = SourceScan.blank(partial, literal);
        Set<String> methods = new LinkedHashSet<>();
        for (String line : code.split("\n")) {
            if (line.length() > LONGEST_LINE) {
                continue;
            }
            Matcher m = METHOD.matcher(line);
            if (m.find() && !KEYWORDS.contains(m.group(1))) {
                methods.add(m.group(1));
            }
        }
        Set<String> fields = new LinkedHashSet<>();
        Matcher f = FIELD.matcher(code);
        while (f.find()) {
            fields.add(f.group(1));
        }
        Set<String> missing = new LinkedHashSet<>();
        Set<String> imported = new HashSet<>();
        Matcher s = STATIC_IMPORT.matcher(partial);
        boolean wildcard = false;
        while (s.find()) {
            wildcard |= s.group(1).equals("*");
            imported.add(s.group(1));
        }
        boolean extendsAnother = Pattern.compile("\\bclass\\s+\\w+(?:\\s*<[^>]*>)?\\s+extends\\b").matcher(code).find();
        if (!wildcard && !extendsAnother) {
            Matcher c = CALL.matcher(code);
            while (c.find()) {
                String name = c.group(1);
                if (KEYWORDS.contains(name)) {
                    continue;
                }
                if (declaredAt(code, c.end() - 1)) {
                    // the name, its parameter list, then its body: a declaration the line-by-line pattern did not read
                    methods.add(name);
                    missing.remove(name);
                    continue;
                }
                if (!KEYWORDS.contains(name) && !methods.contains(name) && !imported.contains(name) && !OBJECT_METHODS.contains(name)) {
                    missing.add(name);
                }
            }
        }
        return new Outline(methods, fields, missing);
    }

    /** Whether the parenthesis at open starts a parameter list followed by a body ({, or throws ... {). */
    private static boolean declaredAt(String code, int open) {
        int depth = 0;
        int limit = Math.min(code.length(), open + 2000);
        for (int i = open; i < limit; i++) {
            char c = code.charAt(i);
            if (c == '(') {
                depth++;
            } else if (c == ')' && --depth == 0) {
                Matcher body = BODY_AFTER.matcher(code).region(i + 1, Math.min(code.length(), i + 1 + LONGEST_LINE));
                return body.lookingAt();
            }
        }
        return false;
    }

    private static CompilationUnit parse(String content) {
        if (content == null) {
            return null;
        }
        ParseResult<CompilationUnit> result = new JavaParser(new ParserConfiguration()
                .setLanguageLevel(ParserConfiguration.LanguageLevel.JAVA_21)).parse(content);
        return result.isSuccessful() ? result.getResult().orElse(null) : null;
    }
}
