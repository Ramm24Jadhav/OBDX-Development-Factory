package com.obdx.factory.knowledge;

import com.obdx.factory.auth.AccessGuard;
import com.obdx.factory.auth.AppUser;
import com.obdx.factory.auth.WorkspaceRole;
import com.obdx.factory.common.BadRequestException;
import com.obdx.factory.common.NotFoundException;
import com.obdx.factory.model.ModelGateway;
import com.obdx.factory.workspace.Workspace;
import com.obdx.factory.workspace.WorkspaceRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import tools.jackson.databind.ObjectMapper;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Consumer;
import java.util.stream.Collectors;

/**
 * The OBDX knowledge base as the rest of the factory uses it: answers to questions with numbered citations (the AI
 * chat), the knowledge to give code generation (only approved notes and the manuals), and the notes users and agents
 * add as the factory learns. Notes start as suggested and are used by code generation once someone approves them.
 */
@Service
public class KnowledgeService {

    private static final Logger log = LoggerFactory.getLogger(KnowledgeService.class);
    private static final String ASK_SYSTEM = """
            You are the knowledge assistant of OBDX Development Factory, a tool that changes banks' Oracle Banking Digital \
            Experience (OBDX) code. Answer the question from the numbered sources (sections of Oracle's OBDX manuals and \
            knowledge notes) and the page the user is looking at. Cite the sources you use in square brackets, like [2] or \
            [1][3], right after the statement they support. Notes marked "suggested" are not approved yet: say so when you \
            rely on one. Sources marked "Bank document" or "bank note" are the bank's own documentation of its customised \
            system and patchset: where they differ from Oracle's manuals, follow them and say that the bank's version differs. \
            Read every source before deciding: a source that covers the general case (any user) answers a question about \
            a particular case (a retail user) unless it says otherwise, and a source that answers part of the question \
            is used for that part. Only when no source answers any of it, say plainly that the manuals in the factory do \
            not cover it, then add what you know in general, marked as general knowledge, without citations. Cite a source only \
            for what it says. Never make up OBDX menu paths, configuration, file names, XML or code that are not in the \
            sources: a wrong detail is worse than none. Keep it short and practical; use steps or a short list for \
            procedures, and code blocks only for code.""";

    private static final String SUMMARY_SYSTEM = """
            You write knowledge notes for developers who change a bank's OBDX code. From the numbered sources, write one \
            note about the topic: what it is, the screens and steps a user goes through, the services and host calls \
            involved, configuration and extension points, and pitfalls. Cite sources in square brackets like [1]. Use only \
            what the sources say; write "not covered by the manuals" for parts they do not cover. Plain text with short \
            headings, at most about 400 words.""";

    private final KnowledgeSearch search;
    private final KnowledgeRepository repository;
    private final ModelGateway modelGateway;
    private final AccessGuard guard;
    private final WorkspaceRepository workspaces;
    private final ObjectMapper json;
    private final KnowledgePolicy policy;
    private final KnowledgeProperties properties;

    public KnowledgeService(KnowledgeSearch search, KnowledgeRepository repository, ModelGateway modelGateway, AccessGuard guard,
                            WorkspaceRepository workspaces, ObjectMapper json, KnowledgePolicy policy, KnowledgeProperties properties) {
        this.policy = policy;
        this.properties = properties;
        this.search = search;
        this.repository = repository;
        this.modelGateway = modelGateway;
        this.guard = guard;
        this.workspaces = workspaces;
        this.json = json;
    }

    /** A cited source. n is its number in the answer ([n]); url opens a manual at its page. */
    /** bank: the bank's own document or note; patchset: the patchset a document is for. pageFrom 0: no pages. */
    public record Source(int n, String kind, String title, String heading, String obdxVersion, int pageFrom, int pageTo,
                         String status, UUID documentId, UUID noteId, String url, String excerpt, boolean bank, String patchset) {
    }

    public record Answer(String answer, String model, long latencyMs, String versionLine, boolean grounded, List<Source> sources,
                         String note) {
    }

    // --- asking ---

    /** A question with what the knowledge base found for it, ready for the model. */
    public record Question(String prompt, String versionLine, List<Source> sources, String note) {
    }

    public Answer ask(String question, UUID workspaceId, String pageContext) {
        Question prepared = prepare(question, workspaceId, pageContext);
        return answered(prepared, modelGateway.chat(ASK_SYSTEM, prepared.prompt()));
    }

