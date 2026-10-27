package com.obdx.factory.pack;

import java.util.List;
import java.util.Optional;

/**
 * What the factory knows about one OBDX release line: the quick checks for generated code, the Java level to
 * assume when the Project Profile does not show one, and recipes (guidance, templates, how to find reference
 * examples) for the usual kinds of work.
 *
 * @param version     "22.x" or "25.x"
 * @param description shown in the UI
 * @param javaLevel   Java language level used to parse generated Java when the profile has no Java version
 * @param rules       the pack's own rules plus the common ones
 * @param recipes     the pack's own recipes plus the common ones, in the order they are tried
 */
public record VersionPack(String version, String description, int javaLevel, List<PackRule> rules, List<Recipe> recipes) {

    public VersionPack {
        rules = List.copyOf(rules);
        recipes = List.copyOf(recipes);
    }

    /** The first recipe part that covers a plan item, if any. */
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

    public Optional<Recipe> recipe(String id) {
        return recipes.stream().filter(r -> r.id().equals(id)).findFirst();
    }
}
