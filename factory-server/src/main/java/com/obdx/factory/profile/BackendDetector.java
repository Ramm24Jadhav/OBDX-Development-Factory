package com.obdx.factory.profile;

import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static com.obdx.factory.profile.ProfileFact.Confidence.HIGH;
import static com.obdx.factory.profile.ProfileFact.Confidence.MEDIUM;
import static com.obdx.factory.profile.ProfileFact.Section.BACKEND;

/**
 * Build tool, Java version, frameworks, packaging, application server, logging and REST endpoints.
 */
@Component
@Order(2)
public class BackendDetector implements ProfileDetector {

    private static final Pattern IMPORT = Pattern.compile("^import\\s+(?:static\\s+)?([\\w.]+)", Pattern.MULTILINE);
    private static final Pattern PATH_ANNOTATION = Pattern.compile("@Path\\(\\s*\"([^\"]*)\"");
    private static final List<Pattern> MAVEN_JAVA_VERSION = List.of(
            Pattern.compile("<maven\\.compiler\\.(?:release|source|target)>\\s*([\\d.]+)\\s*<"),
            Pattern.compile("<java\\.version>\\s*([\\d.]+)\\s*<"),
            Pattern.compile("<(?:release|source)>\\s*([\\d.]+)\\s*</(?:release|source)>"));
    private static final List<Pattern> GRADLE_JAVA_VERSION = List.of(
            Pattern.compile("sourceCompatibility\\s*=\\s*['\"]?(?:JavaVersion\\.VERSION_)?([\\d._]+)"),
            Pattern.compile("JavaLanguageVersion\\.of\\(\\s*(\\d+)\\s*\\)"));
    private static final Pattern ANT_JAVA_VERSION = Pattern.compile("<javac[^>]*\\s(?:source|target|release)\\s*=\\s*\"([\\d.]+)\"");
    private static final Pattern MANIFEST_JDK = Pattern.compile("^Build-Jdk(?:-Spec)?:\\s*([\\d.]+)", Pattern.MULTILINE);
    private static final Pattern MAVEN_PACKAGING = Pattern.compile("<packaging>\\s*(war|ear|jar|ejb)\\s*</packaging>");

    /** Import prefix to framework name, checked in order. */
    private static final Map<String, String> FRAMEWORKS = new LinkedHashMap<>();
    static {
        FRAMEWORKS.put("javax.ws.rs", "JAX-RS");
        FRAMEWORKS.put("jakarta.ws.rs", "JAX-RS");
        FRAMEWORKS.put("org.glassfish.jersey", "Jersey");
        FRAMEWORKS.put("org.springframework", "Spring");
        FRAMEWORKS.put("javax.persistence", "JPA");
        FRAMEWORKS.put("jakarta.persistence", "JPA");
        FRAMEWORKS.put("org.eclipse.persistence", "EclipseLink");
        FRAMEWORKS.put("org.hibernate", "Hibernate");
        FRAMEWORKS.put("javax.ejb", "EJB");
        FRAMEWORKS.put("jakarta.ejb", "EJB");
        FRAMEWORKS.put("javax.inject", "CDI / @Inject");
        FRAMEWORKS.put("jakarta.inject", "CDI / @Inject");
        FRAMEWORKS.put("javax.xml.bind", "JAXB");
        FRAMEWORKS.put("jakarta.xml.bind", "JAXB");
        FRAMEWORKS.put("com.fasterxml.jackson", "Jackson");
        FRAMEWORKS.put("org.junit", "JUnit");
        FRAMEWORKS.put("org.mockito", "Mockito");
    }

    private static final Map<String, String> LOGGING = Map.of(
            "java.util.logging", "java.util.logging",
            "org.slf4j", "SLF4J",
            "org.apache.log4j", "Log4j 1",
            "org.apache.logging.log4j", "Log4j 2",
            "org.apache.commons.logging", "Commons Logging");

    @Override
    public List<ProfileFact> detect(SourceTree tree) {
        List<ProfileFact> facts = new ArrayList<>();
        facts.add(buildTool(tree));
        facts.add(javaVersion(tree));

        Tally frameworks = new Tally();
        Tally namespace = new Tally();
        Tally logging = new Tally();
        Tally endpoints = new Tally();
        for (String path : tree.withExtension("java")) {
            String content = tree.read(path);
            java.util.Set<String> fileFrameworks = new java.util.HashSet<>();
            java.util.Set<String> fileLogging = new java.util.HashSet<>();
            Matcher imports = IMPORT.matcher(content);
            while (imports.find()) {
                String imported = imports.group(1);
                FRAMEWORKS.forEach((prefix, name) -> {
                    if (imported.startsWith(prefix + ".")) {
                        fileFrameworks.add(name);
                    }
                });
                LOGGING.forEach((prefix, name) -> {
                    if (imported.startsWith(prefix + ".")) {
                        fileLogging.add(name);
                    }
                });
                if (imported.startsWith("javax.ws.rs.") || imported.startsWith("javax.persistence.") || imported.startsWith("javax.inject.")) {
                    namespace.add("javax", path);
                } else if (imported.startsWith("jakarta.")) {
                    namespace.add("jakarta", path);
                }
            }
            fileFrameworks.forEach(name -> frameworks.add(name, path));
            fileLogging.forEach(name -> logging.add(name, path));
            Matcher paths = PATH_ANNOTATION.matcher(content);
            while (paths.find()) {
                endpoints.add(paths.group(1), path);
            }
        }

        facts.add(ProfileFact.of("backend.frameworks", BACKEND, "Frameworks and libraries",
                frameworks.describe(10, "file"), frameworks.confidenceByCount(10), frameworks.evidence(5)));
        facts.add(ProfileFact.of("backend.eeNamespace", BACKEND, "Java EE namespace",
                namespace.isEmpty() ? null : namespace.top(1).getFirst() + (namespace.top(2).size() > 1 ? " (mixed: " + namespace.describe(2, "use") + ")" : ""),
                namespace.confidenceByCount(10), namespace.evidence(2)));
        facts.addAll(packagingAndServer(tree));
        facts.add(ProfileFact.of("backend.logging", BACKEND, "Logging",
                logging.describe(3, "file"), logging.confidenceByCount(10), logging.evidence(3)));
        facts.add(ProfileFact.of("backend.restEndpoints", BACKEND, "REST endpoints (@Path)",
                endpoints.isEmpty() ? null : endpoints.total() + " @Path annotations, for example " + String.join(", ", endpoints.top(5)),
                endpoints.confidenceByCount(5), endpoints.evidence(5)));
        return facts;
    }