    /** The answer to a prepared question, handed to {@code pieces} as the model writes it. */
    public Answer answer(Question prepared, Consumer<String> pieces) {
        return answered(prepared, modelGateway.chatStream(ASK_SYSTEM, prepared.prompt(), pieces));
    }

    private static Answer answered(Question prepared, ModelGateway.ChatResult result) {
        return new Answer(result.reply(), result.model(), result.latencyMs(), prepared.versionLine(), !prepared.sources().isEmpty(),
                prepared.sources(), prepared.note());
    }

    /** Searches the knowledge base for the question; problems (no question, a model outside the bank) show here. */
    public Question prepare(String question, UUID workspaceId, String pageContext) {
        if (question == null || question.isBlank()) {
            throw new BadRequestException("Enter a question.");
        }
        requireInternalChat();
        String versionLine = versionLineOf(workspaceId);
        KnowledgeSearch.Result found = search.search(question, versionLine, workspaceId, properties.answerSources(), true);
        List<Source> sources = sources(found.hits());
        StringBuilder user = new StringBuilder();
        user.append("OBDX version of the user's workspace: ").append(versionLine == null ? "not known" : versionLine + ".x").append("\n\n");
        if (pageContext != null && !pageContext.isBlank()) {
            user.append("The page the user is looking at:\n").append(cap(pageContext, properties.pageContextChars())).append("\n\n");
        }
        user.append("Sources:\n");
        if (sources.isEmpty()) {
            user.append("(none: the knowledge base has nothing on this yet)\n");
        }
        for (int i = 0; i < sources.size(); i++) {
            Source s = sources.get(i);
            user.append('[').append(s.n()).append("] ").append(label(s)).append('\n').append(cap(found.hits().get(i).text(), properties.sourceChars())).append("\n\n");
        }
        user.append("Question: ").append(question.strip());
        return new Question(user.toString(), versionLine, sources, found.note());
    }

    public KnowledgeSearch.Result find(String query, UUID workspaceId, String versionLine) {
        if (query == null || query.isBlank()) {
            throw new BadRequestException("Enter something to search for.");
        }
        String line = versionLine == null || versionLine.isBlank() ? versionLineOf(workspaceId) : KnowledgeImporter.versionLine(versionLine);
        return search.search(query, line, workspaceId, 20, true);
    }

    /**
     * What code generation should know about a change: approved notes and manual sections for the workspace's OBDX
     * version, as cited text within maxChars. Empty when the knowledge base has nothing (or cannot be searched).
     */
    public String contextFor(UUID workspaceId, String query, int maxChars) {
        if (query == null || query.isBlank()) {
            return "";
        }
        if (!policy.chatAllowed()) {
            // The knowledge stays inside the bank: generation by a model outside it runs without it
            log.info("No knowledge for code generation: {}", policy.chatProblem());
            return "";
        }
        try {
            KnowledgeSearch.Result found = search.search(cap(query, 2000), versionLineOf(workspaceId), workspaceId, 6, false);
            StringBuilder out = new StringBuilder();
            for (KnowledgeSearch.Hit h : found.hits()) {
                String block = "--- " + ("NOTE".equals(h.kind()) ? (h.bank() ? "Approved bank note: " : "Approved note: ") + h.title()
                        : documentLabel(h.bank(), h.title(), h.obdxVersion(), h.patchset(), h.heading(), h.pageFrom(), h.pageTo())) + "\n" + cap(h.text(), 1400) + "\n";
                if (out.length() + block.length() > maxChars) {
                    break;
                }
                out.append(block);
            }
            return out.toString();
        } catch (RuntimeException e) {
            log.info("No knowledge for code generation: {}", e.getMessage());
            return "";
        }
    }

    // --- notes ---

    public record NoteRequest(UUID workspaceId, String versionLine, String topic, String title, String body, List<Source> sources) {
    }

    public List<KnowledgeRepository.Note> notes(String status) {
        return repository.notes(visibleWorkspaceIds(), status == null || status.isBlank() ? null : status.toUpperCase());
    }

    /** Anyone who can see the workspace may suggest a note; it is used by code generation once approved. */
    public KnowledgeRepository.Note suggest(NoteRequest request, String origin) {
        if (request.title() == null || request.title().isBlank() || request.body() == null || request.body().isBlank()) {
            throw new BadRequestException("A note needs a title and some text.");
        }
        AppUser user = request.workspaceId() == null ? guard.current() : guard.require(request.workspaceId(), WorkspaceRole.Permission.VIEW);
        var note = new KnowledgeRepository.Note(UUID.randomUUID(), request.workspaceId(), lineOrNull(request.versionLine()),
                cap(blankToNull(request.topic()), 200), cap(request.title().strip(), 300), request.body().strip(), "SUGGESTED", origin,
                sourcesJson(request.sources()), user.getUsername(), null, null, null, null, null);
        repository.insertNote(note);
        return repository.findNote(note.id()).orElseThrow();
    }

