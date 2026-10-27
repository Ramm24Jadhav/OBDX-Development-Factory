package com.obdx.factory.target;

import com.obdx.factory.design.ScreenModel;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.json.JsonMapper;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.TreeSet;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/**
 * Turns an approved Screen Model into the starting point of a React Native or React screen, its test and its texts,
 * with the target pack's component mapping and templates. Deterministic: the same model gives the same code. The
 * model writing the file starts from it, and parity (every field and action as a testID) is checked afterwards.
 */
public final class ScreenScaffolder {

    /**
     * @param kind        screen, test or texts
     * @param content     the generated starting point
     * @param expectedIds Screen Model ids that must appear as testID in the finished file (screens only)
     */
    public record Scaffold(String kind, String content, List<String> expectedIds) {
    }

    private static final JsonMapper JSON = JsonMapper.builder().build();
    private static final Pattern WORDS = Pattern.compile("[A-Z]+(?![a-z])|[A-Z]?[a-z]+|[0-9]+");
    private static final Pattern CONDITIONAL = Pattern.compile("\\{\\{(\\w+):\\n(.*?)\\n}}\\n?", Pattern.DOTALL);

    private ScreenScaffolder() {
    }

    /** "Fund Transfer", "fund_transfer" and "FundTransfer" give FundTransfer. */
    public static String pascal(String text) {
        StringBuilder out = new StringBuilder();
        Matcher matcher = WORDS.matcher(text == null ? "" : text);
        while (matcher.find()) {
            String word = matcher.group().toLowerCase(Locale.ROOT);
            out.append(Character.toUpperCase(word.charAt(0))).append(word.substring(1));
        }
        String result = out.toString();
        return result.isEmpty() || Character.isDigit(result.charAt(0)) ? "Screen" + result : result;
    }

    /** "Fund Transfer" gives fundTransfer. */
    public static String camel(String text) {
        String pascal = pascal(text);
        return Character.toLowerCase(pascal.charAt(0)) + pascal.substring(1);
    }

    /** The file of a screen, relative to the app folder. */
    public static String screenPath(TargetPack pack, ScreenModel model, String module) {
        return pack.structure().get("screen").replace("{module}", module).replace("{Screen}", pascal(model.name()));
    }

    /** The starting point for one plan item of the app, if the factory can generate one for it. */
    public static Optional<Scaffold> forFile(TargetPack pack, String appFolder, String path, List<ScreenModel> models, String current) {
        if (pack.isJet() || appFolder == null || models.isEmpty() || !path.startsWith(appFolder + "/")) {
            return Optional.empty();
        }
        String relative = path.substring(appFolder.length() + 1);
        if (relative.equals(pack.structure().get("texts"))) {
            String base = current != null ? current : pack.starter().getOrDefault(relative, "{}");
            return Optional.of(new Scaffold("texts", texts(base, models), List.of()));
        }
        for (String kind : List.of("screen", "test")) {
            Matcher matcher = pattern(pack.structure().get(kind)).matcher(relative);
            if (matcher.matches()) {
                ScreenModel model = byName(models, matcher.group("screen"));
                if (model == null) {
                    return Optional.empty();
                }
                return Optional.of(kind.equals("screen") ? screen(pack, model, matcher.group("module")) : test(pack, model));
            }
        }
        return Optional.empty();
    }

