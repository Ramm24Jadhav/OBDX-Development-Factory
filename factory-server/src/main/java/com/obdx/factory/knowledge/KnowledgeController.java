package com.obdx.factory.knowledge;

import com.obdx.factory.auth.AccessGuard;
import com.obdx.factory.auth.AppUser;
import com.obdx.factory.auth.AuditLog;
import com.obdx.factory.auth.WorkspaceRole;
import com.obdx.factory.common.BadRequestException;
import com.obdx.factory.common.NotFoundException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import com.obdx.factory.model.ModelGatewayException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.CacheControl;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.servlet.mvc.method.annotation.ResponseBodyEmitter;
import tools.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * The OBDX knowledge base: manuals and the bank's documents, search, questions with citations, notes and feedback.
 * Everyone signed in can read and ask, and suggest notes; administrators manage the shared Oracle manuals and approve
 * shared notes; a workspace's own documents and notes follow that workspace's roles.
 */
@RestController
public class KnowledgeController {

    private static final Logger log = LoggerFactory.getLogger(KnowledgeController.class);

    private final KnowledgeService knowledge;
    private final KnowledgeImporter importer;
    private final KnowledgeRepository repository;
    private final AccessGuard guard;
    private final AuditLog audit;
    private final boolean localFolders;
    private final KnowledgePolicy policy;
    private final ObjectMapper json;
    private final OracleManuals oracle;
    private final KnowledgeEvaluation evaluation;

    public KnowledgeController(KnowledgeService knowledge, KnowledgeImporter importer, KnowledgeRepository repository, AccessGuard guard,
                               AuditLog audit, @Value("${factory.local-folders.enabled}") boolean localFolders,
                               KnowledgePolicy policy, ObjectMapper json, OracleManuals oracle, KnowledgeEvaluation evaluation) {
        this.evaluation = evaluation;
        this.policy = policy;
        this.oracle = oracle;
        this.json = json;
        this.knowledge = knowledge;
        this.importer = importer;
        this.repository = repository;
        this.guard = guard;
        this.audit = audit;
        this.localFolders = localFolders;
    }

    /**
     * privacy: why the knowledge is not sent to the configured models (they are outside the bank); null when it is.
     * folders: the watched folders, checked again for new and changed documents.
     */
    public record Overview(KnowledgeRepository.Stats stats, boolean folderImport, List<KnowledgeRepository.Document> documents,
                           String privacy, List<KnowledgeRepository.Source> folders) {
    }

    @GetMapping("/api/knowledge")
    public Overview overview() {
        guard.current();
        List<UUID> visible = knowledge.visibleWorkspaceIds();
        String privacy = policy.chatProblem() != null ? policy.chatProblem() : policy.embeddingProblem();
        return new Overview(repository.stats(visible), localFolders, repository.documents(visible), privacy, repository.sources(visible));
    }

    // --- documents ---

    public record FolderImport(String folder, String obdxVersion, UUID workspaceId, String patchset) {
    }

    @PostMapping("/api/knowledge/import")
    public KnowledgeImporter.Imported importFolder(@RequestBody FolderImport request) {
        AppUser user = requireImporter(request.workspaceId());
        if (!localFolders) {
            throw new BadRequestException("Importing from a folder is off on this factory. Upload the PDF files instead.");
        }
        if (request.folder() == null || request.folder().isBlank()) {
            throw new BadRequestException("Enter the folder with the documents.");
        }
        KnowledgeImporter.Imported imported = importer.importFolder(Path.of(request.folder().strip()), request.obdxVersion(),
                request.workspaceId(), request.patchset(), user.getUsername());
        audit.record("KNOWLEDGE_IMPORTED", request.workspaceId(), request.folder(), imported.queued().size() + " document(s) for OBDX " + request.obdxVersion());
        return imported;
    }

