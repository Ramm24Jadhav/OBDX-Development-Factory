package com.obdx.factory.source;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.TreeMap;
import java.util.function.Function;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/**
 * Suggests the workspace name, bank name and OBDX version of a codebase from its files, before it is imported. The
 * suggestions are hints for the new-workspace form, each with the reason it was made; people confirm or change them.
 * <p>
 * OBDX version, strongest first: the release in OBDX's about.json (channel/framework/json/about.json in 22.2), the
 * release of Oracle's OBDX libraries (com.ofss.digx) or an "obdx.version" in the build files, the Oracle JET version, the Java level (the 22.x pack is Java 8, the 25.x pack Java 11) and a version
 * in the repository or folder name. Bank name: the repository or folder name, the build's group id, then the most
 * common Java package that is not Oracle's.
 */
public final class CodeDetector {

    /** What was found. Values are null when there was no evidence. */
    public record Suggestion(String name, String bankName, String obdxVersion, List<String> reasons) {
    }

    private static final int MAX_FILES_READ = 15;
    private static final Set<String> BUILD_FILES = Set.of("pom.xml", "build.gradle", "package.json", "oraclejetconfig.json",
            "build.properties", "version.json", "version.properties", "version.txt", "manifest.mf", "release.properties");
    private static final Set<String> GENERIC_WORDS = Set.of("obdx", "digx", "ofss", "oracle", "trunk", "branches", "tags", "repo",
            "repos", "repository", "repositories", "svn", "code", "codebase", "src", "source", "sources", "custom", "customization",
            "customizations", "customisation", "customisations", "ext", "extension", "extensions", "ui", "channel", "web", "app",
            "apps", "project", "projects", "demo", "main", "dev", "development", "workspace", "local", "factory", "my", "x", "ob");
    private static final Set<String> NOT_A_BANK_PACKAGE = Set.of("ofss", "oracle", "sun", "google", "apache", "springframework",
            "fasterxml", "example", "company", "mycompany", "test", "bank", "banking", "obdx", "digx", "acme", "foo");
    private static final Set<String> COUNTRY_OR_ORG = Set.of("com", "org", "net", "in", "co", "ae", "sa", "uk", "qa", "kw",
            "bh", "om", "eg", "ke", "ng", "za", "sg", "my", "id", "ph", "au", "nz", "us", "ca", "de", "fr", "it", "es", "nl", "ch", "lk", "bd", "pk");

    private static final Pattern ABOUT_RELEASE = Pattern.compile("(?<![\\d.])(2\\d)\\.(\\d{1,2})(?:\\.\\d+){0,4}(?![\\d.])");
    private static final Pattern DIGX_DEPENDENCY = Pattern.compile(
            "(?s)<groupId>\\s*com\\.ofss[^<]*</groupId>\\s*<artifactId>[^<]*</artifactId>\\s*<version>\\s*(\\d{2})\\.(\\d+)[^<]*</version>");
    private static final Pattern OBDX_VERSION_PROPERTY = Pattern.compile(
            "(?i)(?:obdx|digx)[\\w.-]*version[\"'\\s]*[:=>][\"'\\s]*(\\d{2})\\.(\\d+)");
    private static final Pattern JET_VERSION = Pattern.compile("(?i)\"@oracle/oraclejet\"\\s*:\\s*\"[~^>=\\s]*(\\d+)\\.(\\d+)");
    private static final Pattern JET_LIBS = Pattern.compile("(?i)(?:^|/)(?:oraclejet|oj)/v?(\\d{1,2})\\.(\\d+)\\.\\d+/");
    private static final Pattern JAVA_LEVEL = Pattern.compile(
            "(?:<maven\\.compiler\\.(?:source|target|release)>|<java\\.version>|<source>|<release>|sourceCompatibility\\s*=\\s*['\"]?)\\s*(?:1\\.)?(\\d{1,2})\\b");
    private static final Pattern GROUP_ID = Pattern.compile("<groupId>\\s*([\\w.]+)\\s*</groupId>");
    private static final Pattern NAME_VERSION = Pattern.compile("(?i)(?:^|[-_ .])(?:obdx|digx|v)?[-_ ]?(2[0-9])(?:[._]\\d+)*$");

    private CodeDetector() {
    }

