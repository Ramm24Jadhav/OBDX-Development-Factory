package com.obdx.factory.modernization;

import com.obdx.factory.componentpack.ComponentRegistry;
import com.obdx.factory.componentpack.ComponentRegistry.JetMapping;
import com.obdx.factory.componentpack.ComponentRegistry.Part;
import com.obdx.factory.requirements.RequirementSpec;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/**
 * The brief of a run (docs/MODERNIZATION.md): what the change must do, written from the code analysis and the mapping
 * registry as a requirement's document and spec, so the factory's impact analysis, plan, generation and checks make the
 * change. The UI path swaps JET elements for premium ones on the wave's screens; the migration path rewrites a module's
 * screens in the target app. Both keep the OBDX services and the 8 OBDX rules.
 */
public final class RunBriefs {

    /** The rules every converted screen keeps (the design's "8 OBDX rules"). */
    public static final List<String[]> OBDX_RULES = List.of(
            new String[]{"OBDX-1", "Call the same digx services with the same requests and responses; no service is changed or added."},
            new String[]{"OBDX-2", "Keep the session cookie through Oracle HTTP Server: requests go to the same origin, never with a token in the URL."},
            new String[]{"OBDX-3", "Take the request nonce from /digx/v1/session/nonce and send it as the existing screens do."},
            new String[]{"OBDX-4", "Leave second-factor authentication to the server: show the challenge the server asks for, never skip it."},
            new String[]{"OBDX-5", "Show account numbers and tokens masked as the existing screens do."},
            new String[]{"OBDX-6", "Encrypt passwords and PINs before they are sent, with the existing encryption."},
            new String[]{"OBDX-7", "Build menus from the user's roles and entitlements, not from fixed lists."},
            new String[]{"OBDX-8", "Keep every label from the resource bundles and every validation the screen has today."});

    /** A brief: title, the document text and the spec. */
    public record Brief(String title, String text, RequirementSpec spec, List<String> screens) {
    }

    private RunBriefs() {
    }