    @PostMapping(path = "/api/knowledge/documents", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public KnowledgeImporter.Imported upload(@RequestParam("file") MultipartFile file, @RequestParam("obdxVersion") String obdxVersion,
                                             @RequestParam(value = "workspaceId", required = false) UUID workspaceId,
                                             @RequestParam(value = "patchset", required = false) String patchset) throws IOException {
        AppUser user = requireImporter(workspaceId);
        KnowledgeImporter.Imported imported = importer.importFile(file.getOriginalFilename(), file.getBytes(), obdxVersion, workspaceId, patchset,
                user.getUsername());
        audit.record("KNOWLEDGE_IMPORTED", workspaceId, file.getOriginalFilename(), "OBDX " + obdxVersion);
        return imported;
    }

    @DeleteMapping("/api/knowledge/documents/{id}")
    public void delete(@PathVariable UUID id) {
        var document = repository.findDocument(id).orElseThrow(() -> new NotFoundException("Document not found"));
        requireImporter(document.workspaceId());
        importer.delete(id);
        audit.record("KNOWLEDGE_DELETED", document.workspaceId(), document.fileName(), "OBDX " + document.obdxVersion());
    }

    @PostMapping("/api/knowledge/documents/{id}/embed")
    public void embedAgain(@PathVariable UUID id) {
        var document = repository.findDocument(id).orElseThrow(() -> new NotFoundException("Document not found"));
        requireImporter(document.workspaceId());
        importer.embedAgain(id);
    }

    // --- Oracle's manuals from Oracle's site ---

    /** enabled: the factory may fetch from Oracle's site; follows: the OBDX versions kept current from it. */
    public record OracleStatus(boolean enabled, List<OracleManuals.Follow> follows) {
    }

    public record OracleFollow(String obdxVersion, String scope) {
    }

    @GetMapping("/api/knowledge/oracle")
    public OracleStatus oracleStatus() {
        guard.current();
        return new OracleStatus(oracle.enabled(), oracle.follows());
    }

    /** The OBDX versions on Oracle's documentation index, read from Oracle's site. */
    @GetMapping("/api/knowledge/oracle/versions")
    public List<String> oracleVersions() {
        guard.requireAdmin();
        return oracle.versions();
    }

    @PostMapping("/api/knowledge/oracle/follow")
    public OracleManuals.Follow followOracle(@RequestBody OracleFollow request) {
        AppUser user = guard.requireAdmin();
        OracleManuals.Follow follow = oracle.follow(request.obdxVersion(), request.scope(), user.getUsername());
        audit.record("KNOWLEDGE_ORACLE_FOLLOWED", null, "OBDX " + follow.obdxVersion(), follow.scope());
        return follow;
    }

    @PostMapping("/api/knowledge/oracle/{version}/check")
    public OracleManuals.Follow checkOracle(@PathVariable("version") String version) {
        guard.requireAdmin();
        return oracle.check(version);
    }

    @DeleteMapping("/api/knowledge/oracle/{version}")
    public ResponseEntity<Void> unfollowOracle(@PathVariable("version") String version) {
        guard.requireAdmin();
        oracle.unfollow(version);
        audit.record("KNOWLEDGE_ORACLE_UNFOLLOWED", null, "OBDX " + version, null);
        return ResponseEntity.noContent().build();
    }

    // --- evaluation ---

    public record EvaluationRequest(KnowledgeEvaluation.Mode mode) {
    }

    /**
     * Runs the evaluation questions through the Library (administrators): SEARCH the search only, CHOOSE with the model
     * choosing the sources, ANSWER with whole answers. The report comes from GET while it runs and after.
     */
    @PostMapping("/api/knowledge/evaluation")
    public KnowledgeEvaluation.Report evaluate(@RequestBody EvaluationRequest request) {
        guard.requireAdmin();
        return evaluation.start(request.mode() == null ? KnowledgeEvaluation.Mode.SEARCH : request.mode());
    }

    @GetMapping("/api/knowledge/evaluation")
    public KnowledgeEvaluation.Report evaluation() {
        guard.requireAdmin();
        return evaluation.last();
    }

    // --- watched folders ---

    /** Checks a watched folder for new and changed documents now (they are also checked on a schedule). */
    @PostMapping("/api/knowledge/folders/{id}/check")
    public KnowledgeImporter.Imported checkFolder(@PathVariable UUID id) {
        var source = repository.findSource(id).orElseThrow(() -> new NotFoundException("Folder not found"));
        requireImporter(source.workspaceId());
        KnowledgeImporter.Imported imported = importer.rescan(id);
        if (!imported.queued().isEmpty()) {
            audit.record("KNOWLEDGE_IMPORTED", source.workspaceId(), source.folder(), imported.queued().size() + " new or changed document(s)");
        }
        return imported;
    }

    /** Stops watching a folder; its documents stay. */
    @DeleteMapping("/api/knowledge/folders/{id}")
    public void stopWatching(@PathVariable UUID id) {
        var source = repository.findSource(id).orElseThrow(() -> new NotFoundException("Folder not found"));
        requireImporter(source.workspaceId());
        importer.deleteSource(id);
        audit.record("KNOWLEDGE_FOLDER_REMOVED", source.workspaceId(), source.folder(), "OBDX " + source.obdxVersion());
    }

    /** The stored file, shown in the browser when it is a PDF (answers link here with #page=N), else downloaded. */
    @GetMapping("/api/knowledge/documents/{id}/file")
    public ResponseEntity<Resource> file(@PathVariable UUID id) {
        var document = repository.findDocument(id).orElseThrow(() -> new NotFoundException("Document not found"));
        if (document.workspaceId() == null) {
            guard.current();
        } else {
            guard.require(document.workspaceId(), WorkspaceRole.Permission.VIEW);
        }
        Path file = importer.file(id);
        if (!Files.exists(file)) {
            throw new NotFoundException("The file of this document is no longer in the factory's data folder. Import it again.");
        }
        boolean pdf = "pdf".equals(KnowledgeImporter.extension(document.fileName()));
        ContentDisposition disposition = (pdf ? ContentDisposition.inline() : ContentDisposition.attachment())
                .filename(document.fileName(), StandardCharsets.UTF_8).build();
        return ResponseEntity.ok().contentType(pdf ? MediaType.APPLICATION_PDF : MediaType.APPLICATION_OCTET_STREAM)
                .header(HttpHeaders.CONTENT_DISPOSITION, disposition.toString())
                .body(new FileSystemResource(file));
    }

    // --- search and questions ---

    @GetMapping("/api/knowledge/search")
    public KnowledgeSearch.Result search(@RequestParam("q") String q, @RequestParam(value = "workspaceId", required = false) UUID workspaceId,
                                         @RequestParam(value = "version", required = false) String version) {
        requireReader(workspaceId);
        return knowledge.find(q, workspaceId, version);
    }

    /** history: the conversation's earlier questions and answers, oldest first, so follow-up questions are understood. */
    public record AskRequest(String question, UUID workspaceId, String context, List<KnowledgeService.Turn> history) {
    }

    @PostMapping("/api/knowledge/ask")
    public KnowledgeService.Answer ask(@RequestBody AskRequest request) {
        requireReader(request.workspaceId());
        return knowledge.ask(request.question(), request.workspaceId(), request.context());
    }

    /**
     * The answer as the model writes it, one JSON object per line: "status" (what is being done), "sources" (what the
     * search found and kept), "text" (the next piece of the answer),
     * then "done" (the whole answer) or "error". Problems found before anything is searched (no question, a model
     * outside the bank) are ordinary error responses.
     */
    @PostMapping("/api/knowledge/ask/stream")
    public ResponseEntity<ResponseBodyEmitter> askStream(@RequestBody AskRequest request) {
        requireReader(request.workspaceId());
        knowledge.requireAskable(request.question());
        // Administrators see how the sources were found, to look into an answer
        boolean admin = guard.current().isAdmin();
        // The model times out on its own when it stops writing; this only ends a stream nobody finishes
        ResponseBodyEmitter emitter = new ResponseBodyEmitter(Duration.ofHours(1).toMillis());
        Thread.ofVirtual().name("knowledge-answer").start(() -> {
            Lines lines = new Lines(emitter);
            KnowledgeService.Question question;
            try {
                lines.send(Map.of("type", "status", "text", "Searching the manuals and notes, and choosing the sections that answer the question…"));
                question = knowledge.prepare(request.question(), request.history(), request.workspaceId(), request.context());
            } catch (RuntimeException e) {
                lines.send(Map.of("type", "error", "message", e.getMessage() == null ? "The question could not be searched." : e.getMessage()));
                emitter.complete();
                return;
            }
            Map<String, Object> found = new LinkedHashMap<>();
            found.put("type", "sources");
            found.put("sources", question.sources());
            found.put("grounded", !question.sources().isEmpty());
            found.put("versionLine", question.versionLine());
            found.put("note", question.note());
            if (admin) {
                found.put("diagnostics", question.diagnostics());
            }
            lines.send(found);
            try {
                KnowledgeService.Answer answer = knowledge.answer(question, piece -> lines.send(Map.of("type", "text", "text", piece)));
                lines.send(Map.of("type", "done", "answer", answer));
            } catch (ModelGatewayException e) {
                lines.send(Map.of("type", "error", "message", e.getMessage()));
            } catch (RuntimeException e) {
                log.warn("Answer stream failed", e);
                lines.send(Map.of("type", "error", "message", "The answer could not be finished. Try again."));
            }
            emitter.complete();
        });
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType("application/x-ndjson"))
                .cacheControl(CacheControl.noStore())
                .header("X-Accel-Buffering", "no")  // proxies pass each line on at once
                .body(emitter);
    }

