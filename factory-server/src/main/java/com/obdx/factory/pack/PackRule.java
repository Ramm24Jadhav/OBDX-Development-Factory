package com.obdx.factory.pack;

import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * One quick check from a version pack. A rule either forbids a pattern (each match is a finding, with its line) or
 * requires one (a file without it is a finding). Comments are ignored, and in modified files only lines that the
 * change added count, so a rule never blames the bank's existing code.
 *
 * @param id        stable identifier, used to turn the rule off for a workspace
 * @param title     short readable name
 * @param severity  ERROR findings go back to the model to fix and block a Jenkins build; WARNING findings are shown
 * @param files     path globs the rule applies to, for example "**&#47;*.js"
 * @param exclude   path globs it does not apply to
 * @param forbid    regular expression that must not occur, or null
 * @param require   regular expression that must occur, or null
 * @param message   what to do instead; also given to the model
 * @param minJet    lowest Oracle JET major version (from the Project Profile) the rule applies to, or null
 * @param ifProfile applies only when each Project Profile fact (key) is known and matches the regular expression (value,
 *                  case-insensitive), for example backend.eeNamespace: "^javax$"
 */
public record PackRule(String id, String title, Severity severity, List<String> files, List<String> exclude, String forbid,
                       String require, String message, Integer minJet, Map<String, String> ifProfile) {

    public enum Severity { ERROR, WARNING }

    public PackRule {
        files = files == null ? List.of() : List.copyOf(files);
        exclude = exclude == null ? List.of() : List.copyOf(exclude);
        ifProfile = ifProfile == null ? Map.of() : Map.copyOf(ifProfile);
    }

    public boolean appliesTo(String path) {
        String normalized = path.replace('\\', '/');
        return files.stream().anyMatch(glob -> Glob.matches(glob, normalized))
                && exclude.stream().noneMatch(glob -> Glob.matches(glob, normalized));
    }

    /** Whether the bank's codebase, as described by the Project Profile, is one this rule is meant for. */
    public boolean appliesToProfile(Map<String, String> facts, Integer jetMajor) {
        if (minJet != null && jetMajor != null && jetMajor < minJet) {
            return false;
        }
        for (Map.Entry<String, String> condition : ifProfile.entrySet()) {
            String value = facts.get(condition.getKey());
            if (value == null || !Pattern.compile(condition.getValue(), Pattern.CASE_INSENSITIVE).matcher(value).find()) {
                return false;
            }
        }
        return true;
    }

    Pattern forbidPattern() {
        return forbid == null ? null : Pattern.compile(forbid, Pattern.MULTILINE);
    }

    Pattern requirePattern() {
        return require == null ? null : Pattern.compile(require, Pattern.MULTILINE);
    }
}
