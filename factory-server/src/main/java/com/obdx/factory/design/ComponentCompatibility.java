package com.obdx.factory.design;

import com.obdx.factory.pack.CheckScope;
import com.obdx.factory.pack.LocalChecks;
import com.obdx.factory.pack.PackRule;
import com.obdx.factory.pack.PackService;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;
import java.util.regex.PatternSyntaxException;

/**
 * Whether the elements a screen uses fit the workspace's OBDX version, from evidence only: verified when the bank's
 * imported code uses or defines the element, unsupported when a rule of the workspace's version pack forbids it in
 * views, and unverified otherwise. Nothing is called an OBDX component because of its name alone.
 */
@Service
public class ComponentCompatibility {

    public enum Status { VERIFIED, UNSUPPORTED, UNVERIFIED }

    /** One element (a JET element such as oj-input-text, or a component name) with its status and the evidence. */
    public record Entry(String element, Status status, String evidence) {
    }

    /** @param codeImported false until the workspace's code is imported, so nothing can be verified yet */
    public record Report(String obdxVersion, boolean codeImported, List<Entry> elements) {
    }

    /** Where the rules are checked: a view of the bank's UI. */
    private static final String VIEW_PATH = "src/js/views/screen.html";
    private static final Pattern ELEMENT = Pattern.compile("[a-z][a-z0-9]*(-[a-z0-9]+)+");

    private final ComponentPalette palette;
    private final PackService packs;
    private final LocalChecks checks;

    public ComponentCompatibility(ComponentPalette palette, PackService packs, LocalChecks checks) {
        this.palette = palette;
        this.packs = packs;
        this.checks = checks;
    }

    public Report report(UUID workspaceId, List<String> elements) {
        CheckScope scope = packs.scope(workspaceId);
        ComponentPalette.Palette found = palette.palette(workspaceId);
        boolean imported = found.revision() != null;
        return new Report(scope.version(), imported, assess(elements, checks.rulesFor(scope, VIEW_PATH), found.items(), imported));
    }

    /** The status of each distinct element name (lower case, like "oj-input-text"); other names are left out. */
    static List<Entry> assess(List<String> elements, List<PackRule> rules, List<ComponentPalette.Item> items, boolean imported) {
        Set<String> names = new LinkedHashSet<>();
        (elements == null ? List.<String>of() : elements).stream().filter(e -> e != null)
                .map(e -> e.strip().toLowerCase(Locale.ROOT)).filter(e -> ELEMENT.matcher(e).matches()).limit(200).forEach(names::add);
        List<Entry> entries = new ArrayList<>();
        for (String name : names) {
            PackRule forbidding = rules.stream().filter(r -> forbids(r, name)).findFirst().orElse(null);
            ComponentPalette.Item used = items.stream().filter(i -> name.equals(elementOf(i)) && (i.uses() > 0 || i.source() != null))
                    .findFirst().orElse(null);
            if (forbidding != null) {
                entries.add(new Entry(name, Status.UNSUPPORTED, "Version pack rule \"" + forbidding.title() + "\": " + forbidding.message()));
            } else if (used != null) {
                entries.add(new Entry(name, Status.VERIFIED, used.uses() > 0
                        ? "Used " + used.uses() + (used.uses() == 1 ? " time" : " times") + " in the bank's code, for example in " + used.source()
                        : "Defined in the bank's code: " + used.source()));
            } else {
                entries.add(new Entry(name, Status.UNVERIFIED, !imported
                        ? "The workspace's code is not imported yet, so it cannot be checked."
                        : name.startsWith("oj-bind") ? "Knockout binding elements are not counted when the code is scanned."
                        : "Not found in the bank's imported code."));
            }
        }
        return entries;
    }

    /** The element a palette item stands for: a component's name, or the JET element the code uses. */
    private static String elementOf(ComponentPalette.Item item) {
        if (item.tag() != null) {
            return item.tag().toLowerCase(Locale.ROOT);
        }
        return item.id() != null && item.id().startsWith("jet:") ? item.id().substring(4).toLowerCase(Locale.ROOT) : null;
    }

    /** Whether a rule forbids the element in a view: its pattern matches the element's opening tag. */
    private static boolean forbids(PackRule rule, String element) {
        if (rule.forbid() == null || rule.forbid().isBlank()) {
            return false;
        }
        try {
            Pattern pattern = Pattern.compile(rule.forbid(), Pattern.MULTILINE);
            return pattern.matcher("<" + element + " ").find() || pattern.matcher("<" + element + ">").find();
        } catch (PatternSyntaxException e) {
            return false;
        }
    }
}