    public static Scaffold screen(TargetPack pack, ScreenModel model, String module) {
        Naming names = new Naming(model);
        String key = camel(model.name());
        Set<String> imports = new TreeSet<>(List.of("Button", "Screen", "Section"));
        StringBuilder options = new StringBuilder();
        StringBuilder initial = new StringBuilder();
        StringBuilder rules = new StringBuilder();
        StringBuilder sections = new StringBuilder();
        List<String> ids = new ArrayList<>();
        for (ScreenModel.Section section : model.sections()) {
            sections.append("      <Section").append(section.title() == null || section.title().isBlank() ? ""
                            : " title={t('" + key + "." + names.section(section) + "')}")
                    .append(" columns={").append(section.columns() == null ? 1 : section.columns()).append("}>\n");
            for (ScreenModel.Component c : section.components()) {
                TargetPack.ComponentMapping mapping = pack.components().getOrDefault(c.type(), pack.components().get("text"));
                String name = names.field(c);
                imports.add(mapping.component());
                ids.add(c.id());
                initial.append("    ").append(name).append(": ").append(initialValue(mapping, c)).append(",\n");
                boolean display = "display".equals(c.type());
                boolean required = Boolean.TRUE.equals(c.required()) && !Boolean.TRUE.equals(c.readonly()) && !display
                        && !"boolean".equals(mapping.value());
                if (c.validations() != null && !c.validations().isEmpty()) {
                    rules.append("    // From the spec: ").append(c.validations().stream().map(v -> "\"" + v + "\"").collect(Collectors.joining("; ")))
                            .append(" (add a check: (value) => message when not valid)\n");
                }
                if (required || c.maxLength() != null || (c.validations() != null && !c.validations().isEmpty())) {
                    rules.append("    ").append(name).append(": { label: t('").append(key).append('.').append(name).append("')")
                            .append(required ? ", required: true" : "").append(c.maxLength() != null ? ", maxLength: " + c.maxLength() : "")
                            .append(" },\n");
                }
                if (mapping.options()) {
                    options.append("  const ").append(name).append("Options");
                    if ("account".equals(c.type())) {
                        options.append(": string[] = []; // The customer's accounts (masked numbers): load them with the accounts API.\n");
                    } else if (c.options() == null || c.options().isEmpty()) {
                        options.append(": string[] = []; // Options: from the OBDX service or the spec.\n");
                    } else {
                        options.append(" = [").append(c.options().stream().map(ScreenScaffolder::quote).collect(Collectors.joining(", "))).append("];\n");
                    }
                }
                sections.append(element(mapping, c, name, key, display));
            }
            sections.append("      </Section>\n");
        }
        StringBuilder actions = new StringBuilder();
        boolean submitUsed = false;
        for (ScreenModel.ActionButton action : model.actions()) {
            ids.add(action.id());
            String kind = action.kind() == null ? "secondary" : action.kind();
            boolean submit = !submitUsed && "primary".equals(kind);
            submitUsed |= submit;
            actions.append("          <Button testID=").append(attribute(action.id())).append(" label={t('").append(key).append('.')
                    .append(names.action(action)).append("')} variant=\"").append(kind).append('"')
                    .append(submit ? " disabled={busy} onPress={submit}" : " onPress={() => onAction?.(" + quote(action.id()) + ")}")
                    .append(" />\n");
        }
        String template = pack.templates().get("screen");
        if (template.contains("theme.")) {
            imports.add("theme");
        }
        Map<String, String> values = new LinkedHashMap<>();
        values.put("imports", String.join(", ", imports));
        values.put("optionLists", options.toString());
        values.put("initialValues", initial.toString());
        values.put("rules", rules.toString());
        values.put("sections", sections.toString());
        values.put("actions", actions.toString());
        values.putAll(common(model, module));
        return new Scaffold("screen", fill(template, values, Map.of()), List.copyOf(ids));
    }

    public static Scaffold test(TargetPack pack, ScreenModel model) {
        List<String> ids = new ArrayList<>();
        int required = 0;
        for (ScreenModel.Section section : model.sections()) {
            for (ScreenModel.Component c : section.components()) {
                ids.add(c.id());
                TargetPack.ComponentMapping mapping = pack.components().getOrDefault(c.type(), pack.components().get("text"));
                boolean empty = c.defaultValue() == null || c.defaultValue().isBlank();
                if (Boolean.TRUE.equals(c.required()) && !Boolean.TRUE.equals(c.readonly()) && !"display".equals(c.type())
                        && !"boolean".equals(mapping.value()) && empty) {
                    required++;
                }
            }
        }
        model.actions().forEach(a -> ids.add(a.id()));
        String primary = model.actions().stream().filter(a -> "primary".equals(a.kind())).map(ScreenModel.ActionButton::id).findFirst().orElse(null);
        Map<String, String> values = new LinkedHashMap<>(common(model, null));
        values.put("componentIds", ids.stream().map(ScreenScaffolder::quote).collect(Collectors.joining(", ")));
        values.put("primaryAction", primary == null ? "" : primary.replace("'", "\\'"));
        values.put("requiredCount", String.valueOf(required));
        return new Scaffold("test", fill(pack.templates().get("test"), values, Map.of("requiredTest", required > 0 && primary != null)), List.of());
    }

