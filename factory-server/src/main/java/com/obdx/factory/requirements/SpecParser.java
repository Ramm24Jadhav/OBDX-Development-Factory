package com.obdx.factory.requirements;

import tools.jackson.core.JacksonException;
import tools.jackson.core.json.JsonReadFeature;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.function.Function;

/**
 * Reads a specification from JSON written by a model or an analyst. Models are not always exact, so the parser is
 * lenient: it accepts text around the JSON, code fences, comments and trailing commas, a single value where a list
 * is expected, "yes"/"no" for booleans, and ignores unknown properties.
 */
public final class SpecParser {

    private static final Set<String> CHANGE_TYPES = Set.of("new", "enhance", "unknown");
    private static final Set<String> MESSAGE_TYPES = Set.of("error", "warning", "info", "confirmation");

    private static final JsonMapper LENIENT = JsonMapper.builder()
            .enable(JsonReadFeature.ALLOW_JAVA_COMMENTS, JsonReadFeature.ALLOW_TRAILING_COMMA,
                    JsonReadFeature.ALLOW_SINGLE_QUOTES, JsonReadFeature.ALLOW_UNQUOTED_PROPERTY_NAMES)
            .build();

    private SpecParser() {
    }

    public static class InvalidSpecException extends RuntimeException {
        InvalidSpecException(String message, Throwable cause) {
            super(message, cause);
        }
    }

    public static RequirementSpec parse(String text, String fallbackTitle) {
        int start = text.indexOf('{');
        int end = text.lastIndexOf('}');
        if (start < 0 || end <= start) {
            throw new InvalidSpecException("The response contains no JSON object", null);
        }
        JsonNode root;
        try {
            root = LENIENT.readTree(text.substring(start, end + 1));
        } catch (JacksonException e) {
            throw new InvalidSpecException("The response is not valid JSON: " + e.getOriginalMessage(), e);
        }
        return fromJson(root, fallbackTitle);
    }

    static RequirementSpec fromJson(JsonNode root, String fallbackTitle) {
        String title = text(root, "title");
        return new RequirementSpec(
                title != null ? title : fallbackTitle,
                text(root, "summary"),
                list(root, "screens", SpecParser::screen),
                list(root, "businessRules", node -> new RequirementSpec.BusinessRule(
                        text(node, "id"), textOrSelf(node, "description"), strings(node, "screens"), text(node, "reference"))),
                list(root, "roles", node -> new RequirementSpec.Role(textOrSelf(node, "name"), text(node, "access"))),
                list(root, "apis", node -> new RequirementSpec.Api(textOrSelf(node, "name"), upper(text(node, "method")), text(node, "description"))),
                list(root, "hostInteractions", node -> new RequirementSpec.HostInteraction(text(node, "system"), textOrSelf(node, "description"))),
                list(root, "messages", node -> new RequirementSpec.Message(text(node, "code"), textOrSelf(node, "text"),
                        oneOf(text(node, "type"), MESSAGE_TYPES, "info"))),
                list(root, "openQuestions", node -> new RequirementSpec.OpenQuestion(textOrSelf(node, "question"),
                        text(node, "reason"), text(node, "reference"), strings(node, "options"),
                        text(node, "suggestedAnswer"), text(node, "answer"))),
                list(root, "decisions", node -> new RequirementSpec.Decision(text(node, "question"), text(node, "answer"))),
                texts(root, "scope"),
                texts(root, "outOfScope"),
                texts(root, "assumptions"),
                list(root, "requirements", node -> new RequirementSpec.FunctionalRequirement(text(node, "id"), text(node, "title"),
                        textOrSelf(node, "description"), text(node, "priority"), strings(node, "screens"))),
                list(root, "acceptanceCriteria", node -> new RequirementSpec.AcceptanceCriterion(text(node, "id"),
                        textOrSelf(node, "description"), strings(node, "requirements"))),
                list(root, "nonFunctional", node -> new RequirementSpec.NonFunctional(text(node, "id"), text(node, "category"),
                        textOrSelf(node, "description"))));
    }

