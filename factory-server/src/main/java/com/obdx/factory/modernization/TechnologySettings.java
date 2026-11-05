package com.obdx.factory.modernization;

import com.obdx.factory.common.BadRequestException;
import com.obdx.factory.componentpack.ComponentPackService;
import com.obdx.factory.componentpack.ComponentRegistry;
import com.obdx.factory.componentpack.ComponentStyleStore;
import com.obdx.factory.target.TargetPack;
import com.obdx.factory.target.TargetPacks;
import org.springframework.stereotype.Service;
import tools.jackson.databind.node.JsonNodeFactory;
import tools.jackson.databind.node.ObjectNode;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * Technology settings (docs/MODERNIZATION.md): what the factory uses when it moves a module to each technology, per
 * workspace. Defaults come from the target pack and the component pack; a workspace can change the project, code rules
 * and tests rows. The OBDX connection rows are fixed for every technology (the 8 OBDX rules), and the Look rows are the
 * component style saved in the Component factory.
 */
@Service
public class TechnologySettings {

    /** One row: editable rows can be changed for the workspace; locked rows never; source says where the value comes from. */
    public record Row(String key, String label, String value, boolean editable, boolean locked, boolean mono, String source) {
    }

    public record Group(String id, String title, String lead, List<Row> rows) {
    }

    public record Technology(String id, String name, String state) {
    }

    public record Settings(String technology, String name, String state, List<Group> groups, List<Technology> technologies, boolean saved,
                           String savedBy, OffsetDateTime savedAt) {
    }

    static final List<String> TECHNOLOGIES = List.of("react", "react-native", "angular");
    private static final Map<String, String> NAMES = Map.of("react", "React", "react-native", "React Native", "angular", "Angular");
    /** The defaults that do not come from the pack files, per technology: build, unit tests, journey tests, Jenkins job. */
    private static final Map<String, String[]> DEFAULTS = Map.of(
            "react", new String[]{"Vite", "Vitest and Testing Library", "Playwright", "modernize-react"},
            "react-native", new String[]{"Expo (Gradle and Xcode)", "Jest and Testing Library", "Detox", "modernize-mobile"},
            "angular", new String[]{"Angular CLI", "The Angular test runner", "Playwright", "modernize-angular"});
    static final List<String> EDITABLE = List.of("project.library", "project.language", "project.build", "project.folder", "rules.lint", "rules.accessibility",
            "rules.labels", "rules.validation", "tests.unit", "tests.journey", "tests.job", "tests.coverage");

    private final ModernizationStore store;
    private final TargetPacks packs;
    private final ComponentRegistry registry;
    private final ComponentStyleStore styles;

    public TechnologySettings(ModernizationStore store, TargetPacks packs, ComponentRegistry registry, ComponentStyleStore styles) {
        this.store = store;
        this.packs = packs;
        this.registry = registry;
        this.styles = styles;
    }

    public Settings get(UUID workspaceId, String technology) {
        return build(workspaceId, technology, true);
    }