    private ProfileFact buildTool(SourceTree tree) {
        Tally tools = new Tally();
        tree.named("pom.xml").forEach(path -> tools.add("Maven", path));
        tree.paths(path -> path.endsWith("build.gradle") || path.endsWith("build.gradle.kts")).forEach(path -> tools.add("Gradle", path));
        tree.named("build.xml").forEach(path -> tools.add("Ant", path));
        tree.named("package.json").forEach(path -> tools.add("npm", path));
        tree.paths(path -> path.endsWith("Gruntfile.js")).forEach(path -> tools.add("Grunt", path));
        tree.named("Jenkinsfile").forEach(path -> tools.add("Jenkins pipeline", path));
        return ProfileFact.of("backend.buildTool", BACKEND, "Build tools", tools.describe(6, "build file"), HIGH, tools.evidence(6));
    }

    private ProfileFact javaVersion(SourceTree tree) {
        Tally versions = new Tally();
        tree.named("pom.xml").forEach(path -> collect(tree.read(path), MAVEN_JAVA_VERSION, path, versions));
        tree.paths(path -> path.endsWith("build.gradle") || path.endsWith("build.gradle.kts"))
                .forEach(path -> collect(tree.read(path), GRADLE_JAVA_VERSION, path, versions));
        tree.named("build.xml").forEach(path -> collect(tree.read(path), List.of(ANT_JAVA_VERSION), path, versions));
        tree.named("MANIFEST.MF").forEach(path -> collect(tree.read(path), List.of(MANIFEST_JDK), path, versions));
        return ProfileFact.of("backend.javaVersion", BACKEND, "Java version", versions.isEmpty() ? null : summarize(versions), HIGH, versions.evidence(3));
    }

    private static void collect(String content, List<Pattern> patterns, String path, Tally versions) {
        for (Pattern pattern : patterns) {
            Matcher matcher = pattern.matcher(content);
            while (matcher.find()) {
                versions.add(normalizeJavaVersion(matcher.group(1)), path);
            }
        }
    }

    /** "1.8", "1.8.0_281" and "8" all mean Java 8. */
    static String normalizeJavaVersion(String raw) {
        String version = raw.replace('_', '.');
        if (version.startsWith("1.")) {
            version = version.substring(2);
        }
        int dot = version.indexOf('.');
        return dot > 0 ? version.substring(0, dot) : version;
    }

    private static String summarize(Tally tally) {
        List<String> top = tally.top(3);
        return top.size() == 1 ? "Java " + top.getFirst() : "Java " + top.getFirst() + " (also: " + tally.describe(3, "declaration") + ")";
    }

    private List<ProfileFact> packagingAndServer(SourceTree tree) {
        Tally packaging = new Tally();
        tree.named("pom.xml").forEach(path -> {
            Matcher matcher = MAVEN_PACKAGING.matcher(tree.read(path));
            if (matcher.find()) {
                packaging.add(matcher.group(1).toUpperCase(java.util.Locale.ROOT), path);
            }
        });
        tree.paths(path -> path.endsWith("WEB-INF/web.xml")).forEach(path -> packaging.add("WAR", path));
        tree.paths(path -> path.endsWith("META-INF/application.xml")).forEach(path -> packaging.add("EAR", path));

        Tally servers = new Tally();
        tree.paths(path -> path.matches(".*(^|/)weblogic(-application|-ejb-jar)?\\.xml$")).forEach(path -> servers.add("Oracle WebLogic", path));
        tree.paths(path -> path.endsWith("jboss-web.xml") || path.endsWith("jboss-deployment-structure.xml")).forEach(path -> servers.add("JBoss / WildFly", path));
        tree.paths(path -> path.contains("ibm-web-bnd")).forEach(path -> servers.add("IBM WebSphere", path));
        tree.paths(path -> path.endsWith("context.xml") && path.contains("META-INF")).forEach(path -> servers.add("Apache Tomcat", path));

        return List.of(
                ProfileFact.of("backend.packaging", BACKEND, "Packaging", packaging.describe(3, "module"), MEDIUM, packaging.evidence(3)),
                ProfileFact.of("backend.appServer", BACKEND, "Application server", servers.describe(2, "descriptor"), HIGH, servers.evidence(3)));
    }
}