    private static RequirementSpec.Screen screen(JsonNode node) {
        return new RequirementSpec.Screen(
                textOrSelf(node, "name"),
                oneOf(text(node, "changeType"), CHANGE_TYPES, "unknown"),
                text(node, "description"),
                text(node, "reference"),
                list(node, "fields", field -> new RequirementSpec.Field(
                        textOrSelf(field, "name"), text(field, "label"), lower(text(field, "type")), bool(field.get("mandatory")),
                        strings(field, "validations"), text(field, "defaultValue"), text(field, "source"), text(field, "notes"))),
                list(node, "actions", action -> new RequirementSpec.Action(textOrSelf(action, "name"), text(action, "description"))),
                strings(node, "relatedCode"));
    }

    /** Items without their main text (for example a screen without a name) are dropped. */
    private static <T> List<T> list(JsonNode parent, String name, Function<JsonNode, T> mapper) {
        JsonNode node = parent.get(name);
        List<T> items = new ArrayList<>();
        if (node == null || node.isNull()) {
            return items;
        }
        for (JsonNode item : node.isArray() ? node : List.of(node)) {
            T value = mapper.apply(item);
            if (value != null && !hasBlankKey(value)) {
                items.add(value);
            }
        }
        return items;
    }

    private static boolean hasBlankKey(Object item) {
        return switch (item) {
            case RequirementSpec.Screen s -> blank(s.name());
            case RequirementSpec.Field f -> blank(f.name());
            case RequirementSpec.Action a -> blank(a.name());
            case RequirementSpec.BusinessRule r -> blank(r.description());
            case RequirementSpec.Role r -> blank(r.name());
            case RequirementSpec.Api a -> blank(a.name());
            case RequirementSpec.HostInteraction h -> blank(h.description());
            case RequirementSpec.Message m -> blank(m.text());
            case RequirementSpec.OpenQuestion q -> blank(q.question());
            case RequirementSpec.Decision d -> blank(d.question());
            case RequirementSpec.FunctionalRequirement r -> blank(r.description()) && blank(r.title()) && blank(r.id());
            case RequirementSpec.AcceptanceCriterion c -> blank(c.description());
            case RequirementSpec.NonFunctional n -> blank(n.description());
            default -> false;
        };
    }

    private static boolean blank(String value) {
        return value == null || value.isBlank();
    }

    private static String text(JsonNode node, String name) {
        if (node == null || !node.isObject()) {
            return null;
        }
        JsonNode value = node.get(name);
        if (value == null || value.isNull() || value.isContainer()) {
            return null;
        }
        String text = value.asString().trim();
        return text.isEmpty() ? null : text;
    }

    /** For lists the model sometimes writes as plain strings, for example "roles": ["Retail user"]. */
    private static String textOrSelf(JsonNode node, String name) {
        if (node != null && node.isValueNode() && !node.isNull()) {
            String text = node.asString().trim();
            return text.isEmpty() ? null : text;
        }
        return text(node, name);
    }

    private static List<String> strings(JsonNode node, String name) {
        JsonNode value = node == null || !node.isObject() ? null : node.get(name);
        List<String> result = new ArrayList<>();
        if (value == null || value.isNull()) {
            return result;
        }
        for (JsonNode item : value.isArray() ? value : List.of(value)) {
            if (item.isValueNode() && !item.isNull() && !item.asString().isBlank()) {
                result.add(item.asString().trim());
            }
        }
        return result;
    }

    /** A list of texts the model may also write as objects ({"description": "..."}) or as one text. */
    private static List<String> texts(JsonNode node, String name) {
        List<String> result = new ArrayList<>();
        for (String item : list(node, name, item -> textOrSelf(item, "description") != null ? textOrSelf(item, "description") : text(item, "text"))) {
            if (item != null && !item.isBlank()) {
                result.add(item);
            }
        }
        return result;
    }

    static Boolean bool(JsonNode value) {
        if (value == null || value.isNull()) {
            return null;
        }
        if (value.isBoolean()) {
            return value.booleanValue();
        }
        return switch (value.asString().trim().toLowerCase(Locale.ROOT)) {
            case "true", "yes", "y", "mandatory", "required" -> true;
            case "false", "no", "n", "optional" -> false;
            default -> null;
        };
    }

    private static String oneOf(String value, Set<String> allowed, String fallback) {
        String lower = lower(value);
        return lower != null && allowed.contains(lower) ? lower : fallback;
    }

    private static String lower(String value) {
        return value == null ? null : value.toLowerCase(Locale.ROOT);
    }

    private static String upper(String value) {
        return value == null ? null : value.toUpperCase(Locale.ROOT);
    }
}
