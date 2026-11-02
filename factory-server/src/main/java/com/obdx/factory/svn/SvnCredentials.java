package com.obdx.factory.svn;

/**
 * Service account for an SVN repository. Both values may be null for repositories that allow anonymous read. The
 * password is masked in messages and the log once svn is run with it (SvnClient; an SVN server's error can echo it).
 */
public record SvnCredentials(String username, String password) {

    public static final SvnCredentials NONE = new SvnCredentials(null, null);

    boolean present() {
        return username != null && !username.isBlank();
    }

    @Override
    public String toString() {
        return "SvnCredentials[username=" + username + ", password=" + (password == null ? "none" : "***") + "]";
    }
}
