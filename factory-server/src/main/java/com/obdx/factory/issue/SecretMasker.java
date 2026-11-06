package com.obdx.factory.issue;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Hides secrets and customer numbers before text leaves the factory for a model or an Oracle SR: passwords, tokens,
 * API keys, Authorization headers, card numbers and account-like numbers. Also finds what must not go into shared
 * knowledge: URLs, IP addresses and the bank's name.
 */
public final class SecretMasker {

    static final String MASK = "****";

    private static final Pattern SECRET_ASSIGNMENT = Pattern.compile(
            "(?i)((?:password|passwd|pwd|secret|token|api[-_]?key|client[-_]?secret|private[-_]?key|credential)s?[\"']?\\s*[:=]\\s*[\"']?)[^\\s\"',;&<]+");
    private static final Pattern AUTHORIZATION = Pattern.compile(
            "(?i)(authorization[\"']?\\s*[:=]\\s*[\"']?)(?:(?:bearer|basic)\\s+)?[^\\s\"',;<]+");
    private static final Pattern BEARER = Pattern.compile("(?i)\\bbearer\\s+[A-Za-z0-9._~+/-]+=*");
    private static final Pattern JWT = Pattern.compile("\\beyJ[\\w-]+\\.[\\w-]+\\.[\\w-]+");
    private static final Pattern DIGITS = Pattern.compile("(?<![\\w.:-])\\d(?:[ -]?\\d){8,18}(?![\\w.:-])");
    private static final Pattern URL = Pattern.compile("https?://[^\\s\"'<>)\\]]+");
    private static final Pattern IP = Pattern.compile("\\b(?:\\d{1,3}\\.){3}\\d{1,3}\\b");

    private SecretMasker() {
    }

    public static String mask(String text) {
        if (text == null || text.isEmpty()) {
            return text;
        }
        String masked = SECRET_ASSIGNMENT.matcher(text).replaceAll("$1" + MASK);
        masked = AUTHORIZATION.matcher(masked).replaceAll("$1" + MASK);
        masked = BEARER.matcher(masked).replaceAll("Bearer " + MASK);
        masked = JWT.matcher(masked).replaceAll(MASK);
        Matcher digits = DIGITS.matcher(masked);
        StringBuilder out = new StringBuilder();
        while (digits.find()) {
            // Card and account numbers (9-19 digits, maybe grouped) keep their last 4 digits
            String number = digits.group().replaceAll("[ -]", "");
            digits.appendReplacement(out, MASK + number.substring(number.length() - 4));
        }
        digits.appendTail(out);
        return out.toString();
    }

    /** URLs, IP addresses and bank names in text meant for every workspace; empty when it can be shared. */
    public static List<String> bankData(String text, Set<String> bankNames) {
        Set<String> found = new LinkedHashSet<>();
        if (text == null) {
            return List.of();
        }
        Matcher url = URL.matcher(text);
        while (url.find()) {
            found.add(url.group());
        }
        Matcher ip = IP.matcher(text);
        while (ip.find()) {
            found.add(ip.group());
        }
        String lower = text.toLowerCase(Locale.ROOT);
        for (String name : bankNames) {
            if (name != null && name.strip().length() >= 3 && lower.contains(name.strip().toLowerCase(Locale.ROOT))) {
                found.add(name.strip());
            }
        }
        return new ArrayList<>(found);
    }
}
