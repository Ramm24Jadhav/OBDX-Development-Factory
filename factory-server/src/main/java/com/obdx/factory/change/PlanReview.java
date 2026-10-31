package com.obdx.factory.change;

import com.obdx.factory.requirements.RequirementSpec;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Checks a change plan against the approved spec and the existing code, and names what looks missing or risky as
 * risks for the lead who approves it: no test for the spec's acceptance criteria, an API of the spec that no planned
 * file serves, and a new REST resource at a path the existing code or OBDX itself already serves.
 */
final class PlanReview {

    static final String NO_TEST = "The spec has acceptance criteria but the plan writes no test";
    static final String UNSERVED_API = "No planned file serves the API ";
    static final String SERVED_PATH = "A new REST resource for ";
    private static final List<String> PREFIXES = List.of(NO_TEST, UNSERVED_API, SERVED_PATH);

    /** /payments/standingInstructions/{id} in an API's name or description */
    private static final Pattern API_PATH = Pattern.compile("(?<![\\w/])(/[A-Za-z][\\w{}.-]*(?:/[\\w{}.-]+)*)");
    /** The most of an API's name or description that is searched for its path. */
    static final int MAX_TEXT = 300;
    /**
     * The first path segments of OBDX's own REST services: a bank's extension that adds a resource under them can clash
     * with the product's services.
     */
    static final Set<String> PRODUCT_ROOTS = Set.of("payments", "accounts", "me", "parties", "users", "deposits", "loans", "cards",
            "wallets", "transactions", "login", "enumerations", "configurations", "approvals", "mailbox", "alerts", "limits",
            "forex", "tradefinance", "creditcards", "brand", "dashboard", "beneficiaries", "payees");

    private PlanReview() {
    }

    /**
     * The plan with its review risks in place of earlier ones.
     *
     * @param served the REST paths the existing code serves (normalised, see {@link #normalize}) and the file serving each
     */
    static ChangePlan review(ChangePlan plan, RequirementSpec spec, Map<String, String> served) {
        List<String> risks = new ArrayList<>(plan.risks() == null ? List.of() : plan.risks());
        risks.removeIf(r -> PREFIXES.stream().anyMatch(r::startsWith));
        if (spec == null) {
            return new ChangePlan(plan.summary(), plan.items(), risks);
        }
        if (!spec.acceptanceCriteria().isEmpty() && plan.items().stream().noneMatch(i -> "test".equals(i.layer()) || isTest(i.path()))) {
            risks.add(NO_TEST + " (" + spec.acceptanceCriteria().size() + " criteria). Add a test file that checks them, or say "
                    + "why none is needed.");
        }
        boolean createsResource = plan.items().stream().anyMatch(i -> "create".equals(i.action()) && isResource(i.path()));
        for (RequirementSpec.Api api : spec.apis()) {
            String path = pathOf(api);
            if (path == null) {
                continue;
            }
            String label = (api.method() == null ? "" : api.method().toUpperCase(Locale.ROOT) + " ") + path;
            // A UI-only change calls existing services; a plan with Java code is expected to serve the APIs it adds
            boolean backend = plan.items().stream().anyMatch(i -> i.path().toLowerCase(Locale.ROOT).endsWith(".java"));
            if (backend && !served.containsKey(normalize(path)) && plan.items().stream().noneMatch(i -> serves(i.path(), path))) {
                risks.add(UNSERVED_API + label + ": no file name matches its path. Add the resource and service that "
                        + "implement it, or say which planned file does.");
            }
            if (createsResource) {
                String normalized = normalize(path);
                String existing = served.entrySet().stream().filter(e -> normalized.equals(e.getKey())
                        || (e.getKey().contains("/") && normalized.startsWith(e.getKey() + "/")))
                        .map(Map.Entry::getValue).findFirst().orElse(null);
                String root = normalized.contains("/") ? normalized.substring(0, normalized.indexOf('/')) : normalized;
                if (existing != null) {
                    risks.add(SERVED_PATH + label + " would sit on a path the existing code serves (" + existing + "). Change that "
                            + "resource instead, or use another path.");
                } else if (PRODUCT_ROOTS.contains(root.toLowerCase(Locale.ROOT))) {
                    risks.add(SERVED_PATH + label + " would sit under /" + root + ", a path of OBDX's own services, and can clash "
                            + "with them. Use the bank's own path for extensions, or confirm the path with the OBDX team.");
                }
            }
        }
        return new ChangePlan(plan.summary(), plan.items(), risks);
    }

    /** The path an API names, from its name or else its description; null when there is none. */
    static String pathOf(RequirementSpec.Api api) {
        for (String text : new String[] {api.name(), api.description()}) {
            if (text != null) {
                // An API name is short; a long text is cut so that the repeated path group cannot overflow the stack
                Matcher m = API_PATH.matcher(text.length() > MAX_TEXT ? text.substring(0, MAX_TEXT) : text);
                if (m.find()) {
                    return m.group(1).replaceAll("[.,;:]+$", "");
                }
            }
        }
        return null;
    }

    /** payments/standinginstructions/{} : no leading or trailing slash, no version segment (v1), parameters as {}. */
    static String normalize(String path) {
        String p = path.toLowerCase(Locale.ROOT).replaceAll("\\{[^}]*}", "{}").replaceAll("^/+|/+$", "").replaceAll("/{2,}", "/");
        return p.replaceAll("^v\\d+/", "");
    }

    /**
     * Whether a planned file looks like it serves the path: its name holds the last fixed segment of the path, without
     * a plural s ("standingInstructions" in StandingInstructionResource.java).
     */
    static boolean serves(String file, String path) {
        String name = file.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9/]", "");
        List<String> fixed = new ArrayList<>();
        for (String segment : normalize(path).split("/")) {
            if (!segment.isEmpty() && !segment.equals("{}")) {
                fixed.add(segment.replaceAll("[^a-z0-9]", ""));
            }
        }
        if (fixed.isEmpty()) {
            return true;
        }
        String last = fixed.getLast();
        String singular = last.endsWith("ies") ? last.substring(0, last.length() - 3) + "y" : last.endsWith("s") ? last.substring(0, last.length() - 1) : last;
        return name.contains(singular);
    }

    static boolean isTest(String path) {
        String lower = path.toLowerCase(Locale.ROOT);
        return lower.contains("/test/") || lower.matches(".*(test|tests|it)\\.java") || lower.matches(".*\\.(spec|test)\\.(js|ts|jsx|tsx)");
    }

    static boolean isResource(String path) {
        String lower = path.toLowerCase(Locale.ROOT);
        return lower.endsWith(".java") && (lower.matches(".*(resource|controller|endpoint|restservice)\\.java") || lower.contains("/rest/"));
    }

    private static final Pattern PATH_ANNOTATION = Pattern.compile("@(?:(?:javax|jakarta)\\.ws\\.rs\\.)?Path\\s*\\(\\s*(?:value\\s*=\\s*)?\"([^\"]*)\"");

    /**
     * The REST paths a Java file serves: its class's @Path, alone and joined with each method's @Path (the first @Path
     * in the file is taken as the class's).
     */
    static Set<String> pathsIn(String content) {
        Set<String> paths = new LinkedHashSet<>();
        Matcher m = PATH_ANNOTATION.matcher(content == null ? "" : content);
        String base = null;
        while (m.find()) {
            String p = normalize(m.group(1));
            if (base == null) {
                base = p;
                if (!p.isEmpty()) {
                    paths.add(p);
                }
            } else if (!p.isEmpty()) {
                paths.add(base.isEmpty() ? p : base + "/" + p);
            }
        }
        return paths;
    }
}
