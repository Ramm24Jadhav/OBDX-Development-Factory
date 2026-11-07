package com.obdx.factory.knowledge;

import com.obdx.factory.common.BadRequestException;
import com.obdx.factory.model.ModelGateway;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;

/**
 * Improve My Question: turns a short or loose question ("payment flow", "add new field") into a precise one for the
 * knowledge base, or says what must be clarified first. Nothing is answered here; the user reads, edits and approves the
 * improved question before it is asked. The model writes it from the question, the conversation, the workspace's OBDX
 * version and the headings of the sections a search finds, and its reply is checked: the identifiers in the question
 * are kept exactly, names the model brings in must be in the question or those sections, and a reply that cannot be
 * read gives way to an improvement made without the model.
 */
@Service
public class QueryEnhancementService {

    private static final Logger log = LoggerFactory.getLogger(QueryEnhancementService.class);
    private static final int HEADINGS = 8;

    /** READY: it can be asked; NEEDS_CLARIFICATION: something essential is missing; AMBIGUOUS: it can mean different things. */
    public enum Status { READY, NEEDS_CLARIFICATION, AMBIGUOUS }

    /**
     * @param enhancedQuery          the improved question, to edit and approve
     * @param detectedIntent         the kind of question (procedure, configuration, troubleshooting ...)
     * @param detectedModule         the OBDX area it is about, as the manuals name it, or null
     * @param technicalEntities      the names in it, each in the question or the manuals' sections
     * @param assumptions            what the improved question assumes and the user should check
     * @param clarificationQuestions what to answer first, when not READY
     * @param suggestedScope         the manual sections worth reading for it
     * @param byModel                false: made without the model (none allowed, or its reply could not be used)
     */
    public record Improvement(Status status, String originalQuery, String enhancedQuery, String detectedIntent, String detectedModule,
                              String detectedVersion, List<String> technicalEntities, List<String> assumptions,
                              List<String> clarificationQuestions, List<String> suggestedScope, boolean byModel) {
    }

    static final String SYSTEM = """
            You help users of Oracle Banking Digital Experience (OBDX) ask its knowledge base precise questions. You get \
            the user's question, the OBDX version of their workspace, the conversation before it, and the headings of the \
            manual sections a search found for it. Do not answer the question. Rewrite it as one precise, detailed \
            question that names what is asked about (the feature, screen, module, type of user, version) and what the \
            answer should cover for this kind of question: %s Use only names that appear in the question, the \
            conversation or the headings: never invent class names, APIs, configuration keys, modules or menu paths, and \
            write suggestions as things to cover, not as facts. Keep every technical identifier of the question exactly \
            as written. If something essential is missing and the answer would differ materially with it (the type of \
            user, the module, the kind of payment), use status NEEDS_CLARIFICATION with one to three short questions; if \
            the question can mean materially different things, use AMBIGUOUS with a question that offers the readings. \
            Do not ask what the version or the headings already settle. Otherwise use READY. Answer with a JSON object \
            only: {"status": "READY", "enhancedQuery": "...", "detectedIntent": "...", "detectedModule": "...", \
            "technicalEntities": [], "assumptions": [], "clarificationQuestions": [], "suggestedScope": []}""";

    private final KnowledgeService knowledge;
    private final KnowledgeSearch search;
    private final ModelGateway modelGateway;
    private final KnowledgePolicy policy;
    private final QueryUnderstanding understanding;
    private final ObjectMapper json;

    public QueryEnhancementService(KnowledgeService knowledge, KnowledgeSearch search, ModelGateway modelGateway, KnowledgePolicy policy,
                                   QueryUnderstanding understanding, ObjectMapper json) {
        this.knowledge = knowledge;
        this.search = search;
        this.modelGateway = modelGateway;
        this.policy = policy;
        this.understanding = understanding;
        this.json = json;
    }

    public Improvement improve(String question, List<KnowledgeService.Turn> history, UUID workspaceId) {
        if (question == null || question.isBlank()) {
            throw new BadRequestException("Enter a question to improve.");
        }
        String original = question.strip();
        if (original.length() > 2000) {
            throw new BadRequestException("The question is too long to improve; shorten it to under 2,000 characters.");
        }
        String versionLine = knowledge.versionLineOf(workspaceId);
        List<KnowledgeService.Turn> earlier = history == null ? List.of() : history.stream().filter(t -> t != null && t.question() != null).toList();
        QueryUnderstanding.Understood understood = understanding.understand(original);
        List<KnowledgeSearch.Hit> hits = search.search(KnowledgeService.wordings(understood), versionLine, workspaceId, HEADINGS, true).hits();
        List<String> headings = new ArrayList<>(new LinkedHashSet<>(hits.stream()
                .map(h -> h.title() + (h.heading() == null ? "" : " | " + KnowledgeRepository.baseHeading(h.heading()))).toList()));
        if (policy.chatProblem() != null) {
            return fallback(original, understood, versionLine, headings);
        }
        StringBuilder prompt = new StringBuilder();
        prompt.append("OBDX version of the workspace: ").append(versionLine == null ? "not known" : versionLine + ".x").append("\n\n");
        if (!earlier.isEmpty()) {
            prompt.append("Earlier in this conversation:\n");
            earlier.subList(Math.max(0, earlier.size() - 3), earlier.size())
                    .forEach(t -> prompt.append("Q: ").append(cut(t.question(), 300)).append("\nA: ").append(cut(t.answer(), 300)).append('\n'));
            prompt.append('\n');
        }
        prompt.append("Headings of the sections found for it:\n");
        headings.forEach(h -> prompt.append("- ").append(h).append('\n'));
        if (headings.isEmpty()) {
            prompt.append("(none found)\n");
        }
        prompt.append("\nQuestion: ").append(original);
        Improvement improved = null;
        try {
            String reply = modelGateway.chatJson(SYSTEM.formatted(rules(understood.type())), prompt.toString()).reply();
            improved = checked(reply, original, understood, versionLine, headings, earlier);
        } catch (RuntimeException e) {
            log.info("The question was not improved by the model: {}", e.getMessage());
        }
        return ambiguity(improved != null ? improved : fallback(original, understood, versionLine, headings), headings);
    }

