package com.obdx.factory.pack;

import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * How a kind of work is usually built in OBDX, for example a new UI screen or a new service: guidance for the model
 * and the planner, and for each kind of file (part) an optional template and how to find reference examples in the
 * bank's own codebase. The bank's examples win where they differ from a template.
 *
 * @param id       stable identifier
 * @param title    short readable name
 * @param when     when the recipe applies, for the planner
 * @param guidance the steps and conventions, given to the model
 * @param actions  plan actions it applies to (create, modify); empty means both
 * @param layers   plan layers it applies to (data, integration, service, ui, test, config)
 * @param parts    the kinds of files the recipe covers
 * @param source   the pack file it came from
 */
public record Recipe(String id, String title, String when, String guidance, Set<String> actions, Set<String> layers,
                     List<Part> parts, String source) {

    /**
     * @param id       stable identifier within the recipe
     * @param name     readable name, for example "View model"
     * @param files    path globs of plan items this part covers
     * @param exclude  path globs it does not cover
     * @param template template file name (relative to the pack folder), or null
     * @param content  the template's content, or null
     * @param examples how to find reference examples in the bank's code
     */
    public record Part(String id, String name, List<String> files, List<String> exclude, String template, String content,
                       ExampleFinder examples) {

        public Part {
            files = List.copyOf(files);
            exclude = exclude == null ? List.of() : List.copyOf(exclude);
        }

        public boolean covers(String path) {
            String normalized = path.replace('\\', '/');
            return files.stream().anyMatch(glob -> Glob.matches(glob, normalized))
                    && exclude.stream().noneMatch(glob -> Glob.matches(glob, normalized));
        }
    }

    /**
     * @param files    path globs of candidate files
     * @param exclude  path globs to leave out
     * @param contains regular expression a candidate must contain, or null
     * @param count    how many examples to pick
     */
    public record ExampleFinder(List<String> files, List<String> exclude, String contains, int count) {

        public ExampleFinder {
            files = files == null ? List.of() : List.copyOf(files);
            exclude = exclude == null ? List.of() : List.copyOf(exclude);
        }

        public boolean accepts(String path) {
            return files.stream().anyMatch(glob -> Glob.matches(glob, path)) && exclude.stream().noneMatch(glob -> Glob.matches(glob, path));
        }
    }

    /** The match of a plan item to a recipe part. */
    public record Match(Recipe recipe, Part part) {
    }

    public Recipe {
        actions = actions == null ? Set.of() : Set.copyOf(actions);
        layers = layers == null ? Set.of() : Set.copyOf(layers);
        parts = List.copyOf(parts);
    }

    public boolean appliesTo(String action, String layer) {
        return (actions.isEmpty() || (action != null && actions.contains(action.toLowerCase(Locale.ROOT))))
                && (layers.isEmpty() || (layer != null && layers.contains(layer.toLowerCase(Locale.ROOT))));
    }

    public Part part(String partId) {
        return parts.stream().filter(p -> p.id().equals(partId)).findFirst().orElse(null);
    }
}