    /** Writes JSON lines; once the reader has gone (closed the page), the rest is dropped. */
    private final class Lines {
        private final ResponseBodyEmitter emitter;
        private volatile boolean gone;

        Lines(ResponseBodyEmitter emitter) {
            this.emitter = emitter;
        }

        void send(Object event) {
            if (gone) {
                return;
            }
            try {
                emitter.send(json.writeValueAsString(event) + "\n", MediaType.TEXT_PLAIN);
            } catch (IOException | IllegalStateException e) {
                gone = true;
            }
        }
    }

    // --- notes ---

    @GetMapping("/api/knowledge/notes")
    public List<KnowledgeRepository.Note> notes(@RequestParam(value = "status", required = false) String status) {
        guard.current();
        return knowledge.notes(status);
    }

    @PostMapping("/api/knowledge/notes")
    public KnowledgeRepository.Note suggest(@RequestBody KnowledgeService.NoteRequest request) {
        return knowledge.suggest(request, "USER");
    }

    @PutMapping("/api/knowledge/notes/{id}")
    public KnowledgeRepository.Note update(@PathVariable UUID id, @RequestBody KnowledgeService.NoteRequest request) {
        return knowledge.update(id, request);
    }

    public record Review(String status) {
    }

    @PostMapping("/api/knowledge/notes/{id}/review")
    public KnowledgeRepository.Note review(@PathVariable UUID id, @RequestBody Review review) {
        KnowledgeRepository.Note note = knowledge.review(id, review.status());
        audit.record("KNOWLEDGE_NOTE_" + note.status(), note.workspaceId(), note.title(), null);
        return note;
    }

