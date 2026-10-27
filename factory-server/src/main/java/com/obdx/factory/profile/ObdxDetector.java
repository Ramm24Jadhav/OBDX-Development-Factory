package com.obdx.factory.profile;

import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static com.obdx.factory.profile.ProfileFact.Confidence.HIGH;
import static com.obdx.factory.profile.ProfileFact.Confidence.LOW;
import static com.obdx.factory.profile.ProfileFact.Confidence.MEDIUM;
import static com.obdx.factory.profile.ProfileFact.Section.OBDX;

/**
 * The OBDX release the code is built on, and whether Oracle product source is part of the repository.
 */
@Component
@Order(1)
public class ObdxDetector implements ProfileDetector {

    /** An explicit setting such as obdx.version=22.2.0 or "digxRelease": "25.1.0". */
    private static final Pattern VERSION_SETTING = Pattern.compile(
            "(?i)\\b(?:obdx|digx)[\\w.-]*(?:version|release)[\"']?\\s*[=:]\\s*[\"']?(\\d{2}\\.\\d+(?:\\.\\d+)*)");
    /** A dependency or parent on an OBDX/DIGX artifact in a Maven POM. */
    private static final Pattern POM_DEPENDENCY = Pattern.compile(
            "<groupId>[^<]*(?:ofss|digx|obdx)[^<]*</groupId>\\s*<artifactId>[^<]*</artifactId>\\s*<version>\\s*(\\d{2}\\.\\d+(?:\\.\\d+)*)",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern MANIFEST_VERSION = Pattern.compile("^Implementation-Version:\\s*(\\d{2}\\.\\d+(?:\\.\\d+)*)", Pattern.MULTILINE);
    /** Names such as OBDX_22.2.0 or digx-25.1 in file or folder names. */
    private static final Pattern VERSION_IN_NAME = Pattern.compile("(?i)(?:obdx|digx)[-_ .]?v?(\\d{2}\\.\\d+(?:\\.\\d+)*)");

    @Override
    public List<ProfileFact> detect(SourceTree tree) {
        return List.of(version(tree), productCode(tree));
    }

    private ProfileFact version(SourceTree tree) {
        Tally explicit = new Tally();
        for (String path : tree.withExtension("properties", "json", "xml", "yml", "yaml", "txt")) {
            Matcher matcher = VERSION_SETTING.matcher(tree.read(path));
            while (matcher.find()) {
                explicit.add(matcher.group(1), path);
            }
        }
        if (!explicit.isEmpty()) {
            return versionFact(explicit, HIGH);
        }
        Tally inferred = new Tally();
        tree.named("pom.xml").forEach(path -> {
            Matcher matcher = POM_DEPENDENCY.matcher(tree.read(path));
            while (matcher.find()) {
                inferred.add(matcher.group(1), path);
            }
        });
        tree.named("MANIFEST.MF").forEach(path -> {
            String content = tree.read(path);
            Matcher matcher = MANIFEST_VERSION.matcher(content);
            if (matcher.find() && content.toLowerCase(java.util.Locale.ROOT).matches("(?s).*(digx|obdx|digital experience).*")) {
                inferred.add(matcher.group(1), path);
            }
        });
        if (!inferred.isEmpty()) {
            return versionFact(inferred, MEDIUM);
        }
        Tally names = new Tally();
        for (String path : tree.paths()) {
            Matcher matcher = VERSION_IN_NAME.matcher(path);
            if (matcher.find()) {
                names.add(matcher.group(1), path);
            }
        }
        return names.isEmpty() ? ProfileFact.notFound("obdx.version", OBDX, "OBDX version") : versionFact(names, LOW);
    }

    private static ProfileFact versionFact(Tally versions, ProfileFact.Confidence confidence) {
        List<String> top = versions.top(3);
        String value = top.getFirst() + (top.size() > 1 ? " (also seen: " + String.join(", ", top.subList(1, top.size())) + ")" : "");
        return ProfileFact.of("obdx.version", OBDX, "OBDX version", value, confidence, versions.evidence(3));
    }

    private ProfileFact productCode(SourceTree tree) {
        String productPath = ConventionsDetector.PRODUCT_PACKAGE.replace('.', '/') + "/";
        List<String> javaFiles = tree.withExtension("java");
        List<String> product = javaFiles.stream().filter(path -> path.contains(productPath)).toList();
        if (javaFiles.isEmpty()) {
            return ProfileFact.notFound("obdx.productCode", OBDX, "Oracle product source in repository");
        }
        String value = product.isEmpty()
                ? "No (only bank code; " + javaFiles.size() + " Java files outside " + ConventionsDetector.PRODUCT_PACKAGE + ")"
                : "Yes: " + product.size() + " Java files in " + ConventionsDetector.PRODUCT_PACKAGE + ".*, "
                + (javaFiles.size() - product.size()) + " bank Java files";
        return ProfileFact.of("obdx.productCode", OBDX, "Oracle product source in repository", value, MEDIUM,
                product.isEmpty() ? javaFiles.stream().limit(2).toList() : product.stream().limit(2).toList());
    }
}
