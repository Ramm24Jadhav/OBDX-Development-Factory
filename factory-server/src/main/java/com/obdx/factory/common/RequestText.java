package com.obdx.factory.common;

/**
 * Checks text from a request before it reaches SQL or the file system: PostgreSQL refuses a NUL character and Java
 * file paths fail on it, both with an error that would otherwise be a 500.
 */
public final class RequestText {

    private RequestText() {
    }

    /** A path (or a part of one to search for) without NUL or other control characters. */
    public static boolean validPath(String path) {
        return path != null && path.chars().noneMatch(c -> c < 0x20 || c == 0x7f);
    }

    public static String requirePath(String path) {
        if (!validPath(path)) {
            throw new BadRequestException("The path is not valid: it has a character that file names cannot have. Check the path.");
        }
        return path;
    }

    /** Text such as a file's content or a note: anything but a NUL character. */
    public static String requireText(String text) {
        if (text != null && text.indexOf('\0') >= 0) {
            throw new BadRequestException("The text has a NUL character, which cannot be stored. Remove it and try again.");
        }
        return text;
    }
}
