package com.obdx.factory.change;

import com.github.javaparser.JavaParser;
import com.github.javaparser.ParseResult;
import com.github.javaparser.ParserConfiguration;
import com.github.javaparser.ast.CompilationUnit;
import com.github.javaparser.ast.body.FieldDeclaration;
import com.github.javaparser.ast.body.MethodDeclaration;
import com.github.javaparser.ast.body.Parameter;
import com.github.javaparser.ast.body.VariableDeclarator;
import com.github.javaparser.ast.expr.FieldAccessExpr;
import com.github.javaparser.ast.expr.MethodCallExpr;
import com.github.javaparser.ast.expr.NameExpr;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Checks between the Java files of a change that one file alone cannot show: classes of the change's own package that
 * the plan creates but that are not written (the file uses them without an import), and calls to methods that the
 * called class of the change does not have (a resource calling service.save(...) where the service has saveTransfer).
 */
final class CrossFileJava {

    static final String UNWRITTEN = "Uses classes of the plan that are not written yet";
    static final String MISSING_METHODS = "Calls methods that";
    static final String MISSING_NESTED = "Uses nested types that";

    /** Methods of every Java object, with their numbers of parameters (-1: several). */
    private static final Map<String, Integer> OBJECT_METHODS = Map.of("equals", 1, "hashCode", 0, "toString", 0, "getClass", 0,
            "notify", 0, "notifyAll", 0, "wait", -1, "clone", 0);
    /** Methods every enum has. */
    private static final Map<String, Integer> ENUM_METHODS = Map.of("name", 0, "ordinal", 0, "values", 0, "valueOf", 1,
            "compareTo", 1, "getDeclaringClass", 0, "describeConstable", 0);
    /** Lombok annotations that generate methods. */
    private static final Set<String> LOMBOK = Set.of("Data", "Getter", "Setter", "Value", "Builder", "SuperBuilder", "Delegate",
            "With", "Wither", "Accessors", "ToString", "EqualsAndHashCode", "RequiredArgsConstructor", "AllArgsConstructor");

    private CrossFileJava() {
    }

    /**
     * Same-package classes the file uses that the plan creates but that are not written.
     *
     * @param unwritten planned .java files not written yet (paths)
     */
    static Optional<String> unwrittenClasses(String path, String content, List<String> unwritten) {
        String folder = path.contains("/") ? path.substring(0, path.lastIndexOf('/') + 1) : "";
        Set<String> used = new LinkedHashSet<>();
        // Names in comments and strings ("see TransferDTO") are no use of the class
        com.obdx.factory.pack.SourceScan.Parts parts = com.obdx.factory.pack.SourceScan.scan(content, com.obdx.factory.pack.SourceScan.Syntax.CODE);
        List<com.obdx.factory.pack.SourceScan.Range> literal = new ArrayList<>(parts.comments());
        literal.addAll(parts.strings());
        String code = com.obdx.factory.pack.SourceScan.blank(content, literal);
        for (String other : unwritten) {
            String otherFolder = other.contains("/") ? other.substring(0, other.lastIndexOf('/') + 1) : "";
            String name = other.substring(other.lastIndexOf('/') + 1).replaceAll("\\.java$", "");
            if (other.endsWith(".java") && otherFolder.equals(folder) && Pattern.compile("\\b" + Pattern.quote(name) + "\\b")
                    .matcher(code).find()) {
                used.add(name);
            }
        }
        return used.isEmpty() ? Optional.empty() : Optional.of(UNWRITTEN + ": " + String.join(", ", used)
                + ". Write them (Continue generation or Write again), or remove the use.");
    }

