package com.obdx.factory.design;

import com.obdx.factory.common.BadRequestException;
import com.obdx.factory.requirements.RequirementSpec;
import tools.jackson.core.JacksonException;
import tools.jackson.core.json.JsonReadFeature;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.json.JsonMapper;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Creating, reading and checking Screen Models.
 */
public final class ScreenModels {

    private static final Pattern MAX_LENGTH = Pattern.compile("(?i)max(?:imum)?\\s*(?:length|len|chars?|characters)?\\s*(?:of|is|:|=)?\\s*(\\d{1,5})");
    private static final Set<String> CHANGE_TYPES = Set.of("new", "enhance", "unknown");
    private static final Set<String> ACTION_KINDS = Set.of("primary", "secondary", "link");

    private static final JsonMapper LENIENT = JsonMapper.builder()
            .enable(JsonReadFeature.ALLOW_JAVA_COMMENTS, JsonReadFeature.ALLOW_TRAILING_COMMA,
                    JsonReadFeature.ALLOW_SINGLE_QUOTES, JsonReadFeature.ALLOW_UNQUOTED_PROPERTY_NAMES)
            .disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
            .build();

    private ScreenModels() {
    }

    /** A first design for a screen from an approved requirement spec: one section with every field, then the actions. */
    public static ScreenModel fromSpec(RequirementSpec.Screen screen) {
        List<ScreenModel.Component> components = new ArrayList<>();
        for (RequirementSpec.Field field : screen.fields()) {
            Integer maxLength = null;
            for (String validation : field.validations()) {
                Matcher matcher = MAX_LENGTH.matcher(validation);
                if (matcher.find()) {
                    maxLength = Integer.parseInt(matcher.group(1));
                }
            }
            String type = ComponentCatalog.normalize(field.type());
            components.add(new ScreenModel.Component(null, type, field.name(),
                    field.label() != null ? field.label() : humanize(field.name()),
                    field.mandatory(), field.notes(), null, maxLength, field.defaultValue(),
                    ComponentCatalog.find(type).orElseThrow().hasOptions() ? defaultOptions(type) : List.of(),
                    field.validations(), "display".equals(type) ? true : null));
        }
        List<ScreenModel.ActionButton> actions = new ArrayList<>();
        for (RequirementSpec.Action action : screen.actions()) {
            actions.add(new ScreenModel.ActionButton(null, action.name(), actions.isEmpty() ? "primary" : "secondary"));
        }
        if (actions.isEmpty()) {
            actions.add(new ScreenModel.ActionButton(null, "Submit", "primary"));
            actions.add(new ScreenModel.ActionButton(null, "Cancel", "secondary"));
        }
        return normalize(new ScreenModel(screen.name(), screen.name(), screen.description(), screen.changeType(),
                List.of(new ScreenModel.Section(null, "Details", 2, components)), actions));
    }

    public static ScreenModel blank(String name) {
        return normalize(new ScreenModel(name, name, null, "new",
                List.of(new ScreenModel.Section(null, "Details", 2, List.of())),
                List.of(new ScreenModel.ActionButton(null, "Submit", "primary"))));
    }

    /** Reads a Screen Model from JSON (an analyst's edit or a model's answer); text around the JSON is ignored. */
    public static ScreenModel parse(String text) {
        int start = text.indexOf('{');
        int end = text.lastIndexOf('}');
        if (start < 0 || end <= start) {
            throw new BadRequestException("No JSON object found");
        }
        try {
            return normalize(LENIENT.readValue(text.substring(start, end + 1), ScreenModel.class));
        } catch (JacksonException e) {
            throw new BadRequestException("Not a valid screen model: " + e.getOriginalMessage());
        }
    }

