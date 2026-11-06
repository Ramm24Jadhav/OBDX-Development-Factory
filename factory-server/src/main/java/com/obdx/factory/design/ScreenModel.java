package com.obdx.factory.design;

import java.util.List;
import java.util.Map;

/**
 * A target-neutral description of one screen: what it shows and does, not how a UI technology implements it.
 * The designer edits it, the preview renders it, and code generation will follow the approved version.
 *
 * @param changeType "new", "enhance" or "unknown", as in the requirement spec
 * @param stage      where the screen sits in an OBDX transaction flow: "initiate", "review", "confirm", or
 *                   "inquiry" for lists and lookups; null when not set
 * @param channels   where the screen is used: "desktop", "tablet", "mobile-web", "mobile-app"; empty means all
 */
public record ScreenModel(String name, String title, String description, String changeType,
                          List<Section> sections, List<ActionButton> actions, String stage, List<String> channels) {

    public ScreenModel(String name, String title, String description, String changeType,
                       List<Section> sections, List<ActionButton> actions) {
        this(name, title, description, changeType, sections, actions, null, List.of());
    }

    /** A group of components shown together; columns is the number of columns on wide screens (1 to 3). */
    public record Section(String id, String title, Integer columns, List<Component> components) {
    }

    /**
     * One input or display element. type is one of the {@link ComponentCatalog} types. Optional attributes are
     * null when not set. For a table, options are its columns.
     *
     * @param component    for type "component": the bank's existing component to use, as named in its code (for
     *                     example account-input or oj-list-view); null otherwise
     * @param params       values for that component's parameters, by name
     * @param html         the designer's own markup for this element, drawn instead of the generated one; null if none
     * @param css          the designer's own styles for this element ("&" stands for the element); null if none
     * @param script       the designer's own script for this element's markup; null if none
     * @param dataSource   where the element's values come from (an API) instead of its fixed options; null if fixed
     * @param visibleWhen  the element is shown only while this holds; null: always shown
     * @param requiredWhen the element is mandatory only while this holds; null: as "required" says
     */
    public record Component(String id, String type, String name, String label, Boolean required, String helpText,
                            String placeholder, Integer maxLength, String defaultValue, List<String> options,
                            List<String> validations, Boolean readonly, String component, Map<String, String> params,
                            String html, String css, String script, DataSource dataSource, Condition visibleWhen,
                            Condition requiredWhen) {

        public Component(String id, String type, String name, String label, Boolean required, String helpText,
                         String placeholder, Integer maxLength, String defaultValue, List<String> options,
                         List<String> validations, Boolean readonly) {
            this(id, type, name, label, required, helpText, placeholder, maxLength, defaultValue, options, validations,
                    readonly, null, Map.of(), null, null, null, null, null, null);
        }
    }

    /**
     * Values loaded from an API, for example the customer's accounts.
     *
     * @param api        the call, for example "GET /digx/v1/accounts/demandDeposit"
     * @param path       where the list is in the response, for example "accounts"; null: the response is the list
     * @param valueField the field of each item used as the value, for example "id.value"
     * @param labelField the field shown to the user, for example "displayName"
     */
    public record DataSource(String api, String path, String valueField, String labelField) {
    }

    /**
     * A condition on another element of the screen.
     *
     * @param field    the id of that element
     * @param operator "filled", "empty", "equals" or "notEquals"
     * @param value    the value for equals and notEquals
     */
    public record Condition(String field, String operator, String value) {
    }

    /** kind: "primary", "secondary" or "link". */
    public record ActionButton(String id, String label, String kind) {
    }
}
