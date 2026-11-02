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
        unit.findAll(FieldDeclaration.class).forEach(f -> f.getVariables().forEach(v -> note(typeOf, v.getNameAsString(), v.getTypeAsString(), classes, unit)));
        unit.findAll(VariableDeclarator.class).forEach(v -> note(typeOf, v.getNameAsString(), v.getTypeAsString(), classes, unit));
        unit.findAll(Parameter.class).forEach(p -> note(typeOf, p.getNameAsString(), p.getTypeAsString(), classes, unit));
        Map<String, Map<String, Set<Integer>>> declared = new HashMap<>();
        List<String> problems = new ArrayList<>();
        Map<String, Set<String>> missing = new java.util.LinkedHashMap<>();
        // Every name that is a variable here: TransferService.validate(...) is a static call only when no variable has that name
        Set<String> variables = new java.util.HashSet<>();
        unit.findAll(VariableDeclarator.class).forEach(v -> variables.add(v.getNameAsString()));
        unit.findAll(Parameter.class).forEach(p -> variables.add(p.getNameAsString()));
        // A simple name imported from another package than the written class's is another class: not checked against it
        unit.getImports().stream().filter(i -> !i.isAsterisk() && !i.isStatic()).forEach(i -> {
            String simple = i.getName().getIdentifier();
            String pkg = i.getName().getQualifier().map(Object::toString).orElse("");
            if (classes.containsKey(simple) && !pkg.equals(packageOf(classes.get(simple)))) {
                variables.add(simple);
            }
        });
        for (MethodCallExpr call : unit.findAll(MethodCallExpr.class)) {
            String variable = call.getScope().map(s -> s instanceof NameExpr n ? n.getNameAsString()
                    : s instanceof FieldAccessExpr f && f.getScope().isThisExpr() ? f.getNameAsString() : null).orElse(null);
            String type = variable == null ? null : typeOf.get(variable);
            if (type == null && variable != null && !variables.contains(variable) && classes.containsKey(variable)
                    && call.getScope().orElse(null) instanceof NameExpr && resolvesTo(variable, variable, unit, classes)) {
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
                if (scope.getScope().isEmpty() && classes.containsKey(scope.getNameAsString()) && resolvesTo(scope.getNameAsString(), scope.getNameAsString(), unit, classes)
                        && !variables.contains(scope.getNameAsString())) {
                    check.accept(scope.getNameAsString(), type.getNameAsString());
                }
            });
        }
        for (FieldAccessExpr access : unit.findAll(FieldAccessExpr.class)) {
            if (access.getScope() instanceof NameExpr n && classes.containsKey(n.getNameAsString()) && !variables.contains(n.getNameAsString()) && resolvesTo(n.getNameAsString(), n.getNameAsString(), unit, classes)
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
        // Members inherited from a superclass or an interface (records and enums implement them too) are not known here
        if (unit == null || unit.getTypes().isEmpty() || !unit.findAll(com.github.javaparser.ast.body.ClassOrInterfaceDeclaration.class).stream()
                .allMatch(c -> c.getExtendedTypes().isEmpty() && c.getImplementedTypes().isEmpty())
                || unit.findAll(com.github.javaparser.ast.body.RecordDeclaration.class).stream().anyMatch(r -> !r.getImplementedTypes().isEmpty())
                || unit.findAll(com.github.javaparser.ast.body.EnumDeclaration.class).stream().anyMatch(e -> !e.getImplementedTypes().isEmpty())) {
            return null;
        }
        Set<String> names = new java.util.HashSet<>();
        unit.findAll(com.github.javaparser.ast.body.TypeDeclaration.class).forEach(t -> names.add(t.getNameAsString()));
        unit.findAll(FieldDeclaration.class).forEach(f -> f.getVariables().forEach(v -> names.add(v.getNameAsString())));
        unit.findAll(com.github.javaparser.ast.body.EnumConstantDeclaration.class).forEach(e -> names.add(e.getNameAsString()));
        return names;
    }

    private static void note(Map<String, String> typeOf, String variable, String type, Map<String, String> classes, CompilationUnit unit) {
        String raw = type.replaceAll("<.*>", "");
        String simple = raw.replaceAll(".*\\.", "");
        if (classes.containsKey(simple) && resolvesTo(raw, simple, unit, classes)) {
            typeOf.put(variable, simple);
        } else {
            // a variable of another class with the name (javax.validation.Validator): not one of the change's
            typeOf.remove(variable);
        }
    }

    /**
     * Whether a type as the file writes it (Validator, com.bank.x.Validator) is the change's class of that name: written
     * with its package, imported from its package, or used without an import from the file's own package (or a wildcard
     * import of the class's package).
     */
    static boolean resolvesTo(String raw, String simple, CompilationUnit unit, Map<String, String> classes) {
        String classPackage = packageOf(classes.get(simple));
        if (raw.contains(".")) {
            return raw.substring(0, raw.lastIndexOf('.')).equals(classPackage);
        }
        for (com.github.javaparser.ast.ImportDeclaration i : unit.getImports()) {
            if (!i.isAsterisk() && !i.isStatic() && i.getName().getIdentifier().equals(simple)) {
                return i.getName().getQualifier().map(Object::toString).orElse("").equals(classPackage);
            }
        }
        String own = unit.getPackageDeclaration().map(p -> p.getNameAsString()).orElse("");
        return own.equals(classPackage) || unit.getImports().stream().anyMatch(i -> i.isAsterisk() && !i.isStatic()
                && i.getNameAsString().equals(classPackage));
    }

    /** Method name to its numbers of parameters (-1: takes varargs); null when the class does not parse. */
    private static Map<String, Set<Integer>> methods(String content) {
        CompilationUnit unit = parse(content);
        if (unit == null) {
            return null;
        }
        // Only the file's own (top-level) types count: a nested HostLookupCallable implements Callable adds nothing to them
        if (unit.getTypes().stream().anyMatch(CrossFileJava::inherits)
                || unit.getImports().stream().anyMatch(i -> i.getNameAsString().startsWith("lombok"))
                || unit.findAll(com.github.javaparser.ast.expr.AnnotationExpr.class).stream()
                .anyMatch(a -> LOMBOK.contains(a.getNameAsString().replaceAll("^lombok\\.(experimental\\.)?", "")))) {
            // Inherited methods, an interface's default methods and the methods Lombok generates are not known here
            return null;
        }
        Map<String, Set<Integer>> methods = new HashMap<>();
        // Every object has these
        OBJECT_METHODS.forEach((name, arity) -> methods.computeIfAbsent(name, n -> new LinkedHashSet<>()).add(arity));
        // The methods of the file's own types, not of the classes nested in them
        for (com.github.javaparser.ast.body.TypeDeclaration<?> type : unit.getTypes()) {
            if (type instanceof com.github.javaparser.ast.body.RecordDeclaration record) {
                record.getParameters().forEach(p -> methods.computeIfAbsent(p.getNameAsString(), n -> new LinkedHashSet<>()).add(0));
            }
            if (type instanceof com.github.javaparser.ast.body.EnumDeclaration) {
                ENUM_METHODS.forEach((name, arity) -> methods.computeIfAbsent(name, n -> new LinkedHashSet<>()).add(arity));
            }
        }
        for (MethodDeclaration m : unit.getTypes().stream().flatMap(t -> t.getMethods().stream()).toList()) {
            boolean varargs = m.getParameters().stream().anyMatch(Parameter::isVarArgs);
            methods.computeIfAbsent(m.getNameAsString(), n -> new LinkedHashSet<>()).add(varargs ? -1 : m.getParameters().size());
        }
        return methods;
    }

    static final String UNKNOWN_RECEIVERS = "Calls methods on names it does not declare";
    static final String MISSING_IMPORTS = "Uses JDK classes without importing them";
    static final String UNKNOWN_CLASSES = "Uses classes of its package that do not exist";

    /**
     * validationService.validateFormat(...) where the file declares no field, parameter or local variable
     * validationService: it does not compile. Not checked in a class that extends another (it may inherit the field),
     * with Lombok (a generated logger) or with a static import of all of a class's members.
     */
    static Optional<String> unknownReceivers(String content) {
        CompilationUnit unit = parse(content);
        if (unit == null || unit.getTypes().stream().anyMatch(t -> t instanceof com.github.javaparser.ast.body.ClassOrInterfaceDeclaration c
                && !c.isInterface() && !c.getExtendedTypes().isEmpty()) || lombok(unit)
                || unit.getImports().stream().anyMatch(i -> i.isStatic() && i.isAsterisk())) {
            return Optional.empty();
        }
        Set<String> declared = new java.util.HashSet<>();
        unit.findAll(VariableDeclarator.class).forEach(v -> declared.add(v.getNameAsString()));
        unit.findAll(Parameter.class).forEach(p -> declared.add(p.getNameAsString()));
        unit.findAll(com.github.javaparser.ast.body.EnumConstantDeclaration.class).forEach(e -> declared.add(e.getNameAsString()));
        unit.findAll(com.github.javaparser.ast.expr.TypePatternExpr.class).forEach(p -> declared.add(p.getNameAsString()));
        unit.getImports().stream().filter(i -> i.isStatic()).forEach(i -> declared.add(i.getName().getIdentifier()));
        Set<String> unknown = new LinkedHashSet<>();
        for (MethodCallExpr call : unit.findAll(MethodCallExpr.class)) {
            if (call.getScope().orElse(null) instanceof NameExpr scope) {
                String name = scope.getNameAsString();
                if (Character.isLowerCase(name.charAt(0)) && !declared.contains(name) && !inInheritingClass(unit, call)) {
                    unknown.add(name);
                }
            }
        }
        return unknown.isEmpty() ? Optional.empty() : Optional.of(UNKNOWN_RECEIVERS + ": " + String.join(", ", unknown)
                + ". Declare them (a field, a parameter or a local variable), or call an object the class has.");
    }

    /**
     * Whether a node lies in an anonymous class of a type not the JDK's (new AbstractHandler() { ... }), or a nested class
     * extending one: that class may inherit fields the file does not show.
     */
    private static boolean inInheritingClass(CompilationUnit unit, com.github.javaparser.ast.Node node) {
        for (com.github.javaparser.ast.Node n = node.getParentNode().orElse(null); n != null; n = n.getParentNode().orElse(null)) {
            if (n instanceof com.github.javaparser.ast.expr.ObjectCreationExpr o && o.getAnonymousClassBody().isPresent() && !jdkType(unit, o.getType())) {
                return true;
            }
            if (n instanceof com.github.javaparser.ast.body.ClassOrInterfaceDeclaration c && !c.isInterface()
                    && c.getExtendedTypes().stream().anyMatch(s -> !jdkType(unit, s))) {
                return true;
            }
        }
        return false;
    }

    /** Common JDK classes outside java.lang, by simple name: a file using one needs its import. */
    private static final Map<String, String> JDK = jdkClasses();

    private static Map<String, String> jdkClasses() {
        Map<String, String> jdk = new HashMap<>();
        for (String name : List.of("List", "ArrayList", "LinkedList", "Map", "HashMap", "LinkedHashMap", "TreeMap", "Set", "HashSet",
                "LinkedHashSet", "TreeSet", "Optional", "Arrays", "Collections", "Objects", "UUID", "Collection", "Iterator", "Deque",
                "ArrayDeque", "Queue", "Locale", "Date", "Calendar", "StringJoiner", "EnumMap", "EnumSet", "ResourceBundle",
                "MissingResourceException", "Properties", "Random", "Base64", "Comparator", "NoSuchElementException", "TimeZone",
                "Currency", "SortedMap", "NavigableMap", "ListIterator", "Hashtable", "Vector", "Stack", "TimerTask", "BitSet")) {
            jdk.put(name, "java.util");
        }
        for (String name : List.of("Collectors", "Stream", "IntStream", "LongStream")) {
            jdk.put(name, "java.util.stream");
        }
        for (String name : List.of("ExecutorService", "Executors", "Future", "Callable", "CompletableFuture", "TimeUnit", "TimeoutException",
                "ExecutionException", "ConcurrentHashMap", "ConcurrentMap", "CountDownLatch", "CopyOnWriteArrayList", "Semaphore",
                "ScheduledExecutorService", "ThreadLocalRandom", "CompletionService", "ExecutorCompletionService")) {
            jdk.put(name, "java.util.concurrent");
        }
        for (String name : List.of("AtomicInteger", "AtomicLong", "AtomicBoolean", "AtomicReference")) {
            jdk.put(name, "java.util.concurrent.atomic");
        }
        for (String name : List.of("Function", "Supplier", "Consumer", "Predicate", "BiFunction", "BiConsumer", "UnaryOperator", "BinaryOperator")) {
            jdk.put(name, "java.util.function");
        }
        for (String name : List.of("Pattern", "Matcher", "PatternSyntaxException")) {
            jdk.put(name, "java.util.regex");
        }
        for (String name : List.of("BigDecimal", "BigInteger", "RoundingMode", "MathContext")) {
            jdk.put(name, "java.math");
        }
        for (String name : List.of("LocalDate", "LocalDateTime", "LocalTime", "Instant", "Duration", "ZonedDateTime", "OffsetDateTime",
                "Period", "ZoneId", "ZoneOffset", "Clock", "YearMonth", "DayOfWeek")) {
            jdk.put(name, "java.time");
        }
        for (String name : List.of("DateTimeFormatter", "DateTimeParseException")) {
            jdk.put(name, "java.time.format");
        }
        jdk.put("ChronoUnit", "java.time.temporal");
        for (String name : List.of("SimpleDateFormat", "DecimalFormat", "NumberFormat", "MessageFormat", "ParseException")) {
            jdk.put(name, "java.text");
        }
        for (String name : List.of("IOException", "UncheckedIOException", "InputStream", "OutputStream", "Serializable", "BufferedReader",
                "InputStreamReader", "Closeable")) {
            jdk.put(name, "java.io");
        }
        jdk.put("StandardCharsets", "java.nio.charset");
        for (String name : List.of("SQLException", "Timestamp", "PreparedStatement", "ResultSet")) {
            jdk.put(name, "java.sql");
        }
        return Map.copyOf(jdk);
    }

    /** HashMap, List, Collectors ... used without their import (and without a wildcard import of their package). */
    static Optional<String> missingJdkImports(String content) {
        return missingJdkImports(content, classFile -> false);
    }

    /**
     * As above, leaving out names a class of the file's own package has (com/bank/x/Currency.java): the file then uses
     * that class, which needs no import.
     *
     * @param classExists whether a class file (com/bank/x/Name.java) is planned, written or imported
     */
    static Optional<String> missingJdkImports(String content, java.util.function.Predicate<String> classExists) {
        CompilationUnit unit = parse(content);
        // A wildcard import of another package (com.ofss.fc.datatype.*, java.sql.*) may bring a class of the name (OBDX's own
        // Date), and a supertype not of the JDK may declare a nested one: either way the name may not be the JDK's
        if (unit == null || unit.findAll(com.github.javaparser.ast.body.TypeDeclaration.class).stream().anyMatch(t -> inheritsFromOutsideTheJdk(unit, t))) {
            return Optional.empty();
        }
        String own = unit.getPackageDeclaration().map(p -> p.getNameAsString()).orElse("");
        Set<String> imported = new java.util.HashSet<>();
        Set<String> wildcards = new java.util.HashSet<>();
        unit.getImports().stream().filter(i -> !i.isStatic()).forEach(i -> {
            if (i.isAsterisk()) {
                wildcards.add(i.getNameAsString());
            } else {
                imported.add(i.getName().getIdentifier());
            }
        });
        Set<String> declared = declaredTypes(unit);
        Set<String> missing = new java.util.TreeSet<>();
        String folder = own.replace('.', '/');
        for (String name : usedTypes(unit)) {
            String pkg = JDK.get(name);
            if (pkg != null && !imported.contains(name) && !wildcards.contains(pkg) && !pkg.equals(own) && !declared.contains(name)
                    && !classExists.test(folder + "/" + name + ".java")
                    && wildcards.stream().noneMatch(w -> !JDK.containsValue(w) || w.equals("java.sql") && name.equals("Date"))) {
                missing.add(name + " (" + pkg + "." + name + ")");
            }
        }
        return missing.isEmpty() ? Optional.empty() : Optional.of(MISSING_IMPORTS + ": " + String.join(", ", missing) + ". Add the imports.");
    }

    /**
     * Classes of the file's own package (used without an import) that are nowhere: not planned, not written, not in the
     * imported code (AuditRepository). Not checked with wildcard imports, which could bring the class, nor in a class
     * that extends another (it may inherit nested types).
     *
     * @param classExists whether a class file (com/bank/x/Name.java) is planned, written or imported
     */
    static Optional<String> unknownSamePackageClasses(String content, java.util.function.Predicate<String> classExists) {
        CompilationUnit unit = parse(content);
        if (unit == null || unit.getPackageDeclaration().isEmpty() || unit.getImports().stream().anyMatch(i -> i.isAsterisk())
                || unit.findAll(com.github.javaparser.ast.body.TypeDeclaration.class).stream().anyMatch(t -> inheritsFromOutsideTheJdk(unit, t))
                || unit.findAll(com.github.javaparser.ast.expr.ObjectCreationExpr.class).stream()
                .anyMatch(o -> o.getAnonymousClassBody().isPresent() && !jdkType(unit, o.getType()))) {
            // A nested or anonymous class inheriting from the bank's own type may use that type's nested types too
            return Optional.empty();
        }
        String folder = unit.getPackageDeclaration().get().getNameAsString().replace('.', '/');
        Set<String> imported = new java.util.HashSet<>();
        unit.getImports().forEach(i -> imported.add(i.getName().getIdentifier()));
        Set<String> declared = declaredTypes(unit);
        Set<String> unknown = new java.util.TreeSet<>();
        for (String name : usedTypes(unit)) {
            if (!imported.contains(name) && !declared.contains(name) && !JDK.containsKey(name) && !javaLang(name)
                    && !classExists.test(folder + "/" + name + ".java")) {
                unknown.add(name);
            }
        }
        return unknown.isEmpty() ? Optional.empty() : Optional.of(UNKNOWN_CLASSES + ": " + String.join(", ", unknown)
                + ". They are not in the plan, the change or the codebase: add them to the plan, import the right class, or remove the use.");
    }

    /** Types the file uses by their simple name: as a type (new X(), X x, List<X>), or for a static call or constant (X.of()). */
    private static Set<String> usedTypes(CompilationUnit unit) {
        Set<String> used = new LinkedHashSet<>();
        // Not the first part of a qualified name (java in java.util.List), nor a variable in a method reference (map::get)
        unit.findAll(com.github.javaparser.ast.type.ClassOrInterfaceType.class).stream()
                .filter(t -> t.getScope().isEmpty() && Character.isUpperCase(t.getNameAsString().charAt(0))
                        && !(t.getParentNode().orElse(null) instanceof com.github.javaparser.ast.type.ClassOrInterfaceType outer
                        && outer.getScope().orElse(null) == t))
                .forEach(t -> used.add(t.getNameAsString()));
        Set<String> variables = new java.util.HashSet<>();
        unit.findAll(VariableDeclarator.class).forEach(v -> variables.add(v.getNameAsString()));
        unit.findAll(Parameter.class).forEach(p -> variables.add(p.getNameAsString()));
        for (MethodCallExpr call : unit.findAll(MethodCallExpr.class)) {
            if (call.getScope().orElse(null) instanceof NameExpr scope && Character.isUpperCase(scope.getNameAsString().charAt(0))
                    && !variables.contains(scope.getNameAsString())) {
                used.add(scope.getNameAsString());
            }
        }
        for (FieldAccessExpr access : unit.findAll(FieldAccessExpr.class)) {
            if (access.getScope() instanceof NameExpr scope && Character.isUpperCase(scope.getNameAsString().charAt(0))
                    && !variables.contains(scope.getNameAsString())) {
                used.add(scope.getNameAsString());
            }
        }
        // ALL_CAPS names are constants, not classes
        used.removeIf(name -> name.length() > 1 && name.equals(name.toUpperCase(java.util.Locale.ROOT)));
        return used;
    }

    /** Types the file declares itself (nested too) and its type parameters. */
    private static Set<String> declaredTypes(CompilationUnit unit) {
        Set<String> declared = new java.util.HashSet<>();
        unit.findAll(com.github.javaparser.ast.body.TypeDeclaration.class).forEach(t -> declared.add(t.getNameAsString()));
        unit.findAll(com.github.javaparser.ast.type.TypeParameter.class).forEach(t -> declared.add(t.getNameAsString()));
        return declared;
    }

    /**
     * A type that extends or implements one that is not the JDK's: that supertype may declare nested types the file
     * uses by their simple name (ModelGateway.ChatResult in a class implementing ModelGateway).
     */
    private static boolean inheritsFromOutsideTheJdk(CompilationUnit unit, com.github.javaparser.ast.body.TypeDeclaration<?> type) {
        List<com.github.javaparser.ast.type.ClassOrInterfaceType> supertypes = new ArrayList<>();
        if (type instanceof com.github.javaparser.ast.body.ClassOrInterfaceDeclaration c) {
            supertypes.addAll(c.getExtendedTypes());
            supertypes.addAll(c.getImplementedTypes());
        } else if (type instanceof com.github.javaparser.ast.body.RecordDeclaration r) {
            supertypes.addAll(r.getImplementedTypes());
        } else if (type instanceof com.github.javaparser.ast.body.EnumDeclaration e) {
            supertypes.addAll(e.getImplementedTypes());
        }
        return supertypes.stream().anyMatch(s -> !jdkType(unit, s));
    }

    /** A type of the JDK: imported from java.* or javax.*, written with such a package, or of java.lang. */
    private static boolean jdkType(CompilationUnit unit, com.github.javaparser.ast.type.ClassOrInterfaceType type) {
        String name = type.getNameAsString();
        String imported = unit.getImports().stream().filter(i -> !i.isAsterisk() && i.getName().getIdentifier().equals(name))
                .map(i -> i.getNameAsString()).findFirst().orElse(null);
        return imported != null ? imported.startsWith("java.") || imported.startsWith("javax.")
                : type.getScope().map(Object::toString).map(q -> q.startsWith("java.")).orElse(javaLang(name));
    }

    /** A class of java.lang (String, Math, IllegalStateException ...), which needs no import. */
    private static boolean javaLang(String name) {
        try {
            Class.forName("java.lang." + name, false, CrossFileJava.class.getClassLoader());
            return true;
        } catch (ClassNotFoundException | LinkageError e) {
            return false;
        }
    }

    private static boolean lombok(CompilationUnit unit) {
        return unit.getImports().stream().anyMatch(i -> i.getNameAsString().startsWith("lombok"))
                || unit.findAll(com.github.javaparser.ast.expr.AnnotationExpr.class).stream().anyMatch(a -> a.getNameAsString().startsWith("lombok.")
                || LOMBOK.contains(a.getNameAsString()) || a.getNameAsString().matches("Slf4j|Log4j2?|CommonsLog|XSlf4j|Flogger|JBossLog|CustomLog|Log"));
    }

    /** A type that extends or implements another, so it has methods its file does not declare. */
    private static boolean inherits(com.github.javaparser.ast.body.TypeDeclaration<?> type) {
        if (type instanceof com.github.javaparser.ast.body.ClassOrInterfaceDeclaration c) {
            return !c.getExtendedTypes().isEmpty() || !c.getImplementedTypes().isEmpty();
        }
        if (type instanceof com.github.javaparser.ast.body.RecordDeclaration r) {
            return !r.getImplementedTypes().isEmpty();
        }
        if (type instanceof com.github.javaparser.ast.body.EnumDeclaration e) {
            return !e.getImplementedTypes().isEmpty();
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

    private static String packageOf(String content) {
        java.util.regex.Matcher m = java.util.regex.Pattern.compile("(?m)^\\s*package\\s+([\\w.]+)\\s*;").matcher(content == null ? "" : content);
        return m.find() ? m.group(1) : "";
    }

    /** The class name of a Java file (FundTransferService.java -> FundTransferService). */
    static String className(String path) {
        return path.substring(path.lastIndexOf('/') + 1).replaceAll("\\.java$", "");
    }
}