    /**
     * Calls from this file to methods that a class written in the change does not declare (by name, and by the number
     * of arguments when the name exists).
     *
     * @param classes the change's written Java files: class name to content
     */
    static List<String> missingMethods(String content, Map<String, String> classes) {
        CompilationUnit unit = parse(content);
        if (unit == null) {
            return List.of();
        }
        // Fields, parameters and variables whose type is a class of the change
        Map<String, String> typeOf = new HashMap<>();
        unit.findAll(FieldDeclaration.class).forEach(f -> f.getVariables().forEach(v -> note(typeOf, v.getNameAsString(), v.getTypeAsString(), classes)));
        unit.findAll(VariableDeclarator.class).forEach(v -> note(typeOf, v.getNameAsString(), v.getTypeAsString(), classes));
        unit.findAll(Parameter.class).forEach(p -> note(typeOf, p.getNameAsString(), p.getTypeAsString(), classes));
        Map<String, Map<String, Set<Integer>>> declared = new HashMap<>();
        List<String> problems = new ArrayList<>();
        Map<String, Set<String>> missing = new java.util.LinkedHashMap<>();
        // Every name that is a variable here: TransferService.validate(...) is a static call only when no variable has that name
        Set<String> variables = new java.util.HashSet<>();
        unit.findAll(VariableDeclarator.class).forEach(v -> variables.add(v.getNameAsString()));
        unit.findAll(Parameter.class).forEach(p -> variables.add(p.getNameAsString()));
        for (MethodCallExpr call : unit.findAll(MethodCallExpr.class)) {
            String variable = call.getScope().map(s -> s instanceof NameExpr n ? n.getNameAsString()
                    : s instanceof FieldAccessExpr f && f.getScope().isThisExpr() ? f.getNameAsString() : null).orElse(null);
            String type = variable == null ? null : typeOf.get(variable);
            if (type == null && variable != null && !variables.contains(variable) && classes.containsKey(variable)
                    && call.getScope().orElse(null) instanceof NameExpr) {
                // A static call on a class of the change
                type = variable;
            }
            if (type == null) {
                continue;
            }
            Map<String, Set<Integer>> methods = declared.computeIfAbsent(type, t -> methods(classes.get(t)));
            if (methods == null) {
                continue;
            }
            Set<Integer> arities = methods.get(call.getNameAsString());
            if (arities == null) {
                missing.computeIfAbsent(type, t -> new LinkedHashSet<>()).add(call.getNameAsString() + "()");
            } else if (!arities.contains(-1) && !arities.contains(call.getArguments().size())) {
                missing.computeIfAbsent(type, t -> new LinkedHashSet<>()).add(call.getNameAsString() + " with " + call.getArguments().size()
                        + " argument(s)");
            }
        }
        missing.forEach((type, calls) -> problems.add(MISSING_METHODS + " " + type + " does not have: " + String.join(", ", calls)
                + ". Use the methods " + type + " declares, or add them to it."));
        problems.addAll(missingNestedTypes(unit, classes, variables));
        return problems;
    }

    /**
     * References to Outer.Inner (as a type, in new Outer.Inner(), or as Outer.Inner.VALUE) where the written Outer class
     * declares no nested type, field or constant Inner.
     */
    private static List<String> missingNestedTypes(CompilationUnit unit, Map<String, String> classes, Set<String> variables) {
        Map<String, Set<String>> missing = new java.util.LinkedHashMap<>();
        Map<String, Set<String>> declared = new HashMap<>();
        java.util.function.BiConsumer<String, String> check = (outer, inner) -> {
            Set<String> members = declared.computeIfAbsent(outer, o -> members(classes.get(o)));
            if (members != null && !members.contains(inner)) {
                missing.computeIfAbsent(outer, o -> new LinkedHashSet<>()).add(inner);
            }
        };
        for (com.github.javaparser.ast.type.ClassOrInterfaceType type : unit.findAll(com.github.javaparser.ast.type.ClassOrInterfaceType.class)) {
            type.getScope().ifPresent(scope -> {
                if (scope.getScope().isEmpty() && classes.containsKey(scope.getNameAsString())) {
                    check.accept(scope.getNameAsString(), type.getNameAsString());
                }
            });
        }
        for (FieldAccessExpr access : unit.findAll(FieldAccessExpr.class)) {
            if (access.getScope() instanceof NameExpr n && classes.containsKey(n.getNameAsString()) && !variables.contains(n.getNameAsString())
                    && access.getNameAsString().matches("[A-Z][a-z]\\w*")) {
                // Outer.Inner (a CamelCase name: a nested type); Outer.CONSTANT is a field and is not checked here
                check.accept(n.getNameAsString(), access.getNameAsString());
            }
        }
        List<String> problems = new ArrayList<>();
        missing.forEach((outer, names) -> problems.add(MISSING_NESTED + " " + outer + " does not declare: " + String.join(", ",
                names.stream().map(n -> outer + "." + n).toList()) + ". Use the types " + outer + " declares, or add them to it."));
        return problems;
    }

