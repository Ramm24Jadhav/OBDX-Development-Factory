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

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.UUID;

/**
 * The OBDX knowledge base: manuals and the bank's documents, search, questions with citations, notes and feedback.
 * Everyone signed in can read and ask, and suggest notes; administrators manage the shared Oracle manuals and approve
 * shared notes; a workspace's own documents and notes follow that workspace's roles.
 */
@RestController
public class KnowledgeController {

    private final KnowledgeService knowledge;
    private final KnowledgeImporter importer;
    private final KnowledgeRepository repository;
    private final AccessGuard guard;
    private final AuditLog audit;
    private final boolean localFolders;
    private final KnowledgePolicy policy;

    public KnowledgeController(KnowledgeService knowledge, KnowledgeImporter importer, KnowledgeRepository repository, AccessGuard guard,
                               AuditLog audit, @Value("${factory.local-folders.enabled}") boolean localFolders,
                               KnowledgePolicy policy) {
        this.policy = policy;
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

    public record AskRequest(String question, UUID workspaceId, String context) {
    }

    @PostMapping("/api/knowledge/ask")
    public KnowledgeService.Answer ask(@RequestBody AskRequest request) {
        requireReader(request.workspaceId());
        return knowledge.ask(request.question(), request.workspaceId(), request.context());
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
