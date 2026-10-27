package com.obdx.factory.pack;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Pattern;

/**
 * Path globs as in Ant and Maven: "*" matches within one folder, "**" across folders, and "**&#47;" also matches no
 * folder at all (so "**&#47;*.js" matches "a.js" too).
 */
final class Glob {

    private static final Map<String, Pattern> CACHE = new ConcurrentHashMap<>();

    private Glob() {
    }

    static boolean matches(String glob, String path) {
        return CACHE.computeIfAbsent(glob, Glob::compile).matcher(path).matches();
    }

    static Pattern compile(String glob) {
        StringBuilder regex = new StringBuilder();
        for (int i = 0; i < glob.length(); i++) {
            char c = glob.charAt(i);
            if (c == '*' && i + 1 < glob.length() && glob.charAt(i + 1) == '*') {
                if (i + 2 < glob.length() && glob.charAt(i + 2) == '/') {
                    regex.append("(?:.*/)?");
                    i += 2;
                } else {
                    regex.append(".*");
                    i++;
                }
            } else if (c == '*') {
                regex.append("[^/]*");
            } else if (c == '?') {
                regex.append("[^/]");
            } else {
                regex.append(Pattern.quote(String.valueOf(c)));
            }
        }
        return Pattern.compile(regex.toString(), Pattern.CASE_INSENSITIVE);
    }
}
