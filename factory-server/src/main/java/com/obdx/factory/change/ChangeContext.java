package com.obdx.factory.change;

import com.obdx.factory.design.ScreenModel;
import com.obdx.factory.pack.CheckScope;

import java.util.List;

/**
 * What the model needs to know about a change, prepared as text: the approved spec and designs, the bank's
 * Project Profile and the shape of its codebase; plus what the quick checks of its files run with, the version
 * pack's recipes for the planner (with reference examples from the codebase), the UI target (React Native or React
 * app, empty for the OBDX JET UI) and the approved Screen Models themselves.
 */
public record ChangeContext(String title, String specJson, String designsJson, String profile, String structure,
                            CheckScope checks, String recipes, String target, List<ScreenModel> models) {

    public ChangeContext {
        models = models == null ? List.of() : List.copyOf(models);
    }

    public ChangeContext(String title, String specJson, String designsJson, String profile, String structure) {
        this(title, specJson, designsJson, profile, structure, CheckScope.none(), "", "", List.of());
    }

    /** Keeps prompt sections within a size the model can take. */
    static String cap(String text, int maxChars) {
        if (text == null) {
            return "";
        }
        return text.length() <= maxChars ? text : text.substring(0, maxChars) + "\n... (shortened)";
    }
}
