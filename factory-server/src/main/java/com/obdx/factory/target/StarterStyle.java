package com.obdx.factory.target;

import com.obdx.factory.componentpack.ComponentPackService.Choice;
import com.obdx.factory.componentpack.ComponentPackService.Motion;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Pattern;

/**
 * The file in a starter that holds the workspace's component style (the Component factory's look, motion, mode and
 * brand), and what goes in it. Every starter that draws the designs keeps the style as the same JSON (the shape
 * GET /api/workspaces/{id}/component-style gives for its defaults); the factory writes it in the workspace's starter
 * download and when a change writes the file.
 */
public final class StarterStyle {

    private static final Map<String, String> FILES = Map.of(
            "vue", "src/component-style.json",
            "capacitor", "src/component-style.json",
            TargetPack.ANGULAR, "src/app/component-style.json",
            "jet-core-pack", "src/component-style.json",
            "flutter", "assets/component-style.json");
    private static final Pattern WORD = Pattern.compile("[a-z]+");

    private StarterStyle() {
    }

    /** The style file of the pack's starter, relative to the app folder; empty for a starter without one. */
    public static Optional<String> path(TargetPack pack) {
        return Optional.ofNullable(FILES.get(pack.id())).filter(pack.starter()::containsKey);
    }

    /** The style file's content for the style's defaults. */
    public static String json(Choice defaults) {
        Motion m = defaults.motion() == null ? new Motion(null, null, null) : defaults.motion();
        return "{\n  \"defaults\": { \"look\": " + word(defaults.look(), "elevated") + ", \"motion\": { \"hover\": " + word(m.hover(), "none")
                + ", \"click\": " + word(m.click(), "press") + ", \"scroll\": " + word(m.scroll(), "none") + " }, \"mode\": "
                + word(defaults.mode(), "light") + ", \"brand\": " + word(defaults.brand(), "workspace") + " }\n}\n";
    }

    /** The starter's files with its style file holding the style (the files as they are for a starter without one). */
    public static Map<String, String> apply(TargetPack pack, Choice defaults) {
        Map<String, String> files = new LinkedHashMap<>(pack.starter());
        path(pack).ifPresent(file -> files.put(file, json(defaults)));
        return files;
    }

    // A saved style is checked against the known values; anything else falls back, so the file is always valid JSON
    private static String word(String value, String fallback) {
        return "\"" + (value != null && WORD.matcher(value).matches() ? value : fallback) + "\"";
    }
}