    @DeleteMapping("/api/knowledge/notes/{id}")
    public void deleteNote(@PathVariable UUID id) {
        knowledge.deleteNote(id);
    }

    public record SummaryRequest(String topic, UUID workspaceId) {
    }

    /** A note about a transaction or topic, drafted by the model from the manuals; it is suggested until approved. */
    @PostMapping("/api/knowledge/summaries")
    public KnowledgeRepository.Note summarize(@RequestBody SummaryRequest request) {
        requireReader(request.workspaceId());
        return knowledge.summarize(request.topic(), request.workspaceId());
    }

    public record Feedback(UUID workspaceId, String question, String answer, boolean helpful, String comment,
                           List<KnowledgeService.Source> sources) {
    }

    @PostMapping("/api/knowledge/feedback")
    public void feedback(@RequestBody Feedback request) {
        knowledge.feedback(request.workspaceId(), request.question(), request.answer(), request.helpful(), request.comment(), request.sources());
    }

    // --- access ---

    private void requireReader(UUID workspaceId) {
        if (workspaceId == null) {
            guard.current();
        } else {
            guard.require(workspaceId, WorkspaceRole.Permission.VIEW);
        }
    }

    /** Shared Oracle manuals: administrators. A workspace's own documents: those who manage its code. */
    private AppUser requireImporter(UUID workspaceId) {
        return workspaceId == null ? guard.requireAdmin() : guard.require(workspaceId, WorkspaceRole.Permission.MANAGE_CODE);
    }
}