    public KnowledgeRepository.Note update(UUID id, NoteRequest request) {
        var note = repository.findNote(id).orElseThrow(() -> new NotFoundException("Note not found"));
        requireReviewer(note);
        repository.updateNote(id, cap(blankToNull(request.topic()), 200), cap(request.title().strip(), 300), request.body().strip(),
                lineOrNull(request.versionLine()));
        return repository.findNote(id).orElseThrow();
    }

    /** TRUSTED (approved, used by code generation) or REJECTED. */
    public KnowledgeRepository.Note review(UUID id, String status) {
        var note = repository.findNote(id).orElseThrow(() -> new NotFoundException("Note not found"));
        String s = status == null ? "" : status.toUpperCase();
        if (!s.equals("TRUSTED") && !s.equals("REJECTED") && !s.equals("SUGGESTED")) {
            throw new BadRequestException("Choose Approve or Reject.");
        }
        AppUser reviewer = requireReviewer(note);
        repository.reviewNote(id, s, reviewer.getUsername());
        return repository.findNote(id).orElseThrow();
    }

    public void deleteNote(UUID id) {
        var note = repository.findNote(id).orElseThrow(() -> new NotFoundException("Note not found"));
        requireReviewer(note);
        repository.deleteNote(id);
    }

    /** A note drafted by the model about a topic (a transaction or area) from what the manuals say; to be reviewed. */
    public KnowledgeRepository.Note summarize(String topic, UUID workspaceId) {
        if (topic == null || topic.isBlank()) {
            throw new BadRequestException("Enter a transaction or topic to summarise.");
        }
        requireInternalChat();
        String versionLine = versionLineOf(workspaceId);
        KnowledgeSearch.Result found = search.search(topic, versionLine, null, 8, false);
        if (found.hits().isEmpty()) {
            throw new BadRequestException("The manuals have nothing on \"" + topic.strip() + "\" yet. Import the manuals for this version first.");
        }
        List<Source> sources = sources(found.hits());
        StringBuilder user = new StringBuilder("Topic: ").append(topic.strip()).append(" (OBDX ").append(versionLine == null ? "any version" : versionLine + ".x").append(")\n\nSources:\n");
        for (int i = 0; i < sources.size(); i++) {
            user.append('[').append(sources.get(i).n()).append("] ").append(label(sources.get(i))).append('\n')
                    .append(cap(found.hits().get(i).text(), properties.sourceChars())).append("\n\n");
        }
        ModelGateway.ChatResult result = modelGateway.chat(SUMMARY_SYSTEM, user.toString());
        return suggest(new NoteRequest(null, versionLine, topic.strip(), "How " + topic.strip() + " works", result.reply(), sources), "SUMMARY");
    }

    /**
     * Written by the factory itself when a change is delivered: which files a kind of change touched, so the next
     * similar change starts from it. Suggested; approved by a reviewer.
     */
    public void learnFromChange(UUID workspaceId, String title, String summary, List<String> files) {
        try {
            String body = "The change \"" + title + "\" was delivered."
                    + (summary == null || summary.isBlank() ? "" : "\n\nWhat it did: " + summary.strip())
                    + (files.isEmpty() ? "" : "\n\nFiles it changed:\n" + files.stream().map(f -> "- " + f).collect(Collectors.joining("\n")));
            var note = new KnowledgeRepository.Note(UUID.randomUUID(), workspaceId, versionLineOf(workspaceId), cap(title, 200),
                    cap("Delivered change: " + title, 300), body, "SUGGESTED", "AGENT", "[]", "factory", null, null, null, null, null);
            repository.insertNote(note);
        } catch (RuntimeException e) {
            log.info("Could not record what change \"{}\" taught: {}", title, e.getMessage());
        }
    }

    public void feedback(UUID workspaceId, String question, String answer, boolean helpful, String comment, List<Source> sources) {
        AppUser user = workspaceId == null ? guard.current() : guard.require(workspaceId, WorkspaceRole.Permission.VIEW);
        repository.insertFeedback(workspaceId, cap(question, 4000), cap(answer, 20000), helpful, cap(blankToNull(comment), 2000),
                sourcesJson(sources), user.getUsername());
    }

