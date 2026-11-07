package com.obdx.factory.design;

import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

/**
 * The component types a Screen Model may use, and how they map to Oracle JET (the first target). Other targets
 * (React Native, React) will map the same types to their own components.
 */
public final class ComponentCatalog {

    /** hasOptions: the component needs a list of options to choose from. */
    public record ComponentType(String type, String label, String jetComponent, boolean hasOptions) {
    }

    public static final List<ComponentType> TYPES = List.of(
            new ComponentType("text", "Text box", "oj-input-text", false),
            new ComponentType("textarea", "Multi-line text", "oj-text-area", false),
            new ComponentType("number", "Number", "oj-input-number", false),
            new ComponentType("amount", "Amount", "oj-input-number (currency)", false),
            new ComponentType("date", "Date picker", "oj-input-date", false),
            new ComponentType("select", "Dropdown", "oj-select-single", true),
            new ComponentType("account", "Account selector", "oj-select-single (accounts)", true),
            new ComponentType("radio", "Radio buttons", "oj-radioset", true),
            new ComponentType("checkbox", "Checkboxes", "oj-checkboxset", true),
            new ComponentType("switch", "Switch (on/off)", "oj-switch", false),
            new ComponentType("display", "Read-only text", "oj-bind-text", false),
            new ComponentType("table", "Table (options are its columns)", "oj-table", true),
            new ComponentType("component", "Component from the bank's code", "the component named in the design", false));

    /** Requirement spec field types and common synonyms, mapped to catalog types. */
    private static final Map<String, String> ALIASES = Map.ofEntries(
            Map.entry("dropdown", "select"), Map.entry("list", "select"), Map.entry("combobox", "select"),
            Map.entry("lov", "select"), Map.entry("currency", "amount"), Map.entry("money", "amount"),
            Map.entry("decimal", "number"), Map.entry("integer", "number"), Map.entry("datepicker", "date"),
            Map.entry("toggle", "switch"), Map.entry("boolean", "switch"), Map.entry("label", "display"),
            Map.entry("readonly", "display"), Map.entry("textbox", "text"), Map.entry("string", "text"),
            Map.entry("grid", "table"), Map.entry("other", "text"));

    private ComponentCatalog() {
    }

    public static Optional<ComponentType> find(String type) {
        return TYPES.stream().filter(t -> t.type().equals(type)).findFirst();
    }

    /** The catalog type for a type name from a spec or a model, falling back to "text". */
    public static String normalize(String type) {
        if (type == null) {
            return "text";
        }
        String lower = type.toLowerCase(Locale.ROOT).replaceAll("[^a-z]", "");
        if (find(lower).isPresent()) {
            return lower;
        }
        return ALIASES.getOrDefault(lower, "text");
    }
}
