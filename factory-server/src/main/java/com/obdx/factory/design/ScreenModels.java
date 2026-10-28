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
import java.util.Objects;
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
    private static final int MAX_CODE = 20_000;
    public static final Set<String> STAGES = Set.of("initiate", "review", "confirm", "inquiry");
    public static final Set<String> CHANNELS = Set.of("desktop", "tablet", "mobile-web", "mobile-app");
    private static final Set<String> OPERATORS = Set.of("filled", "empty", "equals", "notEquals");

    private static final JsonMapper LENIENT = JsonMapper.builder()
            .enable(JsonReadFeature.ALLOW_JAVA_COMMENTS, JsonReadFeature.ALLOW_TRAILING_COMMA,
                    JsonReadFeature.ALLOW_SINGLE_QUOTES, JsonReadFeature.ALLOW_UNQUOTED_PROPERTY_NAMES)
            .disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
            .build();

    private ScreenModels() {
    }

    public static ScreenModel fromSpec(RequirementSpec.Screen screen) {
        return fromSpec(screen, List.of());
    }

    /**
     * A first design for a screen from an approved requirement spec: one section with every field, then the actions.
     * Its stage is guessed from its name.
     *
     * @param channels the channels the requirement names (empty: all)
     */
    public static ScreenModel fromSpec(RequirementSpec.Screen screen, List<String> channels) {
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
                List.of(new ScreenModel.Section(null, "Details", 2, components)), actions, guessStage(screen.name()), channels));
    }

    /**
     * The review and confirmation screens of an OBDX transaction flow, from its initiate screen: review shows every
     * field read-only with Confirm and Back; confirmation shows the outcome, a reference and the key details.
     */
    public static List<ScreenModel> reviewAndConfirm(ScreenModel initiate) {
        List<ScreenModel.Section> reviewSections = new ArrayList<>();
        List<ScreenModel.Component> keyDetails = new ArrayList<>();
        for (ScreenModel.Section section : initiate.sections()) {
            List<ScreenModel.Component> shown = new ArrayList<>();
            for (ScreenModel.Component c : section.components()) {
                if ("table".equals(c.type())) {
                    continue;
                }
                ScreenModel.Component display = new ScreenModel.Component(null, "display", c.name(), c.label(), null, null, null,
                        null, null, List.of(), List.of(), true);
                shown.add(display);
                if (keyDetails.size() < 4) {
                    keyDetails.add(display);
                }
            }
            reviewSections.add(new ScreenModel.Section(null, section.title() == null ? "Review details" : section.title(),
                    section.columns(), shown));
        }
        ScreenModel review = normalize(new ScreenModel(initiate.name() + " – Review", "Review " + initiate.title(),
                "Check the details before confirming", initiate.changeType(), reviewSections,
                List.of(new ScreenModel.ActionButton(null, "Confirm", "primary"), new ScreenModel.ActionButton(null, "Back", "secondary"),
                        new ScreenModel.ActionButton(null, "Cancel", "link")), "review", initiate.channels()));
        List<ScreenModel.Component> outcome = new ArrayList<>();
        outcome.add(new ScreenModel.Component(null, "display", "status", "Status", null, null, null, null,
                "Your request was submitted successfully", List.of(), List.of(), true));
        outcome.add(new ScreenModel.Component(null, "display", "referenceNumber", "Reference number", null, null, null, null,
                null, List.of(), List.of(), true));
        outcome.addAll(keyDetails);
        ScreenModel confirm = normalize(new ScreenModel(initiate.name() + " – Confirmation", initiate.title() + " – Done",
                "The outcome of the transaction", initiate.changeType(),
                List.of(new ScreenModel.Section(null, "Confirmation", 2, outcome)),
                List.of(new ScreenModel.ActionButton(null, "Go to dashboard", "primary"),
                        new ScreenModel.ActionButton(null, "Start another", "secondary")), "confirm", initiate.channels()));
        return List.of(review, confirm);
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
                        blankToNull(c.defaultValue()), options, nullSafe(c.validations()), c.readonly(), component, params,
                        code(c.html(), "HTML"), code(c.css(), "CSS"), code(c.script(), "script"),
                        dataSource(c.dataSource()), c.visibleWhen(), c.requiredWhen()));
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
        String stage = model.stage() == null ? null : model.stage().strip().toLowerCase(Locale.ROOT);
        List<String> channels = nullSafe(model.channels()).stream().filter(Objects::nonNull)
                .map(c -> c.strip().toLowerCase(Locale.ROOT)).filter(CHANNELS::contains).distinct().toList();
        return new ScreenModel(model.name().trim(), model.title() == null || model.title().isBlank() ? model.name().trim() : model.title().trim(),
                blankToNull(model.description()), CHANGE_TYPES.contains(changeType) ? changeType : "unknown",
                withConditions(sections), actions, stage != null && STAGES.contains(stage) ? stage : null, channels);
    }

    /** A data source needs its API; the rest is optional. */
    private static ScreenModel.DataSource dataSource(ScreenModel.DataSource source) {
        if (source == null || blankToNull(source.api()) == null) {
            return null;
        }
        return new ScreenModel.DataSource(source.api().strip(), blankToNull(source.path()), blankToNull(source.valueField()),
                blankToNull(source.labelField()));
    }

    /**
     * Conditions refer to another element by its id (or, as models sometimes write them, its name or label); they are
     * resolved to the id, and dropped when the element is not on the screen or is the element itself.
     */
    private static List<ScreenModel.Section> withConditions(List<ScreenModel.Section> sections) {
        Map<String, String> ids = new LinkedHashMap<>();
        sections.forEach(s -> s.components().forEach(c -> {
            ids.putIfAbsent(c.id(), c.id());
            ids.putIfAbsent(c.name().toLowerCase(Locale.ROOT), c.id());
            ids.putIfAbsent(c.label().toLowerCase(Locale.ROOT), c.id());
        }));
        return sections.stream().map(s -> new ScreenModel.Section(s.id(), s.title(), s.columns(), s.components().stream()
                .map(c -> new ScreenModel.Component(c.id(), c.type(), c.name(), c.label(), c.required(), c.helpText(), c.placeholder(),
                        c.maxLength(), c.defaultValue(), c.options(), c.validations(), c.readonly(), c.component(), c.params(),
                        c.html(), c.css(), c.script(), c.dataSource(), condition(c.visibleWhen(), c.id(), ids),
                        condition(c.requiredWhen(), c.id(), ids)))
                .toList())).toList();
    }

    private static ScreenModel.Condition condition(ScreenModel.Condition condition, String self, Map<String, String> ids) {
        if (condition == null || condition.field() == null) {
            return null;
        }
        String field = ids.getOrDefault(condition.field().strip(), ids.get(condition.field().strip().toLowerCase(Locale.ROOT)));
        String operator = condition.operator() == null ? "filled" : condition.operator().strip();
        if (field == null || field.equals(self) || !OPERATORS.contains(operator)) {
            return null;
        }
        boolean needsValue = operator.equals("equals") || operator.equals("notEquals");
        return new ScreenModel.Condition(field, operator, needsValue ? (condition.value() == null ? "" : condition.value().strip()) : null);
    }

    /** The stage a screen of a requirement most likely has, from its name. */
    static String guessStage(String name) {
        String lower = name == null ? "" : name.toLowerCase(Locale.ROOT);
        if (lower.matches(".*\\b(review|verify|preview)\\b.*")) {
            return "review";
        }
        if (lower.matches(".*\\b(confirm\\w*|acknowledg\\w*|success|receipt)\\b.*")) {
            return "confirm";
        }
        if (lower.matches(".*\\b(list|book|history|holdings?|summary|search|details|view|statement|inquiry|enquiry|dashboard|overview)\\b.*")) {
            return "inquiry";
        }
        return "initiate";
    }

    /**
     * The channels a requirement names (web, tablet, mobile web, mobile app), from its text; empty when it names none
     * or several in a way that cannot be told apart, which means all channels.
     */
    public static List<String> channelsIn(String text) {
        String lower = text == null ? "" : text.toLowerCase(Locale.ROOT);
        List<String> found = new ArrayList<>();
        if (lower.matches("(?s).*((?<!mobile )\\b(web|browser)\\b|\\b(desktop|internet banking)\\b).*")) {
            found.add("desktop");
        }
        if (lower.matches("(?s).*\\b(tablet|ipad)s?\\b.*")) {
            found.add("tablet");
        }
        if (lower.matches("(?s).*\\bmobile (web|browser|site)\\b.*")) {
            found.add("mobile-web");
        }
        if (lower.matches("(?s).*\\b(mobile app|mobile application|android|ios|iphone|app store|play store)\\b.*")) {
            found.add("mobile-app");
        }
        return found;
    }

    /** Whether the model has a component, section or action button with this id. */
    public static boolean contains(ScreenModel model, String id) {
        return model.sections().stream().anyMatch(s -> s.id().equals(id) || s.components().stream().anyMatch(c -> c.id().equals(id)))
                || model.actions().stream().anyMatch(a -> a.id().equals(id));
    }

    /**
     * The current model with only one element changed as in the model's answer: a component, section or action takes
     * the answer's version of it, or is removed when the answer left it out. Components the answer adds right after a
     * changed component are kept with it. Everything else stays exactly as it was.
     */
    public static ScreenModel onlyChange(ScreenModel current, ScreenModel answer, String id) {
        List<ScreenModel.Section> sections = new ArrayList<>();
        List<ScreenModel.ActionButton> actions = new ArrayList<>(current.actions());
        Set<String> existing = new HashSet<>();
        current.sections().forEach(s -> s.components().forEach(c -> existing.add(c.id())));
        for (ScreenModel.Section section : current.sections()) {
            if (section.id().equals(id)) {
                answer.sections().stream().filter(s -> s.id().equals(id)).findFirst().ifPresent(sections::add);
                continue;
            }
            List<ScreenModel.Component> components = new ArrayList<>();
            for (ScreenModel.Component c : section.components()) {
                if (!c.id().equals(id)) {
                    components.add(c);
                    continue;
                }
                for (ScreenModel.Section answered : answer.sections()) {
                    List<ScreenModel.Component> list = answered.components();
                    for (int i = 0; i < list.size(); i++) {
                        if (!list.get(i).id().equals(id)) {
                            continue;
                        }
                        components.add(list.get(i));
                        for (int j = i + 1; j < list.size() && !existing.contains(list.get(j).id()); j++) {
                            components.add(list.get(j));
                        }
                    }
                }
            }
            sections.add(new ScreenModel.Section(section.id(), section.title(), section.columns(), components));
        }
        int index = indexOfAction(current.actions(), id);
        if (index >= 0) {
            int answered = indexOfAction(answer.actions(), id);
            if (answered >= 0) {
                actions.set(index, answer.actions().get(answered));
            } else {
                actions.remove(index);
            }
        }
        return normalize(new ScreenModel(current.name(), current.title(), current.description(), current.changeType(), sections, actions,
                current.stage(), current.channels()));
    }

    private static int indexOfAction(List<ScreenModel.ActionButton> actions, String id) {
        for (int i = 0; i < actions.size(); i++) {
            if (actions.get(i).id().equals(id)) {
                return i;
            }
        }
        return -1;
    }

    /** A designer's own HTML, CSS or script for an element: kept as written, without surrounding blank lines. */
    private static String code(String value, String what) {
        if (value == null || value.isBlank()) {
            return null;
        }
        if (value.length() > MAX_CODE) {
            throw new BadRequestException("The " + what + " of an element is longer than " + MAX_CODE + " characters");
        }
        return value.strip();
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
