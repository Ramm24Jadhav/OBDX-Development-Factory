package com.obdx.factory.profile;

import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static com.obdx.factory.profile.ProfileFact.Section.CONVENTIONS;

/**
 * The bank's own coding conventions: package names, where customizations live, class naming, error codes,
 * exception base classes and indentation.
 */
@Component
@Order(6)
public class ConventionsDetector implements ProfileDetector {

    static final String PRODUCT_PACKAGE = "com.ofss";

    private static final Pattern PACKAGE = Pattern.compile("^\\s*package\\s+([\\w.]+)\\s*;", Pattern.MULTILINE);
    private static final Pattern EXTENDS_EXCEPTION = Pattern.compile("\\bextends\\s+([\\w.]*Exception)\\b");
    private static final Pattern ERROR_CODE = Pattern.compile("[\"']([A-Z][A-Z0-9]{1,9}(?:_[A-Z0-9]{1,10}){1,3}_\\d{2,6})[\"']");
    private static final Pattern CUSTOM_FOLDER = Pattern.compile("(?i)^(ext|extn|extension|extensions|custom|customs|customization|customisation|customizations|customisations|cz)$");
    private static final List<String> CLASS_SUFFIXES = List.of(
            "ServiceImpl", "Service", "AdapterImpl", "Adapter", "Assembler", "Repository", "DAO", "Dao", "DTO", "Dto",
            "RequestDTO", "ResponseDTO", "Request", "Response", "Validator", "Mapper", "Helper", "Utils", "Util",
            "Constants", "Exception", "Controller", "Resource", "Factory", "Handler");

    @Override
    public List<ProfileFact> detect(SourceTree tree) {
        List<String> javaFiles = tree.withExtension("java");
        Tally packages = new Tally();
        Tally exceptions = new Tally();
        Tally errorCodes = new Tally();
        Tally javaIndent = new Tally();
        for (String path : javaFiles) {
            String content = tree.read(path);
            Matcher pkg = PACKAGE.matcher(content);
            if (pkg.find() && !pkg.group(1).startsWith(PRODUCT_PACKAGE + ".")) {
                packages.add(root(pkg.group(1)), path);
            }
            Matcher ex = EXTENDS_EXCEPTION.matcher(content);
            while (ex.find()) {
                exceptions.add(ex.group(1), path);
            }
            collectErrorCodes(content, path, errorCodes);
            indentation(content).ifPresent(unit -> javaIndent.add(unit, path));
        }
        Tally jsIndent = new Tally();
        for (String path : tree.withExtension("js", "ts")) {
            String content = tree.read(path);
            collectErrorCodes(content, path, errorCodes);
            indentation(content).ifPresent(unit -> jsIndent.add(unit, path));
        }
        tree.withExtension("properties").forEach(path -> collectErrorCodes(tree.read(path), path, errorCodes));

        List<ProfileFact> facts = new ArrayList<>();
        facts.add(ProfileFact.of("conventions.packageRoots", CONVENTIONS, "Bank Java packages (non-product)",
                packages.describe(5, "file"), packages.confidenceByCount(5), packages.evidence(3)));
        facts.add(customizationFolders(tree));
        facts.add(classNaming(javaFiles));
        facts.add(errorCodeFormat(errorCodes));
        facts.add(ProfileFact.of("conventions.exceptionBase", CONVENTIONS, "Exception base classes",
                exceptions.describe(3, "subclass"), exceptions.confidenceByCount(5), exceptions.evidence(3)));
        List<String> indentParts = new ArrayList<>();
        if (!javaIndent.isEmpty()) {
            indentParts.add("Java: " + javaIndent.top(1).getFirst());
        }
        if (!jsIndent.isEmpty()) {
            indentParts.add("JavaScript: " + jsIndent.top(1).getFirst());
        }
        List<String> indentEvidence = new ArrayList<>(javaIndent.evidence(1));
        indentEvidence.addAll(jsIndent.evidence(1));
        facts.add(ProfileFact.of("conventions.indentation", CONVENTIONS, "Indentation", String.join("; ", indentParts),
                javaIndent.total() + jsIndent.total() >= 10 ? ProfileFact.Confidence.MEDIUM : ProfileFact.Confidence.LOW, indentEvidence));
        return facts;
    }

