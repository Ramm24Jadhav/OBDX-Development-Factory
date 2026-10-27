package com.obdx.factory.profile;

import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

import static com.obdx.factory.profile.ProfileFact.Section.INTEGRATION;

/**
 * Host (core banking) systems the code talks to, and the adapter classes that do it.
 */
@Component
@Order(5)
public class IntegrationDetector implements ProfileDetector {

    /** Pattern (whole word, case-insensitive) to host system name. */
    private static final Map<Pattern, String> HOSTS = new LinkedHashMap<>();
    static {
        HOSTS.put(word("flexcube|fcubs|fcubsws|ubs"), "Oracle FLEXCUBE Universal Banking");
        HOSTS.put(word("obpm"), "Oracle Banking Payments");
        HOSTS.put(word("obcl"), "Oracle Banking Corporate Lending");
        HOSTS.put(word("obvam"), "Oracle Banking Virtual Account Management");
        HOSTS.put(word("obtfpm"), "Oracle Banking Trade Finance");
        HOSTS.put(word("obscf"), "Oracle Banking Supply Chain Finance");
        HOSTS.put(word("finacle"), "Infosys Finacle");
        HOSTS.put(word("t24|temenos"), "Temenos T24 / Transact");
    }

    private static Pattern word(String alternatives) {
        return Pattern.compile("(?i)(?<![a-z0-9])(" + alternatives + ")(?![a-z0-9])");
    }

    @Override
    public List<ProfileFact> detect(SourceTree tree) {
        Tally hosts = new Tally();
        for (String path : tree.withExtension("java", "xml", "properties", "json")) {
            String text = path + "\n" + tree.read(path);
            HOSTS.forEach((pattern, name) -> {
                if (pattern.matcher(text).find()) {
                    hosts.add(name, path);
                }
            });
        }

        Tally adapters = new Tally();
        for (String path : tree.withExtension("java")) {
            String name = path.substring(path.lastIndexOf('/') + 1, path.length() - ".java".length());
            if (name.endsWith("Adapter") || name.endsWith("AdapterImpl")) {
                adapters.add(name, path);
            }
        }
        String adapterValue = adapters.isEmpty() ? null
                : adapters.total() + (adapters.total() == 1 ? " adapter class: " : " adapter classes, for example ") + String.join(", ", adapters.top(5));

        return List.of(
                ProfileFact.of("integration.hostSystems", INTEGRATION, "Host systems", hosts.describe(4, "file"),
                        hosts.confidenceByCount(5), hosts.evidence(4)),
                ProfileFact.of("integration.adapters", INTEGRATION, "Adapters", adapterValue,
                        adapters.confidenceByCount(3), adapters.evidence(5)));
    }
}
