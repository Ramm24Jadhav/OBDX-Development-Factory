package com.obdx.factory.design;

import java.util.List;

/**
 * A target-neutral description of one screen: what it shows and does, not how a UI technology implements it.
 * The designer edits it, the preview renders it, and code generation will follow the approved version.
 *
 * @param changeType "new", "enhance" or "unknown", as in the requirement spec
 */
public record ScreenModel(String name, String title, String description, String changeType,
                          List<Section> sections, List<ActionButton> actions) {

    /** A group of components shown together; columns is the number of columns on wide screens (1 to 3). */
    public record Section(String id, String title, Integer columns, List<Component> components) {
    }

    /**
     * One input or display element. type is one of the {@link ComponentCatalog} types. Optional attributes are
     * null when not set.
     */
    public record Component(String id, String type, String name, String label, Boolean required, String helpText,
                            String placeholder, Integer maxLength, String defaultValue, List<String> options,
                            List<String> validations, Boolean readonly) {
    }

    /** kind: "primary", "secondary" or "link". */
    public record ActionButton(String id, String label, String kind) {
    }
}