    /** The settings with the workspace's saved values (saved true) or the defaults alone. */
    private Settings build(UUID workspaceId, String technology, boolean withSaved) {
        String tech = technology == null || technology.isBlank() ? "react" : technology;
        if (!TECHNOLOGIES.contains(tech)) {
            throw new BadRequestException("Choose React, React Native or Angular.");
        }
        Optional<TargetPack> target = packs.find(tech);
        ComponentRegistry.Pack components = registry.pack(tech);
        Optional<ModernizationStore.SavedPlan> saved = store.settings(workspaceId, tech);
        Map<String, String> values = new LinkedHashMap<>();
        if (withSaved) {
            saved.ifPresent(s -> s.plan().properties().forEach(e -> values.put(e.getKey(), e.getValue().asString())));
        }
        String[] d = DEFAULTS.get(tech);
        String folder = target.map(p -> p.structure().get("screen")).map(s -> s.contains("/{") ? s.substring(0, s.indexOf("/{") + 1) + "<module>" : s).orElse("src/app/<module>");
        java.util.function.BiFunction<String, String, Row> edit = (key, fallback) -> {
            String v = values.get(key);
            return new Row(key, label(key), v == null ? fallback : v, true, false, key.equals("project.folder") || key.equals("tests.job") || key.startsWith("rules.l") || key.equals("rules.validation"),
                    v == null ? "default" : "workspace");
        };
        List<Group> groups = new ArrayList<>();
        groups.add(new Group("project", "Project", "How the new code is laid out.", List.of(
                new Row("project.pack", "Target pack", target.map(p -> p.id() + " (" + p.rules().size() + " rules, " + p.templates().size() + " templates)").orElse("Not ready yet"),
                        false, false, true, "pack"),
                edit.apply("project.library", components == null ? "The pack's starter components" : components.packageName() + " " + components.version()),
                edit.apply("project.language", "TypeScript, strict"), edit.apply("project.build", d[0]), edit.apply("project.folder", folder))));
        groups.add(new Group("obdx", "OBDX connection", "How the new UI talks to OBDX. Fixed: changing them would break the bank's session, security or services.", List.of(
                new Row("obdx.services", "Services", "/digx/v1, /digx/ext, /digx-auth", false, true, true, "fixed"),
                new Row("obdx.session", "Session", "Secure, HttpOnly cookie through Oracle HTTP Server", false, true, false, "fixed"),
                new Row("obdx.nonce", "Nonce", "/digx/v1/session/nonce, one per request", false, true, true, "fixed"),
                new Row("obdx.2fa", "Two-factor", "The screens the server asks for", false, true, false, "fixed"),
                new Row("obdx.sensitive", "Sensitive data", "Masked tokens only; passwords encrypted before they are sent", false, true, false, "fixed"))));
        groups.add(new Group("rules", "Code rules", "Checks every converted module must pass.", List.of(
                edit.apply("rules.lint", "The pack's lint rules"), edit.apply("rules.accessibility", "WCAG 2.2 AA"),
                edit.apply("rules.labels", "From resources/nls to the app's texts"), edit.apply("rules.validation", "As the JET screens validate"))));
        groups.add(new Group("tests", "Tests and build", "What runs before a change can be reviewed.", List.of(
                edit.apply("tests.unit", d[1]), edit.apply("tests.journey", d[2]), edit.apply("tests.job", d[3]), edit.apply("tests.coverage", "80%"))));
        ComponentStyleStore.SavedStyle style = styles.get(workspaceId);
        ComponentPackService.Choice c = style.style().defaults();
        int own = style.style().components().size();
        groups.add(new Group("look", "Look", "The component style saved in the Component factory; change it there. New code and pack upgrades use it.", List.of(
                new Row("look.design", "Design", cap(c.look()) + (own > 0 ? ", " + own + (own == 1 ? " component" : " components") + " with their own design" : ""), false, false, false, "component style"),
                new Row("look.motion", "Motion", motion(c.motion()), false, false, false, "component style"),
                new Row("look.fonts", "Fonts", "Inter, then the device's system font (the pack's --bx-font)", false, false, false, "pack"),
                new Row("look.theme", "Theme", ("workspace".equals(c.brand()) ? "The workspace's brand" : cap(c.brand()) + " brand") + ", " + c.mode(), false, false, false, "component style"),
                new Row("look.saved", "Saved", style.savedAt() == null ? "Default style, not saved yet" : "By " + style.savedBy(), false, false, false, "component style"))));
        List<Technology> techs = TECHNOLOGIES.stream().map(t -> new Technology(t, NAMES.get(t), packs.find(t).isPresent() ? "ready" : "preview")).toList();
        return new Settings(tech, NAMES.get(tech), target.isPresent() ? "ready" : "preview", groups, techs, saved.isPresent(),
                saved.map(ModernizationStore.SavedPlan::savedBy).orElse(null), saved.map(ModernizationStore.SavedPlan::savedAt).orElse(null));
    }

    public Settings save(UUID workspaceId, String technology, Map<String, String> values, String by) {
        if (!TECHNOLOGIES.contains(technology)) {
            throw new BadRequestException("Choose React, React Native or Angular.");
        }
        // Only what differs from the default is kept, so a default that changes later still applies
        Map<String, String> defaults = new LinkedHashMap<>();
        build(workspaceId, technology, false).groups().forEach(g -> g.rows().forEach(r -> defaults.put(r.key(), r.value())));
        ObjectNode node = JsonNodeFactory.instance.objectNode();
        for (Map.Entry<String, String> e : (values == null ? Map.<String, String>of() : values).entrySet()) {
            if (!EDITABLE.contains(e.getKey())) {
                throw new BadRequestException(e.getKey() + " cannot be changed here" + (e.getKey().startsWith("obdx.") ? ": the OBDX connection is fixed." : "."));
            }
            String v = e.getValue() == null ? "" : e.getValue().strip();
            if (v.isEmpty() || v.equals(defaults.get(e.getKey()))) {
                continue;
            }
            if (v.length() > 200) {
                throw new BadRequestException(label(e.getKey()) + ": at most 200 characters.");
            }
            node.put(e.getKey(), v);
        }
        store.saveSettings(workspaceId, technology, node, by);
        return get(workspaceId, technology);
    }

    static String label(String key) {
        return switch (key) {
            case "project.library" -> "Component library";
            case "project.language" -> "Language";
            case "project.build" -> "Build";
            case "project.folder" -> "Module folder";
            case "rules.lint" -> "Lint";
            case "rules.accessibility" -> "Accessibility";
            case "rules.labels" -> "Labels";
            case "rules.validation" -> "Validation rules";
            case "tests.unit" -> "Unit tests";
            case "tests.journey" -> "Journey tests";
            case "tests.job" -> "Jenkins job";
            case "tests.coverage" -> "Coverage gate";
            default -> key;
        };
    }

    private static String cap(String s) {
        return s == null || s.isEmpty() ? "" : Character.toUpperCase(s.charAt(0)) + s.substring(1);
    }

    private static String motion(ComponentPackService.Motion m) {
        if (m == null) {
            return "None";
        }
        return cap(m.hover()) + " on hover · " + cap(m.click()) + " on click · " + cap(m.scroll()) + " on scroll";
    }
}
