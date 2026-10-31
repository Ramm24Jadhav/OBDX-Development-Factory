package com.obdx.factory.svn;

import com.obdx.factory.common.BadRequestException;

import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Which SVN URLs the factory works with. A host that starts with "-" would reach ssh as an option
 * (svn+ssh://-oProxyCommand=...), so it is never accepted. A file:// URL reads a repository on the factory's own
 * computer, which may be another bank's: people may give one only where local folders are offered to administrators;
 * the factory's own repositories (demo, trial, local folders made into repositories) are created by the server.
 */
public final class SvnUrls {

    private static final Pattern URL = Pattern.compile("(?i)^(svn|svn\\+ssh|https?|file)://([^/]*)(.*)$");

    private SvnUrls() {
    }

    /**
     * Checks a URL someone entered.
     *
     * @param allowFile whether file:// URLs are allowed (an administrator, with local folders enabled)
     */
    public static void check(String url, boolean allowFile) {
        String u = url == null ? "" : url.strip();
        Matcher m = URL.matcher(u);
        if (!m.matches()) {
            throw new BadRequestException("Enter an svn://, svn+ssh://, http:// or https:// URL");
        }
        if (unsafeHost(u)) {
            throw new BadRequestException("The SVN server's name cannot start with \"-\". Check the URL.");
        }
        if (m.group(1).equalsIgnoreCase("file") && !allowFile) {
            throw new BadRequestException("file:// URLs read folders on the factory's server, so only administrators can use them, "
                    + "and only when local folders are turned on (FACTORY_LOCAL_FOLDERS). Use the SVN server's URL.");
        }
    }

    /** Whether a URL's host starts with "-" (also written %2d), after any user name. */
    static boolean unsafeHost(String url) {
        Matcher m = URL.matcher(url == null ? "" : url.strip());
        if (!m.matches()) {
            return false;
        }
        String authority = m.group(2);
        String host = authority.substring(authority.lastIndexOf('@') + 1).toLowerCase(Locale.ROOT);
        return host.startsWith("-") || host.startsWith("%2d");
    }

    /** Refuses a command argument that is a URL with an unsafe host, whoever made it. */
    static void requireSafe(String argument) {
        if (unsafeHost(argument)) {
            throw new SvnException("Refused an SVN URL whose server name starts with \"-\": " + argument);
        }
    }
}
