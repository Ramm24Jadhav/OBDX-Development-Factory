package com.obdx.factory.target;

import com.obdx.factory.pack.PackRule;
import com.obdx.factory.pack.Recipe;

import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * How the factory turns approved Screen Models into code for one UI technology (target-packs/&lt;id&gt;). The "jet"
 * pack is the bank's existing OBDX UI: it has no mapping, templates or starter, because the codebase and the version
 * pack decide everything there.
 *
 * @param preview          which renderer the designer uses: jet, react-native or react
 * @param defaultAppFolder suggested folder of the new app in the bank's repository
 * @param structure        where kinds of files go, relative to the app folder (screen, test, api, texts, navigation)
 * @param components       Screen Model component type to starter component
 * @param templates        template name (screen, test) to content
 * @param starter          starter project: path relative to the app folder to content
 */
public record TargetPack(String id, String title, String description, String preview, String defaultAppFolder,
                         Map<String, String> structure, Map<String, ComponentMapping> components, Map<String, String> templates,
                         String guidance, List<PackRule> rules, List<Recipe> recipes, Map<String, String> starter) {

    public static final String JET = "jet";

    /**
     * @param component starter component name, for example TextField
     * @param value     string, list or boolean: the type of the field's value
     * @param options   whether the component takes a list of options
     * @param props     extra JSX props, for example "multiline", or null
     */
    public record ComponentMapping(String component, String value, boolean options, String props) {
    }

    public TargetPack {
        structure = Map.copyOf(structure);
        components = Map.copyOf(components);
        templates = Map.copyOf(templates);
        rules = List.copyOf(rules);
        recipes = List.copyOf(recipes);
        starter = Map.copyOf(starter);
    }

    public boolean isJet() {
        return JET.equals(id);
    }

    /** The first recipe part that covers a file of the app, if any. */
    public Optional<Recipe.Match> recipeFor(String path, String action, String layer) {
        for (Recipe recipe : recipes) {
            if (recipe.appliesTo(action, layer)) {
                for (Recipe.Part part : recipe.parts()) {
                    if (part.covers(path)) {
                        return Optional.of(new Recipe.Match(recipe, part));
                    }
                }
            }
        }
        return Optional.empty();
    }
}