    /** The nested types, fields and enum constants a class declares; null when it does not parse or inherits some. */
    private static Set<String> members(String content) {
        CompilationUnit unit = parse(content);
        if (unit == null || unit.getTypes().isEmpty() || !unit.findAll(com.github.javaparser.ast.body.ClassOrInterfaceDeclaration.class).stream()
                .allMatch(c -> c.getExtendedTypes().isEmpty() && c.getImplementedTypes().isEmpty())) {
            return null;
        }
        Set<String> names = new java.util.HashSet<>();
        unit.findAll(com.github.javaparser.ast.body.TypeDeclaration.class).forEach(t -> names.add(t.getNameAsString()));
        unit.findAll(FieldDeclaration.class).forEach(f -> f.getVariables().forEach(v -> names.add(v.getNameAsString())));
        unit.findAll(com.github.javaparser.ast.body.EnumConstantDeclaration.class).forEach(e -> names.add(e.getNameAsString()));
        return names;
    }

    private static void note(Map<String, String> typeOf, String variable, String type, Map<String, String> classes) {
        String simple = type.replaceAll("<.*>", "").replaceAll(".*\\.", "");
        if (classes.containsKey(simple)) {
            typeOf.put(variable, simple);
        }
    }

    /** Method name to its numbers of parameters (-1: takes varargs); null when the class does not parse. */
    private static Map<String, Set<Integer>> methods(String content) {
        CompilationUnit unit = parse(content);
        if (unit == null) {
            return null;
        }
        if (!unit.findAll(com.github.javaparser.ast.body.ClassOrInterfaceDeclaration.class).stream()
                .allMatch(c -> c.getExtendedTypes().isEmpty() && c.getImplementedTypes().isEmpty())
                || unit.findAll(com.github.javaparser.ast.body.RecordDeclaration.class).stream().anyMatch(r -> !r.getImplementedTypes().isEmpty())
                || unit.findAll(com.github.javaparser.ast.body.EnumDeclaration.class).stream().anyMatch(e -> !e.getImplementedTypes().isEmpty())
                || unit.getImports().stream().anyMatch(i -> i.getNameAsString().startsWith("lombok"))
                || unit.findAll(com.github.javaparser.ast.expr.AnnotationExpr.class).stream()
                .anyMatch(a -> LOMBOK.contains(a.getNameAsString().replaceAll("^lombok\\.(experimental\\.)?", "")))) {
            // Inherited methods, an interface's default methods and the methods Lombok generates are not known here
            return null;
        }
        Map<String, Set<Integer>> methods = new HashMap<>();
        // Every object has these
        OBJECT_METHODS.forEach((name, arity) -> methods.computeIfAbsent(name, n -> new LinkedHashSet<>()).add(arity));
        for (com.github.javaparser.ast.body.RecordDeclaration record : unit.findAll(com.github.javaparser.ast.body.RecordDeclaration.class)) {
            record.getParameters().forEach(p -> methods.computeIfAbsent(p.getNameAsString(), n -> new LinkedHashSet<>()).add(0));
        }
        if (!unit.findAll(com.github.javaparser.ast.body.EnumDeclaration.class).isEmpty()) {
            ENUM_METHODS.forEach((name, arity) -> methods.computeIfAbsent(name, n -> new LinkedHashSet<>()).add(arity));
        }
        for (MethodDeclaration m : unit.findAll(MethodDeclaration.class)) {
            boolean varargs = m.getParameters().stream().anyMatch(Parameter::isVarArgs);
            methods.computeIfAbsent(m.getNameAsString(), n -> new LinkedHashSet<>()).add(varargs ? -1 : m.getParameters().size());
        }
        return methods;
    }

    private static CompilationUnit parse(String content) {
        if (content == null) {
            return null;
        }
        ParseResult<CompilationUnit> result = new JavaParser(new ParserConfiguration()
                .setLanguageLevel(ParserConfiguration.LanguageLevel.JAVA_21)).parse(content);
        return result.isSuccessful() ? result.getResult().orElse(null) : null;
    }

    /** The class name of a Java file (FundTransferService.java -> FundTransferService). */
    static String className(String path) {
        return path.substring(path.lastIndexOf('/') + 1).replaceAll("\\.java$", "");
    }
}
