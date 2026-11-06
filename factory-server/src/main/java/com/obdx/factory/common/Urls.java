package com.obdx.factory.common;

import java.net.URI;
import java.util.Locale;

/** Comparing the servers that URLs point to. */
public final class Urls {

    private Urls() {
    }

    /**
     * Whether two URLs point to the same server: the same scheme, host and port (the default port of the scheme when
     * none is given). A stored password or token is sent only to the server it was entered for, so it is kept only
     * while this holds.
     */
    public static boolean sameServer(String a, String b) {
        String x = server(a);
        return x != null && x.equals(server(b));
    }

    /** scheme://host:port, lower case; null when the URL cannot be read. */
    static String server(String url) {
        if (url == null || url.isBlank()) {
            return null;
        }
        try {
            URI uri = new URI(url.strip());
            String scheme = uri.getScheme() == null ? null : uri.getScheme().toLowerCase(Locale.ROOT);
            String host = uri.getHost() != null ? uri.getHost() : uri.getAuthority() == null ? "" : uri.getAuthority().replaceAll("^.*@", "");
            if (scheme == null) {
                return null;
            }
            int port = uri.getPort() >= 0 ? uri.getPort() : switch (scheme) {
                case "http" -> 80;
                case "https" -> 443;
                case "svn" -> 3690;
                case "svn+ssh" -> 22;
                default -> -1;
            };
            return scheme + "://" + host.toLowerCase(Locale.ROOT) + ":" + port;
        } catch (java.net.URISyntaxException e) {
            return null;
        }
    }
}
