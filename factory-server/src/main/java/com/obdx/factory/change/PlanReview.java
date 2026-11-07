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
    static final String NEW_SHELL = "A new UI file looks like glue for a shell the code already has: ";
    static final String UNCOVERED_MUST = "No planned file names the Must requirement(s) ";
    private static final List<String> PREFIXES = List.of(NO_TEST, UNSERVED_API, SERVED_PATH, SAME_NAME, NEW_SHELL, UNCOVERED_MUST);
    /**
     * Names of the files that load, register or lay out other components (a dashboard, the app's entry point, a router,
     * a menu): OBDX already has them, and a new component is hooked into the existing one rather than given a new one.
     */
    static final Set<String> SHELL_NAMES = Set.of("dashboard", "index", "main", "app", "shell", "router", "registry", "menu",
            "navigation", "layout", "container", "loader", "home", "root", "header", "footer");
    /** Of those, the names that are a shell whatever folder they are in: a new one where the code has one is a risk. */
    static final Set<String> STRONG_SHELL_NAMES = Set.of("dashboard", "shell", "router", "registry", "menu", "navigation", "loader");

    /** /payments/standingInstructions/{id} in an API's name or description */
    private static final Pattern API_PATH = Pattern.compile("(?<![\\w/])(/[A-Za-z][\\w{}.-]*(?:/[\\w{}.-]+)*)");
    /** The most of an API's name or description that is searched for its path. */
    static final int MAX_TEXT = 300;
    /** The most APIs of a spec checked against the plan. */
    static final int MAX_APIS = 100;
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
        return review(plan, spec, served, existing, path -> false);
    }

    /**
     * @param inApp whether a file is in the workspace's React or React Native app (a target pack's), whose shell files
     *              (index.js, App.js) are not OBDX's: no shell risk for them
     */
    static ChangePlan review(ChangePlan plan, RequirementSpec spec, Map<String, String> served, Map<String, List<String>> existing,
                             java.util.function.Predicate<String> inApp) {
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
            if ("create".equals(item.action()) && shellName(item.path()) && !inApp.test(item.path())) {
                // A file of its name elsewhere only for the names that are a shell whatever the folder (a new index.js beside
                // other index.js files is ordinary)
                String fileName = item.path().substring(item.path().lastIndexOf('/') + 1);
                List<String> shellOthers = !STRONG_SHELL_NAMES.contains(fileName.substring(0, fileName.indexOf('.')).toLowerCase(Locale.ROOT))
                        ? List.of() : existing.getOrDefault(fileName, List.of()).stream().filter(p -> !p.equals(item.path())).toList();
                List<String> loaded = plan.items().stream().filter(i -> "create".equals(i.action()) && !folder.isEmpty()
                        && i.path().startsWith(folder + "/") && i.path().indexOf('/', folder.length() + 1) > 0).map(ChangePlan.Item::path).toList();
                if (!shellOthers.isEmpty() || !loaded.isEmpty()) {
                    risks.add(NEW_SHELL + item.path() + (shellOthers.isEmpty() ? " would load the new files under it ("
                            + String.join(", ", loaded.stream().limit(3).toList()) + (loaded.size() > 3 ? ", ..." : "") + ")"
                            : ", and the code already has " + String.join(", ", shellOthers)) + ". OBDX loads components through its "
                            + "existing shell (for example a dashboard's loadComponent): hook the new component into the existing file "
                            + "that loads it (modify it), or say why a new one is needed.");
                }
            }
        }
        if (spec == null) {
            return plan.withRisks(risks);
        }
        if (!spec.acceptanceCriteria().isEmpty() && plan.items().stream().noneMatch(i -> "test".equals(i.layer()) || isTest(i.path()))) {
            risks.add(NO_TEST + " (" + spec.acceptanceCriteria().size() + " criteria). Add a test file that checks them, or say "
                    + "why none is needed.");
        }
        List<String> must = uncoveredMust(plan, spec);
        if (!must.isEmpty()) {
            risks.add(UNCOVERED_MUST + ids(must) + ". Check that the plan covers " + (must.size() == 1 ? "it" : "them")
                    + " before approving, or say in a file's details which one does.");
        }
        boolean createsResource = plan.items().stream().anyMatch(i -> "create".equals(i.action()) && isResource(i.path()));
        // A UI-only change calls existing services; a plan with Java code, or for a spec that asks for new REST endpoints,
        // is expected to serve the APIs the existing code does not
        boolean backend = plan.items().stream().anyMatch(i -> i.path().toLowerCase(Locale.ROOT).endsWith(".java")) || asksForEndpoints(spec);
        // (at most MAX_APIS: each is compared with every planned file)
        for (RequirementSpec.Api api : spec.apis().subList(0, Math.min(MAX_APIS, spec.apis().size()))) {
            String path = pathOf(api);
            if (path == null) {
                continue;
            }
            String label = (api.method() == null ? "" : api.method().toUpperCase(Locale.ROOT) + " ") + path;
            // Served by a REST resource or controller whose name matches: a service or validator of the same name serves nothing
            if (backend && !served.containsKey(normalize(path))
                    && plan.items().stream().noneMatch(i -> isResource(i.path()) && serves(i, path))) {
                risks.add(UNSERVED_API + label + ": no planned resource names its path. Add the resource and service that "
                        + "implement it, or say in its details which path a planned resource serves.");
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
        return plan.withRisks(risks);
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

    /** Words of a resource's name that say what it is, not what it serves. */
    private static final Set<String> RESOURCE_WORDS = Set.of("resource", "rest", "api", "controller", "endpoint", "service", "impl",
            "java");
    /** The most words of a path or a file's name that are compared. */
    static final int MAX_WORDS = 20;

    /**
     * Whether a planned file looks like it serves the path by its name: each word of the path's last fixed segment is a
     * word of the file's name ("standingInstructions": StandingInstructionResource.java) or shortened from it (Stand,
     * Instr: see {@link #abbreviates}); and when that segment is under a parameter (/accounts/{id}/limits), the segment
     * before the parameter is named too (an AccountLimitResource, not a CardLimitResource).
     */
    static boolean serves(String file, String path) {
        List<String> fixed = new ArrayList<>();
        int lastIndex = -1;
        String[] segments = path.split("/");
        for (int i = 0; i < segments.length; i++) {
            String segment = segments[i].strip();
            if (!segment.isEmpty() && !segment.startsWith("{") && !segment.matches("(?i)v\\d+")) {
                fixed.add(segment);
                lastIndex = i;
            }
        }
        if (fixed.isEmpty()) {
            return true;
        }
        String name = file.substring(file.lastIndexOf('/') + 1).replaceAll("\\.[A-Za-z]+$", "");
        List<String> have = words(name).stream().filter(w -> !RESOURCE_WORDS.contains(w)).toList();
        if (!named(words(fixed.getLast()), have)) {
            return false;
        }
        boolean underParameter = lastIndex > 0 && segments[lastIndex - 1].strip().startsWith("{");
        return !underParameter || fixed.size() < 2 || named(words(fixed.get(fixed.size() - 2)), have);
    }

    /** Whether each wanted word is one of the words a name has, or shortened from it (see abbreviates). */
    private static boolean named(List<String> wanted, List<String> have) {
        return !wanted.isEmpty() && wanted.stream().allMatch(w -> have.stream().anyMatch(h -> h.equals(w) || abbreviates(h, w)));
    }


    /**
     * A path the details or purpose of a resource declare, as code would: right after an HTTP method ("GET
     * /payments/x", "GET/{id}") or in @Path ("@Path('/payments/x')"). Group 1 is the method (none for @Path), group 2
     * the path. A path the text only names ("Unlike the path /payments/x") is no declaration.
     */
    private static final Pattern DECLARED_PATH = Pattern.compile(
            "(?i)(?:\\b(GET|POST|PUT|PATCH|DELETE)\\b\\s*+|@Path\\s*+\\(\\s*+(?:value\\s*+=\\s*+)?)[\"']?(/[\\w{}.\\-]++(?:/[\\w{}.\\-]++)*+)");
    /** Words that say a path named after them is not served: "Does not GET /x", "unlike", "other", "except". */
    private static final Pattern NOT_SERVED = Pattern.compile("(?i)\\b(?:not|no|never|without|unlike|other|except|instead of|rather than)\\b"
            + "|n't\\b");
    /** Words that say so after the path: "GET /x (existing)", "/x is unchanged". */
    private static final Pattern SERVED_ELSEWHERE = Pattern.compile("(?i)^[^.;\\n]{0,40}?\\b(?:existing|unchanged|already served|elsewhere)\\b");
    /** How much of the sentence before a declared path is read for a negation. */
    static final int DECLARED_WINDOW = 60;

    /**
     * Whether a planned file serves the path: by its name (see {@link #serves(String, String)}), or because its purpose
     * or details declare that very path (see DECLARED_PATH): compared whole after normalising (a version segment and
     * OBDX's /digx base left out). The first @Path is the resource's base: a later @Path or a method's path that starts
     * with a parameter ("GET/{instructionId}") is joined to it, as JAX-RS joins a method's @Path to its class's. A path
     * above or below the wanted one does not count (GET /accounts serves no /accounts/{id}/limits), nor one declared in a
     * sentence that denies it ("Does not GET /x", "GET /x (existing)").
     */
    static boolean serves(ChangePlan.Item item, String path) {
        if (serves(item.path(), path)) {
            return true;
        }
        String wanted = base(normalize(path));
        String text = capped(nullToEmpty(item.purpose()) + " " + nullToEmpty(item.details()));
        Matcher m = DECLARED_PATH.matcher(text);
        String classPath = null;
        while (m.find()) {
            String declared = base(normalize(m.group(2).replaceAll("[.,;:]+$", "")));
            boolean annotation = m.group(1) == null;
            boolean relative = classPath != null && (annotation || declared.startsWith("{"));
            if (annotation && classPath == null) {
                classPath = declared;
            } else if (relative) {
                declared = declared.isEmpty() ? classPath : classPath + "/" + declared;
            }
            if (!declared.isEmpty() && wanted.equals(declared) && !denied(text, m.start(), m.end())) {
                return true;
            }
        }
        return false;
    }

    /** Whether the sentence around a declared path denies that it is served (see NOT_SERVED, SERVED_ELSEWHERE). */
    private static boolean denied(String text, int start, int end) {
        String before = text.substring(Math.max(0, start - DECLARED_WINDOW), start);
        int stop = Math.max(before.lastIndexOf('.'), Math.max(before.lastIndexOf(';'), before.lastIndexOf('\n')));
        String sentence = stop >= 0 ? before.substring(stop + 1) : before;
        return NOT_SERVED.matcher(sentence).find()
                || SERVED_ELSEWHERE.matcher(text.substring(end, Math.min(text.length(), end + 60))).find();
    }

    /** A normalised path without OBDX's base (digx/v1/): payments/x for digx/v1/payments/x. */
    private static String base(String normalized) {
        return normalized.replaceFirst("^digx/(?:v\\d+/)?", "");
    }

    /** The lower-case words of a camel-, kebab- or snake-case name without a plural s (standing, instruction), MAX_WORDS. */
    static List<String> words(String name) {
        List<String> words = new ArrayList<>();
        StringBuilder word = new StringBuilder();
        for (int i = 0; i < name.length() && words.size() < MAX_WORDS; i++) {
            char c = name.charAt(i);
            boolean boundary = !Character.isLetterOrDigit(c)
                    || Character.isUpperCase(c) && i > 0 && (Character.isLowerCase(name.charAt(i - 1)) || Character.isDigit(name.charAt(i - 1))
                    || i + 1 < name.length() && Character.isUpperCase(name.charAt(i - 1)) && Character.isLowerCase(name.charAt(i + 1)));
            if (boundary && !word.isEmpty()) {
                words.add(singular(word.toString().toLowerCase(Locale.ROOT)));
                word.setLength(0);
            }
            if (Character.isLetterOrDigit(c)) {
                word.append(c);
            }
        }
        if (!word.isEmpty() && words.size() < MAX_WORDS) {
            words.add(singular(word.toString().toLowerCase(Locale.ROOT)));
        }
        return words;
    }

    private static String singular(String word) {
        return word.length() > 4 && word.endsWith("ies") ? word.substring(0, word.length() - 3) + "y"
                : word.length() > 3 && word.endsWith("s") && !word.endsWith("ss") ? word.substring(0, word.length() - 1) : word;
    }

    /**
     * Whether a file's word is a shortening of the path's word: at least four letters, the path's word starting with it
     * and at least three letters longer (Stand for standing, Instr for instruction); not a word the path's word only
     * inflects (Bill for billers) and never a longer one (Scheduled for schedule, Chargeback for charges).
     */
    static boolean abbreviates(String fileWord, String pathWord) {
        return fileWord.length() >= 4 && pathWord.length() >= fileWord.length() + 3 && pathWord.startsWith(fileWord);
    }

    /**
     * A UI script or view named like a file that loads or lays out other components (dashboard.js, index.html, see
     * {@link #SHELL_NAMES}); not a resource bundle.
     */
    static boolean shellName(String path) {
        String lower = path.toLowerCase(Locale.ROOT);
        String name = lower.substring(lower.lastIndexOf('/') + 1);
        // OBDX's JET UI is JavaScript and HTML; a React or React Native app's index.ts or App.tsx is its own business
        if (!name.matches("[^.]+\\.(js|html)") || lower.contains("/nls/") || lower.contains("/resources/")) {
            return false;
        }
        return SHELL_NAMES.contains(name.substring(0, name.indexOf('.')));
    }

    /**
     * "create table X", "a new table", "new audit table", "adds a history table": the text asks for a table of its own.
     * Not a table it only reads ("read payees from DIGX_PY_PAYEE"), nor one it says not to make.
     */
    private static final Pattern TABLE = Pattern.compile("(?i)\\b(?:new|create|creates|add|adds|separate|dedicated)\\s++(?:(?:a|an|the)\\s++)?"
            + "(?:(?:new|database|db|audit|history|staging)\\s++)?(?:(?-i:[A-Z][A-Z0-9]*+_[A-Z0-9_]++)\\s++)?tables?\\b");
    /** "not", "no", "without", "never": said before it in the same sentence, it says the opposite. */
    private static final Pattern NEGATED = Pattern.compile("(?i)\\b(?:no|not|without|never|nor|don't|doesn't|won't|shall not|must not)\\b");
    /** "not only ... but also": no negation. */
    private static final Pattern NOT_ONLY = Pattern.compile("(?i)\\bnot\\s++only\\b");
    /** A remark in parentheses: its negation is its own ("(no approval needed)"). */
    private static final Pattern PARENTHESES = Pattern.compile("\\([^()]{0,200}+\\)");
    /** Words whose full stop ends no sentence ("e.g.", "etc."). */
    private static final Set<String> ABBREVIATIONS = Set.of("eg", "ie", "etc", "vs", "approx", "incl", "cf", "viz", "no", "nos", "fig", "sec",
            "mr", "mrs", "ms", "dr");
    /** How much of the text before a table is read for a negation. */
    static final int NEGATION_WINDOW = 60;

    /** Whether the text asks for a new table, without denying it in the same sentence. */
    static boolean newTable(String text) {
        String capped = capped(text);
        Matcher m = TABLE.matcher(capped);
        while (m.find()) {
            if (!negated(capped.substring(Math.max(0, m.start() - NEGATION_WINDOW), m.start()))) {
                return true;
            }
        }
        return false;
    }

    /**
     * Whether the text before a phrase denies it: a negation in the same sentence (a full stop after an abbreviation or
     * a single letter ends no sentence), not inside parentheses, and not "not only".
     */
    static boolean negated(String before) {
        String sentence = before.substring(sentenceStart(before));
        int closing = sentence.lastIndexOf(')');
        if (closing >= 0 && sentence.lastIndexOf('(') < 0) {
            // a remark whose opening is before the window
            sentence = sentence.substring(closing + 1);
        }
        sentence = NOT_ONLY.matcher(PARENTHESES.matcher(sentence).replaceAll(" ")).replaceAll(" ");
        return NEGATED.matcher(sentence).find();
    }

    /** Where the last sentence of the text starts: after its last ; or line break, or a full stop that ends a sentence. */
    private static int sentenceStart(String text) {
        for (int i = text.length() - 1; i >= 0; i--) {
            char c = text.charAt(i);
            if (c == ';' || c == '\n') {
                return i + 1;
            }
            if (c == '.') {
                int word = i;
                while (word > 0 && (Character.isLetter(text.charAt(word - 1)) || text.charAt(word - 1) == '.')) {
                    word--;
                }
                String token = text.substring(word, i).replace(".", "").toLowerCase(Locale.ROOT);
                if (token.length() > 1 && !ABBREVIATIONS.contains(token)) {
                    return i + 1;
                }
            }
        }
        return 0;
    }
    private static final Pattern REQUIREMENT_ID = Pattern.compile("\\bFR-\\d++\\b");
    /** The most requirement ids a gap names. */
    static final int MAX_GAP_IDS = 8;

    /**
     * What looks missing from a plan, as far as the plan and the spec tell (for a reviewer asked to approve a plan that
     * may be incomplete): no test for the spec's acceptance criteria; no SQL script although a requirement (or a planned
     * file) works with a table of its own; functional requirements no planned file names, when the plan names them
     * at all. Empty when nothing can be told.
     */
    static List<String> gaps(ChangePlan plan, RequirementSpec spec) {
        List<String> gaps = new ArrayList<>();
        if (spec != null && !spec.acceptanceCriteria().isEmpty() && plan.items().stream().noneMatch(i -> "test".equals(i.layer()) || isTest(i.path()))) {
            gaps.add("no test planned (" + spec.acceptanceCriteria().size() + " acceptance criteria)");
        }
        // (an SQL script by its name: a DTO the model put in the data layer is no SQL)
        boolean sql = plan.items().stream().anyMatch(i -> i.path().toLowerCase(Locale.ROOT).endsWith(".sql"));
        if (!sql) {
            List<String> needTable = new ArrayList<>();
            if (spec != null) {
                for (RequirementSpec.FunctionalRequirement requirement : spec.requirements()) {
                    if (requirement.id() != null && newTable(nullToEmpty(requirement.title()) + " " + nullToEmpty(requirement.description()))) {
                        needTable.add(requirement.id());
                    }
                }
            }
            if (!needTable.isEmpty()) {
                gaps.add("no SQL script planned, though " + ids(needTable) + (needTable.size() == 1 ? " needs" : " need") + " a table");
            } else {
                plan.items().stream().filter(i -> newTable(nullToEmpty(i.purpose()) + " " + nullToEmpty(i.details())))
                        .findFirst().ifPresent(i -> gaps.add("no SQL script planned, though " + i.path() + " works with a table"));
            }
        }
        if (spec != null && !spec.requirements().isEmpty()) {
            Set<String> named = namedRequirements(plan);
            List<String> unnamed = spec.requirements().stream().map(RequirementSpec.FunctionalRequirement::id)
                    .filter(id -> id != null && id.matches("FR-\\d+") && !named.contains(id)).toList();
            // Only when the plan names requirements at all: otherwise every one would be listed
            if (!named.isEmpty() && !unnamed.isEmpty()) {
                gaps.add(ids(unnamed) + " not named by any planned file");
            }
        }
        return gaps;
    }

    /** The requirement IDs (FR-001) the planned files name in their purpose or details. */
    static Set<String> namedRequirements(ChangePlan plan) {
        Set<String> named = new LinkedHashSet<>();
        for (ChangePlan.Item item : plan.items()) {
            Matcher m = REQUIREMENT_ID.matcher(capped(nullToEmpty(item.purpose()) + " " + nullToEmpty(item.details())));
            while (m.find()) {
                named.add(m.group());
            }
        }
        return named;
    }

    /**
     * The Must requirements (priority Must, Must have or Mandatory) that no planned file names,
     * when the plan names requirements at all (otherwise every one would be listed).
     */
    static List<String> uncoveredMust(ChangePlan plan, RequirementSpec spec) {
        if (spec == null || spec.requirements().isEmpty()) {
            return List.of();
        }
        Set<String> named = namedRequirements(plan);
        if (named.isEmpty()) {
            return List.of();
        }
        return spec.requirements().stream()
                .filter(r -> r.id() != null && r.id().matches("FR-\\d+") && !named.contains(r.id()) && r.priority() != null
                        && r.priority().strip().toLowerCase(Locale.ROOT).matches("must( have)?|mandatory"))
                .map(RequirementSpec.FunctionalRequirement::id).distinct().toList();
    }

    private static String ids(List<String> ids) {
        return String.join(", ", ids.stream().limit(MAX_GAP_IDS).toList()) + (ids.size() > MAX_GAP_IDS ? " and " + (ids.size() - MAX_GAP_IDS)
                + " more" : "");
    }

    private static String capped(String text) {
        return text.length() > 2000 ? text.substring(0, 2000) : text;
    }

    private static String nullToEmpty(String text) {
        return text == null ? "" : text;
    }

    static boolean isTest(String path) {
        String lower = path.toLowerCase(Locale.ROOT);
        String name = path.substring(path.lastIndexOf('/') + 1);
        // FundTransferTest.java, PaymentsIT.java, TestPayments.java, PaymentsTestCase.java, payments_test.java,
        // paymentstest.java; not Limit.java, Latest.java or Audit.java (a test's name has Test or IT as a word of it)
        return lower.contains("/test/") || lower.contains("/tests/") || lower.contains("/__tests__/") || lower.startsWith("test/")
                || lower.startsWith("tests/") || name.matches(".*(?:Test|Tests|IT|TestCase)\\.java") || name.matches("Test[A-Z0-9_].*\\.java")
                || name.matches("[a-z0-9_]*(?:_test|test)\\.java") || lower.matches(".*[._-](spec|test)\\.(js|ts|jsx|tsx)")
                || name.matches(".*(?:Spec|Test)\\.(js|ts|jsx|tsx)") || lower.contains("/specs/") || lower.contains("/spec/");
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