    /**
     * @param paths     files of the codebase, relative, with "/" (folders may end with "/")
     * @param reader    reads a file by path; null if it cannot be read
     * @param nameHints names the codebase is known by, most specific first: repository, folder, URL segments
     */
    public static Suggestion detect(List<String> paths, Function<String, String> reader, List<String> nameHints) {
        List<String> reasons = new ArrayList<>();
        Map<String, Integer> versionScore = new LinkedHashMap<>();

        List<String> buildFiles = paths.stream()
                .filter(p -> BUILD_FILES.contains(fileName(p).toLowerCase(Locale.ROOT)) && !p.contains("node_modules/"))
                .sorted(Comparator.comparingInt((String p) -> p.split("/").length).thenComparing(p -> p))
                .limit(MAX_FILES_READ).toList();
        Map<String, String> contents = new LinkedHashMap<>();
        for (String path : buildFiles) {
            String content = reader.apply(path);
            if (content != null) {
                contents.put(path, content);
            }
        }

        // OBDX's own about.json (channel/framework/json/about.json in 22.2; elsewhere in other releases, perhaps)
        String about = paths.stream().filter(p -> p.endsWith("framework/json/about.json")).findFirst()
                .or(() -> paths.stream().filter(p -> fileName(p).equals("about.json") && !p.contains("node_modules/")).findFirst())
                .orElse(null);
        String aboutContent = about == null ? null : reader.apply(about);
        Matcher aboutRelease = aboutContent == null ? null : ABOUT_RELEASE.matcher(aboutContent);
        boolean fromAbout = aboutRelease != null && aboutRelease.find();
        if (fromAbout) {
            String version = pack(Integer.parseInt(aboutRelease.group(1)));
            vote(versionScore, version, 20);
            reasons.add("OBDX " + version + ": " + about + " says release " + aboutRelease.group(1) + "." + aboutRelease.group(2));
        }
        // OBDX release in the build files
        for (Map.Entry<String, String> file : fromAbout ? Map.<String, String>of().entrySet() : contents.entrySet()) {
            Matcher release = DIGX_DEPENDENCY.matcher(file.getValue());
            Matcher property = OBDX_VERSION_PROPERTY.matcher(file.getValue());
            Matcher found = release.find() ? release : property.find() ? property : null;
            if (found != null) {
                String version = pack(Integer.parseInt(found.group(1)));
                vote(versionScore, version, 10);
                reasons.add("OBDX " + version + ": " + file.getKey() + " refers to OBDX release " + found.group(1) + "." + found.group(2));
                break;
            }
        }
        // Oracle JET
        Optional<String> jet = contents.entrySet().stream().map(f -> match(JET_VERSION, f.getValue()).map(v -> v + " in " + f.getKey()))
                .flatMap(Optional::stream).findFirst()
                .or(() -> paths.stream().map(p -> match(JET_LIBS, p).map(v -> v + " (" + p.replaceAll("/[^/]*$", "/") + ")")).flatMap(Optional::stream).findFirst());
        jet.ifPresent(found -> {
            int major = Integer.parseInt(found.substring(0, found.indexOf('.')));
            String version = major >= 15 ? "25.x" : "22.x";
            vote(versionScore, version, 3);
            reasons.add("OBDX " + version + ": Oracle JET " + found + "; OBDX 22.x uses JET releases before 15, 25.x later ones");
        });
        // Java level
        for (Map.Entry<String, String> file : contents.entrySet()) {
            Optional<String> level = match(JAVA_LEVEL, file.getValue());
            if (level.isPresent()) {
                int java = Integer.parseInt(level.get().replaceAll("\\..*", ""));
                String version = java >= 11 ? "25.x" : "22.x";
                vote(versionScore, version, 2);
                reasons.add("OBDX " + version + ": " + file.getKey() + " builds for Java " + java);
                break;
            }
        }
        // A version in a name, such as bank-a-22 or obdx_25.1
        for (String hint : nameHints) {
            Matcher matcher = NAME_VERSION.matcher(hint.strip());
            if (matcher.find()) {
                String version = pack(Integer.parseInt(matcher.group(1)));
                vote(versionScore, version, 2);
                reasons.add("OBDX " + version + ": the name \"" + hint + "\"");
                break;
            }
        }
        String obdxVersion = versionScore.entrySet().stream().max(Map.Entry.comparingByValue()).map(Map.Entry::getKey).orElse(null);

        // Bank name
        String bankName = null;
        for (String hint : nameHints) {
            String bank = bankFromName(hint);
            if (bank != null) {
                bankName = bank;
                reasons.add("Bank name " + bank + ": the name \"" + hint + "\"");
                break;
            }
        }
        if (bankName == null) {
            Optional<String> group = contents.entrySet().stream().filter(f -> fileName(f.getKey()).equals("pom.xml"))
                    .map(f -> match(GROUP_ID, f.getValue())).flatMap(Optional::stream).map(CodeDetector::organisation)
                    .filter(o -> o != null).findFirst();
            if (group.isPresent()) {
                bankName = display(group.get());
                reasons.add("Bank name " + bankName + ": the build's group id");
            }
        }
        if (bankName == null) {
            Map<String, Long> packages = paths.stream().filter(p -> p.endsWith(".java")).map(CodeDetector::packageOrganisation)
                    .filter(o -> o != null).collect(Collectors.groupingBy(o -> o, TreeMap::new, Collectors.counting()));
            Optional<Map.Entry<String, Long>> top = packages.entrySet().stream().max(Map.Entry.comparingByValue());
            if (top.isPresent() && top.get().getValue() >= 2) {
                bankName = display(top.get().getKey());
                reasons.add("Bank name " + bankName + ": " + top.get().getValue() + " Java files are in its packages");
            }
        }

        return new Suggestion(workspaceName(nameHints, bankName, obdxVersion), bankName, obdxVersion, reasons);
    }