    /**
     * A question of one or two words whose sections fall in three or more different chapters ("payment": bill
     * payments, payment status, payment configuration) asks which is meant, unless the model already asked something.
     */
    static Improvement ambiguity(Improvement i, List<String> headings) {
        if (i.status() != Status.READY || KnowledgeSearch.forMeaning(i.originalQuery()).split("\s+").length > 2) {
            return i;
        }
        List<String> chapters = new ArrayList<>(new LinkedHashSet<>(headings.stream().limit(6)
                .map(h -> after(h).split(" › ")[0].replaceAll("^[0-9.]+\s*", "").strip()).filter(c -> !c.isEmpty()).toList()));
        if (chapters.size() < 3) {
            return i;
        }
        String readings = String.join(", ", chapters.subList(0, Math.min(4, chapters.size())));
        return new Improvement(Status.AMBIGUOUS, i.originalQuery(), i.enhancedQuery(), i.detectedIntent(), i.detectedModule(), i.detectedVersion(),
                i.technicalEntities(), i.assumptions(), List.of("Which of these do you mean: " + readings + "?"), i.suggestedScope(), i.byModel());
    }

    /**
     * The model's reply as an improvement, or null when it cannot be used: not JSON, no question, an identifier of the
     * question changed, or a name the question and the sections do not have.
     */
    Improvement checked(String reply, String original, QueryUnderstanding.Understood understood, String versionLine, List<String> headings,
                        List<KnowledgeService.Turn> history) {
        JsonNode n;
        try {
            n = json.readTree(reply == null ? "" : reply);
        } catch (RuntimeException e) {
            return null;
        }
        if (n == null || !n.isObject()) {
            return null;
        }
        Status status;
        try {
            status = Status.valueOf(n.path("status").asString("READY").strip().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            status = Status.READY;
        }
        String enhanced = n.path("enhancedQuery").asString("").strip();
        List<String> questions = strings(n.path("clarificationQuestions"), 3, 200);
        if (status != Status.READY && questions.isEmpty()) {
            status = Status.READY;
        }
        if (enhanced.isEmpty() || enhanced.length() > 1500) {
            if (status == Status.READY) {
                return null;
            }
            enhanced = original;
        }
        StringBuilder known = new StringBuilder(original).append('\n');
        headings.forEach(h -> known.append(h).append('\n'));
        history.forEach(t -> known.append(t.question()).append('\n').append(t.answer() == null ? "" : t.answer()).append('\n'));
        String knownText = known.toString();
        String knownLower = knownText.toLowerCase(Locale.ROOT);
        // The question's identifiers exactly as written, and none the model made up
        for (String id : understood.identifiers()) {
            if (!enhanced.contains(id)) {
                return null;
            }
        }
        for (String id : QueryUnderstanding.identifiers(enhanced)) {
            if (!knownText.contains(id)) {
                return null;
            }
        }
        // An improved question says more than the question and keeps what it asks: a shorter one ("payment configuration"
        // for "how to configure payment?") or one that drops its words is not an improvement
        if (status == Status.READY && !fuller(understood.searched(), enhanced)) {
            return null;
        }
        List<String> entities = strings(n.path("technicalEntities"), 10, 120).stream()
                .filter(e -> knownLower.contains(e.toLowerCase(Locale.ROOT))).toList();
        String module = n.path("detectedModule").asString("").strip();
        if (module.isEmpty() || !knownLower.contains(module.toLowerCase(Locale.ROOT))) {
            module = moduleOf(headings);
        }
        List<String> scope = strings(n.path("suggestedScope"), 6, 200).stream()
                .filter(s -> headings.stream().anyMatch(h -> h.toLowerCase(Locale.ROOT).contains(s.toLowerCase(Locale.ROOT))
                        || s.toLowerCase(Locale.ROOT).contains(KnowledgeRepository.baseHeading(after(h)).toLowerCase(Locale.ROOT))))
                .toList();
        if (scope.isEmpty()) {
            scope = headings.stream().limit(3).toList();
        }
        // The kind of question in the factory's words: the model's when it names one, else the factory's own reading
        String said = n.path("detectedIntent").asString("").toLowerCase(Locale.ROOT);
        String intent = java.util.Arrays.stream(QueryUnderstanding.Type.values()).map(t -> t.name().toLowerCase(Locale.ROOT))
                .filter(said::contains).findFirst().orElse(understood.type().name().toLowerCase(Locale.ROOT));
        return new Improvement(status, original, enhanced, intent, module, versionLine == null ? null : versionLine + ".x", entities,
                strings(n.path("assumptions"), 4, 240), status == Status.READY ? List.of() : questions, scope, true);
    }

    /** At least four words longer (for a short question) and with most of its meaningful words. */
    static boolean fuller(String original, String enhanced) {
        String lower = enhanced.toLowerCase(Locale.ROOT);
        String[] words = KnowledgeSearch.forMeaning(original).toLowerCase(Locale.ROOT).split("\s+");
        long kept = java.util.Arrays.stream(words).filter(w -> lower.contains(w.length() > 5 ? w.substring(0, 5) : w)).count();
        int length = original.split("\s+").length;
        return kept * 10 >= words.length * 7L && (length > 15 || enhanced.split("\s+").length >= length + 4);
    }

    /** An improvement without the model: the question as understood, with what an answer to its kind should cover. */
    static Improvement fallback(String original, QueryUnderstanding.Understood understood, String versionLine, List<String> headings) {
        String base = understood.searched().replaceAll("[?.!\\s]+$", "");
        String version = versionLine == null ? "OBDX" : "OBDX " + versionLine + ".x";
        String enhanced = base + "? In " + version + ", " + covers(understood.type()) + ".";
        List<String> assumptions = new ArrayList<>();
        if (!understood.corrections().isEmpty()) {
            understood.corrections().forEach((from, to) -> assumptions.add("\"" + from + "\" read as \"" + to + "\"."));
        }
        if (versionLine == null) {
            assumptions.add("No OBDX version is known: choose a workspace to search one version's manuals.");
        }
        return new Improvement(Status.READY, original, enhanced, understood.type().name().toLowerCase(Locale.ROOT), moduleOf(headings),
                versionLine == null ? null : versionLine + ".x", understood.identifiers(), assumptions, List.of(),
                headings.stream().limit(3).toList(), false);
    }

    /** What the improved question asks the answer to cover, for each kind of question. */
    static String rules(QueryUnderstanding.Type type) {
        return "for this " + type.name().toLowerCase(Locale.ROOT) + " question, " + covers(type) + ".";
    }

    private static String covers(QueryUnderstanding.Type type) {
        return switch (type) {
            case CONCEPT -> "explain what it is, its purpose and the OBDX components involved";
            case ARCHITECTURE -> "describe the components, what each is responsible for, how they relate and how they interact";
            case PROCEDURE -> "give who performs it, the menu path, the steps in order and the rules or limits that apply";
            case IMPLEMENTATION -> "give the prerequisites, the implementation steps, the classes, components and configuration involved, and the dependencies, as documented";
            case CONFIGURATION -> "give where it is configured, the property or setting names, their possible values, the prerequisites and the expected behaviour";
            case API -> "give the API's purpose, endpoint and method, the request and response structure, authentication and error handling";
            case TROUBLESHOOTING -> "give the symptoms, the documented causes, the diagnostic steps and the resolution";
            case COMPARISON -> "compare the named versions or features point by point";
            case INTEGRATION -> "describe the systems involved, how they connect (adapters, services, configuration) and the flow between them";
            case SECURITY -> "describe what it protects against, how OBDX implements it and what must be configured";
            case PERFORMANCE -> "describe what affects it and the settings and practices the manuals recommend";
        };
    }

    /** The chapter the first section found belongs to ("User Management"), as the manuals name it. */
    private static String moduleOf(List<String> headings) {
        if (headings.isEmpty()) {
            return null;
        }
        String heading = after(headings.getFirst());
        String chapter = heading.split(" › ")[0].replaceAll("^[0-9.]+\\s*", "").strip();
        return chapter.isEmpty() ? null : chapter;
    }

    private static String after(String heading) {
        int bar = heading.indexOf(" | ");
        return bar < 0 ? heading : heading.substring(bar + 3);
    }

    private static List<String> strings(JsonNode node, int max, int maxChars) {
        Set<String> out = new LinkedHashSet<>();
        if (node != null && node.isArray()) {
            for (JsonNode item : node) {
                String s = item.asString("").strip();
                if (!s.isEmpty() && s.length() <= maxChars && out.size() < max) {
                    out.add(s);
                }
            }
        }
        return List.copyOf(out);
    }

    private static String cut(String s, int max) {
        String t = s == null ? "" : s.strip();
        return t.length() <= max ? t : t.substring(0, max) + "…";
    }
}
