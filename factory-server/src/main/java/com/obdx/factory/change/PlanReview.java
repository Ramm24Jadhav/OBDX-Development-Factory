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
    static final String SAME_NAME = "A new class has the name of an existing one in another package: ";
    private static final List<String> PREFIXES = List.of(NO_TEST, UNSERVED_API, SERVED_PATH, SAME_NAME);

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
        return review(plan, spec, served, Map.of());
    }

    /**
     * @param existing indexed Java files by class name (HostAccountAdapter -> accounts/HostAccountAdapter.java), for the
     *                 classes the plan creates: a new class of the same name elsewhere is often a parallel copy
     */
    static ChangePlan review(ChangePlan plan, RequirementSpec spec, Map<String, String> served, Map<String, List<String>> existing) {
        List<String> risks = new ArrayList<>(plan.risks() == null ? List.of() : plan.risks());
        risks.removeIf(r -> PREFIXES.stream().anyMatch(r::startsWith));
        for (ChangePlan.Item item : plan.items()) {
            String name = item.path().substring(item.path().lastIndexOf('/') + 1).replaceAll("\\.java$", "");
            String folder = item.path().contains("/") ? item.path().substring(0, item.path().lastIndexOf('/')) : "";
            // Same folder by whole path segments ("accounts" is no match for "subaccounts"); package-info.java is in every package
            List<String> others = existing.getOrDefault(name, List.of()).stream()
                    .filter(p -> !sameFolder(p.contains("/") ? p.substring(0, p.lastIndexOf('/')) : "", folder)).toList();
            if ("create".equals(item.action()) && item.path().endsWith(".java") && !name.equals("package-info") && !others.isEmpty()) {
                risks.add(SAME_NAME + item.path() + " and " + String.join(", ", others) + ". Reuse the existing class, or give the new one "
                        + "a name of its own.");
            }
        }
        if (spec == null) {
            return new ChangePlan(plan.summary(), plan.items(), risks);
        }
        if (!spec.acceptanceCriteria().isEmpty() && plan.items().stream().noneMatch(i -> "test".equals(i.layer()) || isTest(i.path()))) {
            risks.add(NO_TEST + " (" + spec.acceptanceCriteria().size() + " criteria). Add a test file that checks them, or say "
                    + "why none is needed.");
        }
        boolean createsResource = plan.items().stream().anyMatch(i -> "create".equals(i.action()) && isResource(i.path()));
        // A UI-only change calls existing services; a plan with Java code, or for a spec that asks for new REST endpoints,
        // is expected to serve the APIs the existing code does not
        boolean backend = plan.items().stream().anyMatch(i -> i.path().toLowerCase(Locale.ROOT).endsWith(".java")) || asksForEndpoints(spec);
        for (RequirementSpec.Api api : spec.apis()) {
            String path = pathOf(api);
            if (path == null) {
                continue;
            }
            String label = (api.method() == null ? "" : api.method().toUpperCase(Locale.ROOT) + " ") + path;
            // Served by a REST resource or controller whose name matches: a service or validator of the same name serves nothing
            if (backend && !served.containsKey(normalize(path))
                    && plan.items().stream().noneMatch(i -> isResource(i.path()) && serves(i.path(), path))) {
                risks.add(UNSERVED_API + label + ": no file name matches its path. Add the resource and service that "
                        + "implement it, or say which planned file does.");
            }
            if (createsResource) {
                String normalized = normalize(path);
                String servedBy = served.entrySet().stream().filter(e -> normalized.equals(e.getKey())
                        || (e.getKey().contains("/") && normalized.startsWith(e.getKey() + "/")))
                        .map(Map.Entry::getValue).findFirst().orElse(null);
                String root = normalized.contains("/") ? normalized.substring(0, normalized.indexOf('/')) : normalized;
                if (servedBy != null) {
                    risks.add(SERVED_PATH + label + " would sit on a path the existing code serves (" + servedBy + "). Change that "
                            + "resource instead, or use another path.");
                } else if (PRODUCT_ROOTS.contains(root.toLowerCase(Locale.ROOT))) {
                    risks.add(SERVED_PATH + label + " would sit under /" + root + ", a path of OBDX's own services, and can clash "
                            + "with them. Use the bank's own path for extensions, or confirm the path with the OBDX team.");
                }
            }
        }
        return new ChangePlan(plan.summary(), plan.items(), risks);
    }

    /**
     * "A new REST service", "shall expose REST endpoints", "new API", "shall expose POST /x": the spec asks for
     * endpoints of its own.
     */
    private static final Pattern NEW_ENDPOINTS = Pattern.compile(
            "(?i)\\bnew\\s++(?:(?:rest(?:ful)?|web|http)\\s++)?(?:endpoints?|apis?)\\b"
                    + "|\\bnew\\s++(?:rest(?:ful)?|web|http)\\s++services?\\b"
                    + "|\\b(?:expose[sd]?|exposing)\\s++(?:(?:an?|the|new)\\s++)?(?:(?:rest(?:ful)?|web|http)\\s++)?(?:endpoints?|apis?|services?)\\b"
                    + "|\\b(?:expose[sd]?|exposing)\\s++(?:GET|POST|PUT|PATCH|DELETE)\\s++/");
    /** "no new REST service", "without new endpoints": said right before it, it says the opposite. */
    private static final Pattern DENIED = Pattern.compile("(?i)\\b(no|not|without|nor|never)\\s+(\\w+\\s+)?$");

    /**
     * Whether the spec's scope or functional requirements ask for new REST endpoints (its out-of-scope list is not
     * read): then a plan without Java code still has to serve the spec's APIs that the existing code does not.
     */
    static boolean asksForEndpoints(RequirementSpec spec) {
        List<String> texts = new ArrayList<>(spec.scope());
        for (RequirementSpec.FunctionalRequirement requirement : spec.requirements()) {
            texts.add(requirement.title());
            texts.add(requirement.description());
        }
        for (String text : texts) {
            if (text == null) {
                continue;
            }
            String capped = text.length() > 2000 ? text.substring(0, 2000) : text;
            Matcher m = NEW_ENDPOINTS.matcher(capped);
            while (m.find()) {
                String before = capped.substring(Math.max(0, m.start() - 20), m.start());
                String around = capped.substring(Math.max(0, m.start() - 40), Math.min(capped.length(), m.end() + 40)).toLowerCase(Locale.ROOT);
                if (!DENIED.matcher(before).find() && !around.contains("existing")) {
                    return true;
                }
            }
        }
        return false;
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
        String name = lower.substring(lower.lastIndexOf('/') + 1);
        // PaymentResource, PaymentRest, PaymentApi, PaymentRestApi, PaymentController(Impl), and anything in a rest folder
        return lower.endsWith(".java") && (name.matches(".*(resource|endpoint|restservice|rest|api)\\.java") || name.contains("controller")
                || lower.contains("/rest/"));
    }

    /** Whether two folders are the same, one ending with the other by whole path segments. */
    static boolean sameFolder(String a, String b) {
        return a.equals(b) || a.endsWith("/" + b) || b.endsWith("/" + a);
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