    /** The texts file with each model's block (title, sections, fields, help, placeholders, actions) added or replaced. */
    @SuppressWarnings("unchecked")
    public static String texts(String currentJson, List<ScreenModel> models) {
        Map<String, Object> texts;
        try {
            texts = currentJson == null || currentJson.isBlank() ? new LinkedHashMap<>() : JSON.readValue(currentJson, LinkedHashMap.class);
        } catch (JacksonException e) {
            texts = new LinkedHashMap<>();
        }
        for (ScreenModel model : models) {
            Naming names = new Naming(model);
            Map<String, Object> block = new LinkedHashMap<>();
            block.put("title", model.title() == null || model.title().isBlank() ? model.name() : model.title());
            for (ScreenModel.Section section : model.sections()) {
                if (section.title() != null && !section.title().isBlank()) {
                    block.put(names.section(section), section.title());
                }
                for (ScreenModel.Component c : section.components()) {
                    String name = names.field(c);
                    block.put(name, c.label() == null ? name : c.label());
                    if (c.helpText() != null && !c.helpText().isBlank()) {
                        block.put(name + "Help", c.helpText());
                    }
                    if (c.placeholder() != null && !c.placeholder().isBlank()) {
                        block.put(name + "Placeholder", c.placeholder());
                    }
                }
            }
            model.actions().forEach(a -> block.put(names.action(a), a.label()));
            texts.put(camel(model.name()), block);
        }
        StringBuilder out = new StringBuilder();
        writeJson(out, texts, "");
        return out.append('\n').toString();
    }

    // --- helpers ---

    private static String element(TargetPack.ComponentMapping mapping, ScreenModel.Component c, String name, String key, boolean display) {
        String pad = "          ";
        StringBuilder e = new StringBuilder("        <").append(mapping.component()).append('\n');
        e.append(pad).append("testID=").append(attribute(c.id())).append('\n');
        e.append(pad).append("label={t('").append(key).append('.').append(name).append("')}\n");
        e.append(pad).append("value={form.values.").append(name).append("}\n");
        if (!display) {
            e.append(pad).append("onChange={form.setValue('").append(name).append("')}\n");
            e.append(pad).append("error={form.errors.").append(name).append("}\n");
        }
        if (mapping.options()) {
            e.append(pad).append("options={").append(name).append("Options}\n");
        }
        if (Boolean.TRUE.equals(c.required()) && !display) {
            e.append(pad).append("required\n");
        }
        if (Boolean.TRUE.equals(c.readonly()) && !display) {
            e.append(pad).append("readOnly\n");
        }
        if (c.maxLength() != null && !display && "string".equals(mapping.value())) {
            e.append(pad).append("maxLength={").append(c.maxLength()).append("}\n");
        }
        if (c.helpText() != null && !c.helpText().isBlank()) {
            e.append(pad).append("helpText={t('").append(key).append('.').append(name).append("Help')}\n");
        }
        if (c.placeholder() != null && !c.placeholder().isBlank() && !display) {
            e.append(pad).append("placeholder={t('").append(key).append('.').append(name).append("Placeholder')}\n");
        }
        if (mapping.props() != null && !mapping.props().isBlank()) {
            e.append(pad).append(mapping.props()).append('\n');
        }
        return e.append("        />\n").toString();
    }

    private static String initialValue(TargetPack.ComponentMapping mapping, ScreenModel.Component c) {
        String value = c.defaultValue() == null ? "" : c.defaultValue().strip();
        return switch (mapping.value()) {
            // "as boolean" keeps TypeScript from typing the field as the literal true or false.
            case "boolean" -> (value.equalsIgnoreCase("true") || value.equalsIgnoreCase("on") || value.equalsIgnoreCase("yes")) + " as boolean";
            case "list" -> value.isEmpty() ? "[] as string[]"
                    : "[" + java.util.Arrays.stream(value.split(",")).map(String::strip).map(ScreenScaffolder::quote).collect(Collectors.joining(", "))
                    + "] as string[]";
            default -> quote(value);
        };
    }

    private static Map<String, String> common(ScreenModel model, String module) {
        Map<String, String> values = new LinkedHashMap<>();
        values.put("Screen", pascal(model.name()));
        values.put("screenKey", camel(model.name()));
        values.put("title", oneLine(model.title() == null || model.title().isBlank() ? model.name() : model.title()));
        values.put("modelName", oneLine(model.name()).replace("\"", "'"));
        values.put("module", module == null ? "" : module);
        return values;
    }