    /** The UI path: on these screens, swap each of the elements for its premium element, keeping everything else. */
    public static Brief ui(Inventory inventory, ComponentRegistry registry, List<String> elements, List<String> screenIds, String waveName) {
        Set<String> wanted = new LinkedHashSet<>(elements);
        Set<String> limit = screenIds == null || screenIds.isEmpty() ? null : Set.copyOf(screenIds);
        List<Inventory.Screen> screens = inventory.screens().stream().filter(s -> s.elements() != null && (limit == null || limit.contains(s.id()))
                && s.elements().keySet().stream().anyMatch(wanted::contains)).toList();
        StringBuilder text = new StringBuilder();
        String title = (waveName == null || waveName.isBlank() ? "Premium components" : waveName.strip()) + ": " + String.join(", ", wanted) + " on "
                + screens.size() + (screens.size() == 1 ? " screen" : " screens");
        text.append(title).append("\n\nReplace these Oracle JET elements with the premium JET pack's elements on the screens below. Only the elements ")
                .append("change: keep every Knockout binding, event handler, resource bundle label, validation, business rule and service call as it is.\n");
        List<RequirementSpec.FunctionalRequirement> requirements = new ArrayList<>();
        List<String> manual = new ArrayList<>();
        int n = 1;
        for (String element : wanted) {
            JetMapping m = registry.jetMapping(element);
            ComponentRegistry.Entry target = m == null || m.target() == null ? null : registry.component(m.target());
            String premium = target == null ? null : target.names().get("jet-premium");
            List<String> on = screens.stream().filter(s -> s.elements().containsKey(element)).map(Inventory.Screen::name).toList();
            StringBuilder how = new StringBuilder(premium == null ? "Keep " + element + " as it is (no premium element)." : "Replace <" + element + "> with <"
                    + premium + ">, same attributes.");
            if (m != null) {
                for (Part p : m.properties()) {
                    if (p.to() == null) {
                        how.append(" ").append(p.from()).append(": ").append(p.conversion()).append(".");
                    } else if (!p.to().equals(p.from())) {
                        how.append(" Rename ").append(p.from()).append(" to ").append(p.to()).append(p.conversion() == null ? "" : " (" + p.conversion() + ")").append(".");
                    }
                }
                manual.addAll(m.manual());
            }
            text.append("\n- ").append(element).append(" (").append(on.size()).append(on.size() == 1 ? " screen): " : " screens): ").append(how);
            requirements.add(new RequirementSpec.FunctionalRequirement("FR-" + n++, premium == null ? "Keep " + element : "Use " + premium + " in place of " + element,
                    how.toString(), "must", on));
        }
        text.append("\n\nThe premium JET pack (obdx-jet) is added to the UI's RequireJS path mapping as bx; each screen requires the bx elements it uses.\n");
        if (!manual.isEmpty()) {
            text.append("\nA person checks: ").append(String.join(" ", new LinkedHashSet<>(manual))).append("\n");
        }
        text.append("\nScreens:\n");
        List<RequirementSpec.Screen> specScreens = new ArrayList<>();
        for (Inventory.Screen s : screens) {
            List<String> used = s.elements().entrySet().stream().filter(e -> wanted.contains(e.getKey())).map(e -> e.getKey() + " x" + e.getValue()).toList();
            text.append("- ").append(s.name()).append(" (").append(s.module()).append(", ").append(s.files().isEmpty() ? s.id() : s.files().getFirst())
                    .append("): ").append(String.join(", ", used)).append("\n");
            specScreens.add(new RequirementSpec.Screen(s.name(), "enhance", "Swap " + String.join(", ", used) + " for the premium elements; nothing else changes.",
                    s.files().isEmpty() ? null : s.files().getFirst(), List.of(), List.of(), s.files()));
        }
        List<RequirementSpec.BusinessRule> rules = new ArrayList<>();
        rules.add(new RequirementSpec.BusinessRule("UI-1", "Only the JET elements listed change: bindings, handlers, labels, validations and services stay.",
                List.of(), null));
        rules.add(new RequirementSpec.BusinessRule("UI-2", "The look comes from the pack's tokens and the workspace's component style; no inline styles are added.", List.of(), null));
        List<RequirementSpec.AcceptanceCriterion> criteria = List.of(
                new RequirementSpec.AcceptanceCriterion("AC-1", "None of " + String.join(", ", wanted) + " is left on the listed screens, except where the brief keeps it.", List.of()),
                new RequirementSpec.AcceptanceCriterion("AC-2", "Each screen shows the same data and does the same thing as before.", List.of()),
                new RequirementSpec.AcceptanceCriterion("AC-3", "The factory's checks and the Jenkins build pass.", List.of()));
        List<RequirementSpec.NonFunctional> nonFunctional = List.of(
                new RequirementSpec.NonFunctional("NF-1", "accessibility", "WCAG 2.2 AA: labels tied to fields, visible focus, errors announced."),
                new RequirementSpec.NonFunctional("NF-2", "responsive", "Works from a 390 px phone to a desktop."));
        RequirementSpec spec = new RequirementSpec(title, "Upgrade " + screens.size() + " screens to the premium JET components.", specScreens, rules, List.of(),
                List.of(), List.of(), List.of(), List.of(), List.of(), List.of("The listed screens' JET elements"),
                List.of("Services, models and business logic", "Screens not listed"), List.of("The premium JET pack is in the UI or added by this change."),
                requirements, criteria, nonFunctional);
        return new Brief(title, text.toString(), spec, screens.stream().map(Inventory.Screen::id).toList());
    }