    /** First three segments, for example com.bank.obdx.payments gives com.bank.obdx. */
    private static String root(String packageName) {
        String[] parts = packageName.split("\\.");
        return String.join(".", java.util.Arrays.copyOf(parts, Math.min(3, parts.length)));
    }

    private ProfileFact customizationFolders(SourceTree tree) {
        Tally folders = new Tally();
        for (String path : tree.paths()) {
            String[] segments = path.split("/");
            for (int i = 0; i < segments.length - 1; i++) {
                if (CUSTOM_FOLDER.matcher(segments[i]).matches()) {
                    folders.add(String.join("/", java.util.Arrays.copyOf(segments, i + 1)) + "/", path);
                    break;
                }
            }
        }
        return ProfileFact.of("conventions.customizationFolders", CONVENTIONS, "Customization folders",
                folders.describe(5, "file"), folders.confidenceByCount(5), folders.evidence(3));
    }

    private ProfileFact classNaming(List<String> javaFiles) {
        Tally suffixes = new Tally();
        for (String path : javaFiles) {
            String name = path.substring(path.lastIndexOf('/') + 1, path.length() - ".java".length());
            for (String suffix : CLASS_SUFFIXES) {
                if (name.endsWith(suffix) && name.length() > suffix.length()) {
                    suffixes.add("*" + suffix, path);
                    break;
                }
            }
        }
        return ProfileFact.of("conventions.classNaming", CONVENTIONS, "Java class name suffixes",
                suffixes.describe(8, "class"), suffixes.confidenceByCount(10), suffixes.evidence(4));
    }

    private static void collectErrorCodes(String content, String path, Tally codes) {
        Matcher matcher = ERROR_CODE.matcher(content);
        while (matcher.find()) {
            codes.add(matcher.group(1), path);
        }
    }

    /** Describes the shape of error codes, for example DIGX_PY_0101 gives "DIGX_PY_0101 (format DIGX_<module>_<number>)". */
    private ProfileFact errorCodeFormat(Tally codes) {
        if (codes.isEmpty()) {
            return ProfileFact.notFound("conventions.errorCodes", CONVENTIONS, "Error code format");
        }
        Tally prefixes = new Tally();
        for (String code : codes.top(Integer.MAX_VALUE)) {
            prefixes.add(code.substring(0, code.indexOf('_')), code);
        }
        String example = codes.top(1).getFirst();
        int segments = example.split("_").length;
        String format = prefixes.top(1).getFirst() + "_" + "<module>_".repeat(Math.max(0, segments - 2)) + "<number>";
        int count = codes.top(Integer.MAX_VALUE).size();
        String value = count + (count == 1 ? " code: " : " codes, for example ") + example + " (format " + format + ")";
        return ProfileFact.of("conventions.errorCodes", CONVENTIONS, "Error code format", value,
                codes.confidenceByCount(5), codes.evidence(3));
    }

    /** The indentation unit of a file: "tabs", "2 spaces" or "4 spaces", from its smallest indent. */
    static java.util.Optional<String> indentation(String content) {
        int smallest = Integer.MAX_VALUE;
        for (String line : content.split("\n")) {
            if (line.isBlank()) {
                continue;
            }
            if (line.startsWith("\t")) {
                return java.util.Optional.of("tabs");
            }
            int spaces = 0;
            while (spaces < line.length() && line.charAt(spaces) == ' ') {
                spaces++;
            }
            // Lines continuing a block comment (" * ...") are not indentation.
            if (spaces > 0 && !line.substring(spaces).startsWith("*")) {
                smallest = Math.min(smallest, spaces);
            }
        }
        return smallest == Integer.MAX_VALUE ? java.util.Optional.empty() : java.util.Optional.of(smallest + " spaces");
    }
}