    /**
     * Fills in what is missing and fixes what can be fixed: ids, known component types, options for choice
     * components, column counts. Rejects a model without a name.
     */
    public static ScreenModel normalize(ScreenModel model) {
        if (model == null || model.name() == null || model.name().isBlank()) {
            throw new BadRequestException("The screen needs a name");
        }
        Set<String> usedIds = new HashSet<>();
        List<ScreenModel.Section> sections = new ArrayList<>();
        int sectionNumber = 0;
        for (ScreenModel.Section section : nullSafe(model.sections())) {
            sectionNumber++;
            List<ScreenModel.Component> components = new ArrayList<>();
            for (ScreenModel.Component c : nullSafe(section.components())) {
                String type = ComponentCatalog.normalize(c.type());
                String component = blankToNull(c.component());
                if ("component".equals(type) && component == null) {
                    type = "text";
                }
                if (!"component".equals(type)) {
                    component = null;
                }
                Map<String, String> params = new LinkedHashMap<>();
                if (component != null && c.params() != null) {
                    c.params().forEach((key, value) -> {
                        if (key != null && !key.isBlank()) {
                            params.put(key.trim(), value == null ? "" : value.trim());
                        }
                    });
                }
                String name = c.name() != null && !c.name().isBlank() ? c.name().trim() : camel(c.label());
                if (name.isEmpty()) {
                    name = "field";
                }
                List<String> options = new ArrayList<>(new LinkedHashSet<>(nullSafe(c.options()).stream()
                        .filter(o -> o != null && !o.isBlank()).map(String::trim).toList()));
                if (ComponentCatalog.find(type).orElseThrow().hasOptions() && options.isEmpty()) {
                    options = defaultOptions(type);
                }
                components.add(new ScreenModel.Component(uniqueId(c.id(), "c-" + name, usedIds), type, name,
                        c.label() != null && !c.label().isBlank() ? c.label().trim() : humanize(name),
                        c.required(), blankToNull(c.helpText()), blankToNull(c.placeholder()),
                        c.maxLength() != null && c.maxLength() > 0 ? c.maxLength() : null,
                        blankToNull(c.defaultValue()), options, nullSafe(c.validations()), c.readonly(), component, params));
            }
            sections.add(new ScreenModel.Section(uniqueId(section.id(), "s-" + sectionNumber, usedIds),
                    section.title() == null || section.title().isBlank() ? null : section.title().trim(),
                    Math.clamp(section.columns() == null ? 2 : section.columns(), 1, 3), components));
        }
        if (sections.isEmpty()) {
            sections.add(new ScreenModel.Section(uniqueId(null, "s-1", usedIds), "Details", 2, List.of()));
        }
        List<ScreenModel.ActionButton> actions = new ArrayList<>();
        for (ScreenModel.ActionButton action : nullSafe(model.actions())) {
            if (action.label() == null || action.label().isBlank()) {
                continue;
            }
            String kind = action.kind() == null ? "secondary" : action.kind().toLowerCase(Locale.ROOT);
            actions.add(new ScreenModel.ActionButton(uniqueId(action.id(), "a-" + camel(action.label()), usedIds),
                    action.label().trim(), ACTION_KINDS.contains(kind) ? kind : "secondary"));
        }
        String changeType = model.changeType() == null ? "unknown" : model.changeType().toLowerCase(Locale.ROOT);
        return new ScreenModel(model.name().trim(), model.title() == null || model.title().isBlank() ? model.name().trim() : model.title().trim(),
                blankToNull(model.description()), CHANGE_TYPES.contains(changeType) ? changeType : "unknown", sections, actions);
    }

    /** Placeholder choices until the analyst fills them in; a table's options are its columns. */
    private static List<String> defaultOptions(String type) {
        return "table".equals(type) ? List.of("Column 1", "Column 2") : List.of("Option 1", "Option 2");
    }

    private static String uniqueId(String wanted, String fallback, Set<String> used) {
        String base = wanted != null && !wanted.isBlank() ? wanted.trim() : fallback;
        String id = base;
        for (int i = 2; !used.add(id); i++) {
            id = base + "-" + i;
        }
        return id;
    }

    /** "fromAccount" or "from_account" gives "From account". */
    static String humanize(String name) {
        if (name == null || name.isBlank()) {
            return "Field";
        }
        String words = name.replaceAll("([a-z0-9])([A-Z])", "$1 $2").replace('_', ' ').replace('-', ' ').trim().toLowerCase(Locale.ROOT);
        return Character.toUpperCase(words.charAt(0)) + words.substring(1);
    }

    /** "From account" gives "fromAccount". */
    static String camel(String label) {
        if (label == null) {
            return "";
        }
        String[] words = label.trim().replaceAll("[^A-Za-z0-9 ]", " ").trim().split("\\s+");
        StringBuilder name = new StringBuilder();
        for (String word : words) {
            if (word.isEmpty()) {
                continue;
            }
            name.append(name.isEmpty() ? word.toLowerCase(Locale.ROOT)
                    : Character.toUpperCase(word.charAt(0)) + word.substring(1).toLowerCase(Locale.ROOT));
        }
        return name.toString();
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private static <T> List<T> nullSafe(List<T> list) {
        return list == null ? List.of() : list;
    }
}