    /** The migration path: rewrite one module's screens in the target app, calling the same OBDX services. */
    public static Brief migration(Inventory inventory, String module, String technologyTitle, String appFolder) {
        List<Inventory.Screen> screens = inventory.screens().stream().filter(s -> s.module().equals(module)).toList();
        String title = "Move " + module + " to " + technologyTitle;
        StringBuilder text = new StringBuilder(title).append("\n\nRewrite the ").append(module).append(" module of the OBDX UI in the ").append(technologyTitle)
                .append(" app in ").append(appFolder).append("/, one screen for each screen below, with the target pack's components and rules. ")
                .append("The OBDX server is not changed: the new screens call the same services with the same requests.\n\nScreens:\n");
        List<RequirementSpec.Screen> specScreens = new ArrayList<>();
        Set<String> services = new LinkedHashSet<>();
        for (Inventory.Screen s : screens) {
            text.append("- ").append(s.name()).append(" (").append(s.files().isEmpty() ? s.id() : s.files().getFirst()).append("): ")
                    .append(s.fields().size()).append(" fields, ").append(s.actions()).append(" actions");
            if (!s.calls().isEmpty()) {
                text.append(", calls ").append(String.join(", ", s.calls()));
                services.addAll(s.calls());
            }
            text.append("\n");
            List<RequirementSpec.Field> fields = s.fields().stream().map(f -> new RequirementSpec.Field(f.binding() == null ? f.type() : f.binding(),
                    f.label(), f.type(), null, List.of(), null, f.binding(), null)).toList();
            specScreens.add(new RequirementSpec.Screen(s.name(), "new", "The " + technologyTitle + " version of " + s.name() + " (" + s.id() + ").",
                    s.files().isEmpty() ? null : s.files().getFirst(), fields, List.of(), s.files()));
        }
        List<String> journeys = inventory.flows().stream().filter(f -> screens.stream().anyMatch(s -> f.screens().contains(s.id()))).map(Inventory.Flow::name).toList();
        if (!journeys.isEmpty()) {
            text.append("\nJourneys to keep working: ").append(String.join(", ", journeys)).append(".\n");
        }
        text.append("\nRules:\n");
        List<RequirementSpec.BusinessRule> rules = new ArrayList<>();
        for (String[] rule : OBDX_RULES) {
            text.append("- ").append(rule[0]).append(": ").append(rule[1]).append("\n");
            rules.add(new RequirementSpec.BusinessRule(rule[0], rule[1], List.of(), null));
        }
        List<RequirementSpec.Api> apis = services.stream().map(c -> {
            int space = c.indexOf(' ');
            return new RequirementSpec.Api(space < 0 ? c : c.substring(space + 1), space < 0 ? "?" : c.substring(0, space), "Called as the JET screen calls it");
        }).toList();
        List<RequirementSpec.FunctionalRequirement> requirements = screens.stream().map(s -> new RequirementSpec.FunctionalRequirement("FR-" + (screens.indexOf(s) + 1),
                s.name() + " in " + technologyTitle, "Same fields, actions, labels, validations and service calls as " + s.id() + ".", "must", List.of(s.name()))).toList();
        RequirementSpec spec = new RequirementSpec(title, "Move the " + module + " module (" + screens.size() + " screens) to " + technologyTitle + ".", specScreens,
                rules, List.of(), apis, List.of(), List.of(), List.of(), List.of(), List.of("The " + module + " module's screens"),
                List.of("The OBDX server and its services", "Other modules"), List.of("The " + technologyTitle + " app is in " + appFolder + "/."), requirements,
                List.of(new RequirementSpec.AcceptanceCriterion("AC-1", "Every screen of the module works in the new app with the same services.", List.of()),
                        new RequirementSpec.AcceptanceCriterion("AC-2", "The 8 OBDX rules hold on every screen.", List.of()),
                        new RequirementSpec.AcceptanceCriterion("AC-3", "The factory's checks and the Jenkins build pass.", List.of())),
                List.of(new RequirementSpec.NonFunctional("NF-1", "accessibility", "WCAG 2.2 AA."), new RequirementSpec.NonFunctional("NF-2", "security",
                        "The 8 OBDX rules.")));
        return new Brief(title, text.toString(), spec, screens.stream().map(Inventory.Screen::id).toList());
    }

}
