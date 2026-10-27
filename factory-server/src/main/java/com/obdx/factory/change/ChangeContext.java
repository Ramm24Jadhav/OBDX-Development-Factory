package com.obdx.factory.change;

import com.obdx.factory.pack.CheckScope;

/**
 * What the model needs to know about a change, prepared as text: the approved spec and designs, the bank's
 * Project Profile and the shape of its codebase; plus what the quick checks of its files run with.
 */
public record ChangeContext(String title, String specJson, String designsJson, String profile, String structure,
                            CheckScope checks) {

    public ChangeContext(String title, String specJson, String designsJson, String profile, String structure) {
        this(title, specJson, designsJson, profile, structure, CheckScope.none());
    }

    /** Keeps prompt sections within a size the model can take. */
    static String cap(String text, int maxChars) {
        if (text == null) {
            return "";
        }
        return text.length() <= maxChars ? text : text.substring(0, maxChars) + "\n... (shortened)";
    }
}