    /** Embeds new and edited notes so they are found by meaning too (every few minutes; quiet when the model is down). */
    public void embedNotes() {
        if (!policy.embeddingAllowed()) {
            return;
        }
        try {
            List<KnowledgeRepository.PendingEmbedding> batch = repository.notesWithoutEmbedding(16);
            if (batch.isEmpty()) {
                return;
            }
            List<float[]> vectors = modelGateway.embedAll(batch.stream().map(KnowledgeRepository.PendingEmbedding::text).toList());
            for (int i = 0; i < batch.size(); i++) {
                repository.saveNoteEmbedding(batch.get(i).id(), vectors.get(i));
            }
        } catch (RuntimeException e) {  // the model gateway reports problems as ModelGatewayException
            log.debug("Notes not embedded now: {}", e.getMessage());
        }
    }

    // --- access and helpers ---

    private void requireInternalChat() {
        String problem = policy.chatProblem();
        if (problem != null) {
            throw new BadRequestException(problem);
        }
    }

    /** The workspaces the user can see (an administrator sees all). */
    public List<UUID> visibleWorkspaceIds() {
        Map<UUID, WorkspaceRole> roles = guard.visibleWorkspaces();
        return roles == null ? workspaces.findAll().stream().map(Workspace::getId).toList() : new ArrayList<>(roles.keySet());
    }

    /** Shared knowledge is reviewed by administrators; a workspace's own by those who approve in it. */
    private AppUser requireReviewer(KnowledgeRepository.Note note) {
        return note.workspaceId() == null ? guard.requireAdmin() : guard.require(note.workspaceId(), WorkspaceRole.Permission.APPROVE);
    }

    String versionLineOf(UUID workspaceId) {
        if (workspaceId == null) {
            return null;
        }
        return workspaces.findById(workspaceId).map(w -> KnowledgeImporter.versionLine(w.getObdxVersion())).orElse(null);
    }

    private List<Source> sources(List<KnowledgeSearch.Hit> hits) {
        List<Source> out = new ArrayList<>();
        for (int i = 0; i < hits.size(); i++) {
            KnowledgeSearch.Hit h = hits.get(i);
            boolean manual = "MANUAL".equals(h.kind());
            out.add(new Source(i + 1, h.kind(), h.title(), h.heading(), h.obdxVersion(), h.pageFrom(), h.pageTo(), h.status(),
                    manual ? h.documentId() : null, manual ? null : h.id(),
                    manual ? "api/knowledge/documents/" + h.documentId() + "/file" + (h.pageFrom() > 0 ? "#page=" + h.pageFrom() : "") : null,
                    cap(h.text(), 280), h.bank(), h.patchset()));
        }
        return out;
    }

    private static String label(Source s) {
        if ("NOTE".equals(s.kind())) {
            return ("TRUSTED".equals(s.status()) ? "Approved " : "Suggested ") + (s.bank() ? "bank note" : "note") + ": " + s.title();
        }
        return documentLabel(s.bank(), s.title(), s.obdxVersion(), s.patchset(), s.heading(), s.pageFrom(), s.pageTo());
    }

    /** "Bank document: Payments Customisation (OBDX 25.2, patchset 25.2.0.1), 4.2 Limits, p. 12" */
    static String documentLabel(boolean bank, String title, String obdxVersion, String patchset, String heading, int pageFrom, int pageTo) {
        return (bank ? "Bank document: " : "") + title + " (OBDX " + obdxVersion + (patchset == null ? "" : ", patchset " + patchset) + ")"
                + (heading == null ? "" : ", " + heading) + pages(pageFrom, pageTo);
    }

    private static String pages(int from, int to) {
        return from <= 0 ? "" : from == to ? ", p. " + from : ", pp. " + from + "-" + to;
    }

    private String sourcesJson(List<Source> sources) {
        return sources == null ? "[]" : json.writeValueAsString(sources.stream().map(s -> Map.of(
                "title", nz(s.title()), "heading", nz(s.heading()), "obdxVersion", nz(s.obdxVersion()), "pageFrom", s.pageFrom(),
                "pageTo", s.pageTo(), "url", nz(s.url()), "documentId", s.documentId() == null ? "" : s.documentId().toString())).toList());
    }

    private static String lineOrNull(String versionLine) {
        return versionLine == null || versionLine.isBlank() ? null : KnowledgeImporter.versionLine(versionLine);
    }

    private static String nz(String s) {
        return s == null ? "" : s;
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.strip();
    }

    static String cap(String text, int max) {
        return text == null || text.length() <= max ? text : text.substring(0, max) + " …";
    }
}