    /** The supported pack for an OBDX release: 22.x up to 23, 25.x from 24. */
    static String pack(int major) {
        return major >= 24 ? "25.x" : "22.x";
    }

    /** "bank-a-22" gives "Bank A", "obdx-hdfc" gives "HDFC"; null for generic names such as "trunk". */
    static String bankFromName(String name) {
        List<String> words = new ArrayList<>();
        for (String word : name.toLowerCase(Locale.ROOT).split("[^a-z0-9]+")) {
            if (!word.isEmpty() && !GENERIC_WORDS.contains(word) && !word.matches("v?\\d+")) {
                words.add(word);
            }
        }
        if (words.isEmpty() || words.stream().allMatch(w -> w.length() == 1)) {
            return null;
        }
        return words.stream().map(CodeDetector::displayWord).collect(Collectors.joining(" "));
    }

    private static String display(String organisation) {
        return displayWord(organisation);
    }

    /** Short names are usually acronyms (HDFC, ADCB); "bank" and longer names are capitalized. */
    private static String displayWord(String word) {
        if (word.length() == 1 || (word.length() <= 5 && !word.equals("bank") && !word.equals("first"))) {
            return word.toUpperCase(Locale.ROOT);
        }
        return word.substring(0, 1).toUpperCase(Locale.ROOT) + word.substring(1);
    }

    /** "com.hdfc.obdx" gives "hdfc"; null for Oracle's and generic ones. */
    private static String organisation(String dotted) {
        String[] parts = dotted.split("\\.");
        if (parts.length < 2 || !COUNTRY_OR_ORG.contains(parts[0])) {
            return null;
        }
        String org = parts[1].toLowerCase(Locale.ROOT);
        return NOT_A_BANK_PACKAGE.contains(org) || GENERIC_WORDS.contains(org) ? null : org;
    }

    /** The organisation of a Java file's package from its path: .../com/hdfc/obdx/X.java gives "hdfc". */
    private static String packageOrganisation(String path) {
        String[] parts = path.split("/");
        for (int i = 0; i < parts.length - 2; i++) {
            if (COUNTRY_OR_ORG.contains(parts[i]) && (i == 0 || parts[i - 1].equals("java") || parts[i - 1].equals("src"))) {
                return organisation(parts[i] + "." + parts[i + 1]);
            }
        }
        return null;
    }

    private static String workspaceName(List<String> nameHints, String bankName, String obdxVersion) {
        for (String hint : nameHints) {
            String slug = hint.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]+", "-").replaceAll("^-|-$", "");
            if (!slug.isEmpty() && !GENERIC_WORDS.contains(slug) && bankFromName(hint) != null) {
                return slug.length() > 60 ? slug.substring(0, 60) : slug;
            }
        }
        if (bankName == null) {
            return null;
        }
        String slug = bankName.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]+", "-");
        return obdxVersion == null ? slug : slug + "-" + obdxVersion.substring(0, 2);
    }

    private static void vote(Map<String, Integer> scores, String version, int weight) {
        scores.merge(version, weight, Integer::sum);
    }

    private static Optional<String> match(Pattern pattern, String text) {
        Matcher matcher = pattern.matcher(text);
        if (!matcher.find()) {
            return Optional.empty();
        }
        return Optional.of(matcher.groupCount() >= 2 && matcher.group(2) != null ? matcher.group(1) + "." + matcher.group(2) : matcher.group(1));
    }

    private static String fileName(String path) {
        String trimmed = path.endsWith("/") ? path.substring(0, path.length() - 1) : path;
        return trimmed.substring(trimmed.lastIndexOf('/') + 1);
    }
}