    /** Replaces {{name}} placeholders; {{flag:\n...\n}} blocks are kept only when the flag is true. */
    static String fill(String template, Map<String, String> values, Map<String, Boolean> flags) {
        Matcher conditional = CONDITIONAL.matcher(template);
        StringBuilder withBlocks = new StringBuilder();
        while (conditional.find()) {
            boolean keep = Boolean.TRUE.equals(flags.get(conditional.group(1)));
            conditional.appendReplacement(withBlocks, Matcher.quoteReplacement(keep ? "\n" + conditional.group(2) + "\n" : ""));
        }
        conditional.appendTail(withBlocks);
        String result = withBlocks.toString();
        for (Map.Entry<String, String> value : values.entrySet()) {
            result = result.replace("{{" + value.getKey() + "}}", value.getValue());
        }
        return result;
    }

    private static Pattern pattern(String structure) {
        String regex = Pattern.quote(structure).replace("{module}", "\\E(?<module>[A-Za-z0-9_-]+)\\Q")
                .replace("{Screen}", "\\E(?<screen>[A-Za-z0-9]+)\\Q");
        return Pattern.compile(regex);
    }

    private static ScreenModel byName(List<ScreenModel> models, String screen) {
        for (ScreenModel model : models) {
            if (pascal(model.name()).equals(screen) || (model.title() != null && pascal(model.title()).equals(screen))) {
                return model;
            }
        }
        return models.size() == 1 ? models.getFirst() : null;
    }

    private static String quote(String text) {
        return "'" + (text == null ? "" : text).replace("\\", "\\\\").replace("'", "\\'") + "'";
    }

    private static String attribute(String text) {
        return "\"" + (text == null ? "" : text).replace("\"", "&quot;") + "\"";
    }

    private static String oneLine(String text) {
        return text == null ? "" : text.replaceAll("\\s+", " ").replace("*/", "* /");
    }

    @SuppressWarnings("unchecked")
    private static void writeJson(StringBuilder out, Object value, String indent) {
        if (value instanceof Map<?, ?> map) {
            if (map.isEmpty()) {
                out.append("{}");
                return;
            }
            out.append("{\n");
            int i = 0;
            for (Map.Entry<?, ?> entry : map.entrySet()) {
                out.append(indent).append("  ");
                writeString(out, String.valueOf(entry.getKey()));
                out.append(": ");
                writeJson(out, entry.getValue(), indent + "  ");
                out.append(++i < map.size() ? ",\n" : "\n");
            }
            out.append(indent).append('}');
        } else if (value instanceof List<?> list) {
            out.append('[');
            for (int i = 0; i < list.size(); i++) {
                writeJson(out, list.get(i), indent);
                out.append(i < list.size() - 1 ? ", " : "");
            }
            out.append(']');
        } else if (value instanceof String text) {
            writeString(out, text);
        } else {
            out.append(value);
        }
    }

    private static void writeString(StringBuilder out, String text) {
        out.append('"');
        for (char c : text.toCharArray()) {
            switch (c) {
                case '"' -> out.append("\\\"");
                case '\\' -> out.append("\\\\");
                case '\n' -> out.append("\\n");
                case '\t' -> out.append("\\t");
                default -> {
                    if (c < 0x20) {
                        out.append(String.format("\\u%04x", (int) c));
                    } else {
                        out.append(c);
                    }
                }
            }
        }
        out.append('"');
    }

    /** Names of fields, sections and actions in code and texts: camelCase and unique within the screen. */
    private static final class Naming {

        private final Map<String, String> fields = new LinkedHashMap<>();
        private final Map<String, String> sections = new LinkedHashMap<>();
        private final Map<String, String> actions = new LinkedHashMap<>();
        private final Set<String> used = new LinkedHashSet<>(List.of("title"));

        Naming(ScreenModel model) {
            for (ScreenModel.Section section : model.sections()) {
                for (ScreenModel.Component c : section.components()) {
                    fields.put(c.id(), unique(camel(c.name() != null && !c.name().isBlank() ? c.name() : c.id())));
                }
            }
            for (ScreenModel.Section section : model.sections()) {
                sections.put(section.id(), unique(camel(section.id()) + "Section"));
            }
            for (ScreenModel.ActionButton action : model.actions()) {
                actions.put(action.id(), unique(camel(action.id())));
            }
        }

        String field(ScreenModel.Component c) {
            return fields.get(c.id());
        }

        String section(ScreenModel.Section s) {
            return sections.get(s.id());
        }

        String action(ScreenModel.ActionButton a) {
            return actions.get(a.id());
        }

        private String unique(String name) {
            String candidate = name;
            for (int i = 2; !used.add(candidate) || candidate.endsWith("Options") || candidate.endsWith("Help")
                    || candidate.endsWith("Placeholder"); i++) {
                candidate = name + i;
            }
            return candidate;
        }
    }
}
