package com.obdx.factory.pack;

import com.obdx.factory.change.FileChecks;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/**
 * The quick checks of a generated file, run on the factory server in milliseconds: syntax (Java at the bank's Java
 * level, JSON, XML, and basic checks for JavaScript, HTML and SQL) plus the rules of the workspace's version pack.
 */
@Component
public class LocalChecks {

    /** At most this many findings of one rule are reported per file. */
    private static final int MAX_PER_RULE = 3;

    public record Finding(String ruleId, PackRule.Severity severity, int line, String message) {
    }

    private final VersionPacks packs;

    public LocalChecks(VersionPacks packs) {
        this.packs = packs;
    }

    /**
     * @param original the file's content before the change, or null for a new file; in a modified file only findings
     *                 on lines the change added count
     */
    public FileChecks.Result check(CheckScope scope, String path, String original, String content) {
        FileChecks.Result syntax = syntax(scope, path, original, content);
        if (content == null || content.isBlank()) {
            return syntax;
        }
        List<PackRule> rules = rulesFor(scope, path);
        List<Finding> findings = findings(rules, path, original, content);
        boolean error = syntax.status() == FileChecks.Status.FAILED
                || findings.stream().anyMatch(f -> f.severity() == PackRule.Severity.ERROR);
        boolean warning = syntax.status() == FileChecks.Status.WARNING || !findings.isEmpty();
        FileChecks.Status status = error ? FileChecks.Status.FAILED : warning ? FileChecks.Status.WARNING
                : syntax.status() == FileChecks.Status.NOT_CHECKED && rules.isEmpty() ? FileChecks.Status.NOT_CHECKED : FileChecks.Status.PASSED;
        List<String> messages = new ArrayList<>();
        if (syntax.message() != null) {
            messages.add(syntax.message());
        }
        findings.forEach(f -> messages.add((f.line() > 0 ? "Line " + f.line() : "File") + " (" + f.ruleId() + ", "
                + f.severity().name().toLowerCase() + "): " + f.message()));
        return new FileChecks.Result(status, messages.isEmpty() ? null : String.join("\n", messages));
    }

    /** The pack rules that apply to a file in this workspace, to tell the model before it writes the file. */
    public List<PackRule> rulesFor(CheckScope scope, String path) {
        VersionPack pack = packs.find(scope.version()).orElse(null);
        if (pack == null) {
            return List.of();
        }
        Integer jet = scope.jetMajor();
        return pack.rules().stream().filter(r -> !scope.disabled().contains(r.id()) && r.appliesTo(path)
                && r.appliesToProfile(scope.facts(), jet)).toList();
    }

    /** The rules as a short list for a prompt, or an empty string. */
    public String describeRules(CheckScope scope, String path) {
        List<PackRule> rules = rulesFor(scope, path);
        if (rules.isEmpty()) {
            return "";
        }
        return rules.stream().map(r -> "- " + r.message() + (r.severity() == PackRule.Severity.ERROR ? " (required)" : ""))
                .collect(Collectors.joining("\n"));
    }

    /** The Java level generated Java must parse at: the profile's Java version, else the pack's default. */
    public int javaLevel(CheckScope scope) {
        Integer fromProfile = scope.javaVersion();
        if (fromProfile != null) {
            return fromProfile;
        }
        return packs.find(scope.version()).map(VersionPack::javaLevel).orElse(FileChecks.LATEST_JAVA);
    }

    private FileChecks.Result syntax(CheckScope scope, String path, String original, String content) {
        int level = javaLevel(scope);
        FileChecks.Result result = FileChecks.check(path, content, level);
        if (result.status() == FileChecks.Status.FAILED && level < FileChecks.LATEST_JAVA && original != null
                && path.toLowerCase().endsWith(".java") && FileChecks.check(path, original, level).status() == FileChecks.Status.FAILED) {
            // The existing file already uses newer Java than the detected level, so the level is not reliable for it.
            return FileChecks.check(path, content, FileChecks.LATEST_JAVA);
        }
        return result;
    }

    static List<Finding> findings(List<PackRule> rules, String path, String original, String content) {
        if (rules.isEmpty()) {
            return List.of();
        }
        String text = SourceText.withoutComments(path, content);
        String originalText = original == null ? null : SourceText.withoutComments(path, original);
        String[] lines = content.split("\n", -1);
        List<Finding> findings = new ArrayList<>();
        for (PackRule rule : rules) {
            Pattern forbid = rule.forbidPattern();
            if (forbid != null) {
                Map<String, Integer> existing = lineCounts(original);
                Matcher matcher = forbid.matcher(text);
                int found = 0;
                while (matcher.find() && found < MAX_PER_RULE) {
                    int line = lineOf(text, matcher.start());
                    String key = lines[line - 1].strip();
                    Integer count = existing.get(key);
                    if (count != null && count > 0) {
                        existing.put(key, count - 1);
                        continue;
                    }
                    findings.add(new Finding(rule.id(), rule.severity(), line, rule.message()));
                    found++;
                }
            } else {
                Pattern require = rule.requirePattern();
                if (!require.matcher(text).find() && (originalText == null || require.matcher(originalText).find())) {
                    findings.add(new Finding(rule.id(), rule.severity(), 0, rule.message()));
                }
            }
        }
        return findings;
    }

    private static Map<String, Integer> lineCounts(String original) {
        Map<String, Integer> counts = new HashMap<>();
        if (original != null) {
            for (String line : original.split("\n", -1)) {
                counts.merge(line.strip(), 1, Integer::sum);
            }
        }
        return counts;
    }

    private static int lineOf(String text, int offset) {
        int line = 1;
        for (int i = 0; i < offset; i++) {
            if (text.charAt(i) == '\n') {
                line++;
            }
        }
        return line;
    }
}
