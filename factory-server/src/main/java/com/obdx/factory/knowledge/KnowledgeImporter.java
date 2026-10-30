package com.obdx.factory.knowledge;

import com.obdx.factory.common.BadRequestException;
import com.obdx.factory.common.NotFoundException;
import com.obdx.factory.importing.StorageProperties;
import com.obdx.factory.model.ModelGateway;
import com.obdx.factory.model.ModelSettings;
import com.obdx.factory.requirements.DocumentTextExtractor;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.interactive.documentnavigation.outline.PDDocumentOutline;
import org.apache.pdfbox.pdmodel.interactive.documentnavigation.outline.PDOutlineItem;
import org.apache.pdfbox.pdmodel.interactive.documentnavigation.outline.PDOutlineNode;
import org.apache.pdfbox.text.PDFTextStripper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.core.task.TaskExecutor;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Stream;

/**
 * Brings documents into the knowledge base: Oracle's OBDX manuals for a version (from a folder on the factory's
 * computer or uploaded), and a bank's own and patchset-specific documents for one workspace (PDF, Word, text, Markdown
 * or HTML). Each file is copied into the data folder (so answers can open it at the cited page), read, split into
 * sections and embedded in the background. A file already imported is skipped; a changed file with the name of one
 * already imported becomes its newer revision ({@link KnowledgeRevisions}). Folders are remembered and checked again
 * on a schedule, so the knowledge follows Oracle's updated manuals and the bank's updated documents. Without the
 * embedding model a document is still searched by keywords and can be embedded later.
 */
@Service
public class KnowledgeImporter {

    private static final Logger log = LoggerFactory.getLogger(KnowledgeImporter.class);
    private static final int EMBED_BATCH = 16;
    // Raised when the reading changes in a way worth reading every document again (2: bookmarks as headings; 3: sections
    // embedded as passages, for the embedding models that tell questions from passages; 4: headings carry their parents,
    // front and back matter left out; 5: chapters whose title starts with "User" or "System" are headings again)
    static final int READER_VERSION = 5;
    static final Set<String> EXTENSIONS = Set.of("pdf", "docx", "doc", "txt", "md", "html", "htm");

    private final KnowledgeRepository repository;
    private final ModelGateway modelGateway;
    private final StorageProperties storage;
    private final TaskExecutor executor;
    private final KnowledgeVectors vectors;
    private final KnowledgePolicy policy;
    private final KnowledgeRevisions revisions;
    private final DocumentTextExtractor extractor;
    private final boolean localFolders;
    private final ModelSettings settings;

    public KnowledgeImporter(KnowledgeRepository repository, ModelGateway modelGateway, StorageProperties storage,
                             @Qualifier("knowledgeExecutor") TaskExecutor executor, KnowledgeVectors vectors,
                             KnowledgePolicy policy, KnowledgeRevisions revisions, DocumentTextExtractor extractor,
                             @Value("${factory.local-folders.enabled}") boolean localFolders, ModelSettings settings) {
        this.settings = settings;
        this.repository = repository;
        this.modelGateway = modelGateway;
        this.storage = storage;
        this.executor = executor;
        this.vectors = vectors;
        this.policy = policy;
        this.revisions = revisions;
        this.extractor = extractor;
        this.localFolders = localFolders;
    }

    /** queued: new documents and newer revisions being imported; skipped: unchanged or unreadable files, with why. */
    public record Imported(List<KnowledgeRepository.Document> queued, List<String> skipped) {
    }

    /**
     * Every supported file in a folder (not its subfolders) for one OBDX version. The folder is remembered and checked
     * again for new and changed files.
     */
    public Imported importFolder(Path folder, String obdxVersion, UUID workspaceId, String patchset, String user) {
        String version = normalizeVersion(obdxVersion);
        String p = patchset(patchset);
        if (!Files.isDirectory(folder)) {
            throw new BadRequestException("No folder at " + folder + ". Enter the full path of the folder with the documents.");
        }
        var source = repository.saveSource(folder.toAbsolutePath().normalize().toString(), version, workspaceId, p, user);
        Imported imported = scan(folder, version, workspaceId, p, source.id(), user);
        repository.sourceScanned(source.id(), result(imported));
        return imported;
    }

    public Imported importFile(String fileName, byte[] bytes, String obdxVersion, UUID workspaceId, String patchset, String user) {
        if (!supported(fileName)) {
            throw new BadRequestException("Upload a PDF, Word (.docx, .doc), text, Markdown or HTML file.");
        }
        List<KnowledgeRepository.Document> queued = new ArrayList<>();
        List<String> skipped = new ArrayList<>();
        add(fileName, bytes, normalizeVersion(obdxVersion), workspaceId, patchset(patchset), null, user, queued, skipped);
        return new Imported(queued, skipped);
    }

    /** Checks a watched folder again now. */
    public Imported rescan(UUID sourceId) {
        var source = repository.findSource(sourceId).orElseThrow(() -> new NotFoundException("Folder not found"));
        if (!localFolders) {
            throw new BadRequestException("Importing from a folder is off on this factory.");
        }
        Imported imported;
        try {
            imported = scan(Path.of(source.folder()), source.obdxVersion(), source.workspaceId(), source.patchset(), source.id(),
                    "factory (folder check)");
        } catch (BadRequestException e) {
            repository.sourceScanned(source.id(), e.getMessage());
            throw e;
        }
        repository.sourceScanned(source.id(), result(imported));
        return imported;
    }

    /** Checks every watched folder (on a schedule); a folder that cannot be read is reported on it, not thrown. */
    public void rescanAll() {
        if (!localFolders) {
            return;
        }
        for (var source : repository.sources(null)) {
            try {
                Imported imported = rescan(source.id());
                if (!imported.queued().isEmpty()) {
                    log.info("Knowledge folder {}: {}", source.folder(), result(imported));
                }
            } catch (RuntimeException e) {
                log.info("Knowledge folder {} not checked: {}", source.folder(), e.getMessage());
            }
        }
    }

    public void deleteSource(UUID sourceId) {
        repository.findSource(sourceId).orElseThrow(() -> new NotFoundException("Folder not found"));
        repository.deleteSource(sourceId);
    }

    private Imported scan(Path folder, String version, UUID workspaceId, String patchset, UUID sourceId, String user) {
        if (!Files.isDirectory(folder)) {
            throw new BadRequestException("No folder at " + folder + ". Enter the full path of the folder with the documents.");
        }
        List<Path> files;
        try (Stream<Path> list = Files.list(folder)) {
            files = list.filter(f -> Files.isRegularFile(f) && supported(f.getFileName().toString())).sorted().toList();
        } catch (IOException e) {
            throw new BadRequestException("The folder cannot be read: " + e.getMessage());
        }
        if (files.isEmpty()) {
            throw new BadRequestException("There are no PDF, Word, text, Markdown or HTML files in " + folder + ".");
        }
        List<KnowledgeRepository.Document> queued = new ArrayList<>();
        List<String> skipped = new ArrayList<>();
        for (Path f : files) {
            try {
                add(f.getFileName().toString(), Files.readAllBytes(f), version, workspaceId, patchset, sourceId, user, queued, skipped);
            } catch (IOException e) {
                skipped.add(f.getFileName() + " (cannot be read: " + e.getMessage() + ")");
            }
        }
        return new Imported(queued, skipped);
    }

    private void add(String fileName, byte[] bytes, String version, UUID workspaceId, String patchset, UUID sourceId, String user,
                     List<KnowledgeRepository.Document> queued, List<String> skipped) {
        String sha = sha256(bytes);
        var existing = repository.findDocument(version, sha, workspaceId);
        if (existing.isPresent() && !"FAILED".equals(existing.get().status())) {
            skipped.add(fileName + ("SUPERSEDED".equals(existing.get().status()) ? " (an older revision, already replaced)" : " (unchanged)"));
            return;
        }
        existing.ifPresent(d -> repository.deleteDocument(d.id()));
        UUID id = UUID.randomUUID();
        try {
            Path file = file(id, fileName);
            Files.createDirectories(file.getParent());
            Files.write(file, bytes);
        } catch (IOException e) {
            skipped.add(fileName + " (cannot be stored: " + e.getMessage() + ")");
            return;
        }
        var document = new KnowledgeRepository.Document(id, workspaceId, version, versionLine(version), title(fileName), fileName, sha,
                0, 0, 0, "QUEUED", null, user, null, null, patchset, null, null, sourceId);
        repository.insertDocument(document);
        queued.add(document);
        executor.execute(() -> read(id));
    }

    /** Embeds the sections still without an embedding (after the model was unavailable), in the background. */
    public void embedAgain(UUID documentId) {
        var document = repository.findDocument(documentId).orElseThrow(() -> new NotFoundException("Document not found"));
        if (document.supersededBy() != null) {
            throw new BadRequestException("This is an older revision; a newer one replaced it.");
        }
        if (!"READY".equals(document.status()) && !"FAILED".equals(document.status())) {
            throw new BadRequestException("The document is still being imported.");
        }
        executor.execute(() -> embed(documentId));
    }

    /** The stored copy of a document, in its own file type (documents imported before were all PDF). */
    public Path file(UUID documentId) {
        return file(documentId, repository.findDocument(documentId).map(KnowledgeRepository.Document::fileName).orElse("x.pdf"));
    }

    private Path file(UUID documentId, String fileName) {
        return storage.root().resolve("knowledge").resolve(documentId + "." + extension(fileName)).toAbsolutePath();
    }

    public void delete(UUID documentId) {
        Path file = file(documentId);
        repository.findDocument(documentId).orElseThrow(() -> new NotFoundException("Document not found"));
        repository.deleteDocument(documentId);
        vectors.changed();
        try {
            Files.deleteIfExists(file);
        } catch (IOException e) {
            log.warn("Could not delete the stored file of document {}: {}", documentId, e.getMessage());
        }
    }

    // --- background work ---

    private void read(UUID id) {
        var document = repository.findDocument(id).orElse(null);
        if (document == null) {
            return;
        }
        repository.updateDocument(id, "READING", null, null, null, null);
        List<ManualSplitter.Section> sections;
        int pages;
        try {
            Path file = file(id, document.fileName());
            if ("pdf".equals(extension(document.fileName()))) {
                List<ManualSplitter.Bookmark> bookmarks = new ArrayList<>();
                List<String> pageTexts = pdfPages(file, bookmarks);
                pages = pageTexts.size();
                sections = ManualSplitter.split(pageTexts, bookmarks);
            } else {
                // Word, text and HTML have no pages: their sections are cited by heading
                String text = extractor.extract(document.fileName(), Files.readAllBytes(file));
                pages = 0;
                sections = ManualSplitter.split(List.of(text)).stream()
                        .map(s -> new ManualSplitter.Section(s.heading(), 0, 0, s.content())).toList();
            }
        } catch (IOException | RuntimeException e) {
            repository.updateDocument(id, "FAILED", "The file cannot be read: " + e.getMessage(), null, null, null);
            return;
        }
        if (sections.isEmpty()) {
            repository.updateDocument(id, "FAILED", "No text found. If it is a scanned PDF, it needs OCR first.", pages, 0, 0);
            return;
        }
        repository.replaceSections(id, document.workspaceId(), document.versionLine(), sections);
        repository.readWith(id, READER_VERSION);
        vectors.changed();
        repository.updateDocument(id, "EMBEDDING", null, pages, sections.size(), repository.embeddedSections(id));
        embed(id);
    }

    /** The text of each page; the PDF's bookmarks (its chapters and sections) go to bookmarks. */
    private static List<String> pdfPages(Path file, List<ManualSplitter.Bookmark> bookmarks) throws IOException {
        List<String> pages = new ArrayList<>();
        try (PDDocument pdf = Loader.loadPDF(file.toFile())) {
            PDDocumentOutline outline = pdf.getDocumentCatalog().getDocumentOutline();
            if (outline != null) {
                bookmarks(pdf, outline, List.of(), bookmarks);
            }
            PDFTextStripper stripper = new PDFTextStripper();
            stripper.setSortByPosition(true);
            for (int p = 1; p <= pdf.getNumberOfPages(); p++) {
                stripper.setStartPage(p);
                stripper.setEndPage(p);
                pages.add(stripper.getText(pdf));
            }
        }
        return pages;
    }

    private static void bookmarks(PDDocument pdf, PDOutlineNode node, List<String> parents, List<ManualSplitter.Bookmark> out) throws IOException {
        if (parents.size() > 5) {
            return;
        }
        for (PDOutlineItem item : node.children()) {
            if (out.size() >= 5000) {
                return;
            }
            PDPage page = item.findDestinationPage(pdf);
            String title = item.getTitle() == null ? "" : item.getTitle().replaceAll("\\s+", " ").strip();
            if (page != null && !title.isEmpty() && title.length() <= 300) {
                out.add(new ManualSplitter.Bookmark(pdf.getPages().indexOf(page) + 1, title, parents));
            }
            List<String> below = new ArrayList<>(parents);
            below.add(title);
            bookmarks(pdf, item, below, out);
        }
    }

    /**
     * Documents read by an earlier version of the reading (before bookmarks were headings and numbered steps stayed in
     * their procedure) are read and embedded again, in the background, one at a time.
     */
    private void readAgainOlder() {
        List<UUID> older = repository.readBefore(READER_VERSION);
        for (UUID id : older) {
            executor.execute(() -> read(id));
        }
        if (!older.isEmpty()) {
            log.info("Reading {} knowledge document(s) again with the improved section splitting", older.size());
        }
    }

    /** The embedding server and model, as one name: sections embedded by another one do not compare with its vectors. */
    private String embeddingModel() {
        var current = settings.current();
        return current.embeddingUrl() + " " + current.embeddingModel();
    }

    /**
     * When the models change on the Models page: the documents embedded by another embedding model are embedded again
     * (their vectors do not compare with the new model's), and those whose embedding stopped (the model was unavailable
     * or outside the bank) are finished, in the background, one at a time. Nothing goes to a model outside the bank.
     */
    @EventListener
    public void modelsChanged(ModelSettings.Changed event) {
        if (policy.embeddingProblem() == null) {
            embedAll();
        }
    }

    /**
     * Embeds, in the background, every current document not embedded by the embedding model in use: those whose
     * embedding stopped, and those embedded by another model. Returns how many were queued.
     *
     * @throws BadRequestException when the embedding model is outside the bank
     */
    public int embedAll() {
        String problem = policy.embeddingProblem();
        if (problem != null) {
            throw new BadRequestException(problem);
        }
        String model = embeddingModel();
        List<UUID> again = repository.embeddedByAnother(model);
        again.forEach(repository::clearEmbeddings);
        List<UUID> todo = repository.unfinishedEmbeddings();
        // Shown as embedding at once, so the Library follows them until they are done
        todo.forEach(id -> repository.updateDocument(id, "EMBEDDING", null, null, null, null));
        todo.forEach(id -> executor.execute(() -> embed(id)));
        if (!todo.isEmpty()) {
            vectors.changed();
            log.info("Embedding {} knowledge document(s) with {} ({} embedded by another model)", todo.size(), model, again.size());
        }
        return todo.size();
    }

    private void embed(UUID id) {
        String problem = policy.embeddingProblem();
        if (problem != null) {
            // The bank's documents are not sent to an embedding model outside the bank
            ready(id, "Searched by keywords only. " + problem);
            return;
        }
        String model = embeddingModel();
        try {
            while (true) {
                List<KnowledgeRepository.PendingEmbedding> batch = repository.sectionsWithoutEmbedding(id, EMBED_BATCH);
                if (batch.isEmpty()) {
                    break;
                }
                // Checked before every batch: the models can change on the Models page while a document is embedded
                String now = policy.embeddingProblem();
                if (now != null || !model.equals(embeddingModel())) {
                    problem = now != null ? "Searched by keywords only. " + now : null;
                    log.info("Knowledge document {}: the embedding model changed while it was embedded", id);
                    break;
                }
                List<float[]> embeddings = modelGateway.embedPassages(batch.stream().map(KnowledgeRepository.PendingEmbedding::text).toList());
                for (int i = 0; i < batch.size(); i++) {
                    repository.saveSectionEmbedding(batch.get(i).id(), embeddings.get(i));
                }
                vectors.changed();
                repository.updateDocument(id, "EMBEDDING", null, null, null, repository.embeddedSections(id));
                repository.embeddedWith(id, model);
            }
        } catch (RuntimeException e) {  // the model gateway reports problems as ModelGatewayException
            problem = "Searched by keywords only: the embedding model is unavailable (" + e.getMessage() + "). Use Embed again when it is back.";
            log.info("Knowledge document {}: {}", id, problem);
        }
        ready(id, problem);
    }

    /** The document is searchable: it replaces its older revisions, and the notes citing them are checked. */
    private void ready(UUID id, String message) {
        // The older revisions go first, so a document is never ready while the one it replaces is still current
        String check = null;
        try {
            int flagged = revisions.replaceEarlier(id);
            if (flagged > 0) {
                check = flagged + " note(s) cite sections this revision changed: check them on the Notes tab.";
            }
        } catch (RuntimeException e) {
            log.warn("Knowledge document {}: the older revision was not replaced: {}", id, e.getMessage());
        }
        String text = message == null ? check : check == null ? message : message + " " + check;
        repository.updateDocument(id, "READY", text, null, null, repository.embeddedSections(id));
    }

    @EventListener(ApplicationReadyEvent.class)
    public void resumeUnfinished() {
        // The files are kept, so imports the factory stopped in the middle carry on: documents that were being
        // embedded have all their sections and finish their embeddings; the others are read again
        List<UUID> unfinished = repository.unfinished();
        for (UUID id : unfinished) {
            var document = repository.findDocument(id).orElse(null);
            if (document == null) {
                continue;
            }
            if (!Files.exists(file(id, document.fileName()))) {
                repository.updateDocument(id, "FAILED", "The factory stopped during the import and the file is gone. Import it again.", null, null, null);
            } else if ("EMBEDDING".equals(document.status())) {
                executor.execute(() -> embed(id));
            } else {
                executor.execute(() -> read(id));
            }
        }
        if (!unfinished.isEmpty()) {
            log.info("Resuming {} knowledge document import(s) stopped when the factory stopped", unfinished.size());
        }
        readAgainOlder();
        // Documents whose embedding stopped (the model was unavailable, or outside the bank then) are finished
        if (policy.embeddingProblem() == null) {
            repository.unfinishedEmbeddings().forEach(id -> executor.execute(() -> embed(id)));
        }
    }

    // --- helpers ---

    static String result(Imported imported) {
        long unchanged = imported.skipped().stream().filter(s -> s.endsWith("(unchanged)") || s.endsWith("already replaced)")).count();
        boolean unreadable = imported.skipped().stream().anyMatch(s -> s.contains("cannot be"));
        return imported.queued().size() + " new or changed, " + unchanged + " unchanged" + (unreadable ? ", some could not be read" : "");
    }

    static boolean supported(String fileName) {
        return fileName != null && EXTENSIONS.contains(extension(fileName));
    }

    static String extension(String fileName) {
        int dot = fileName == null ? -1 : fileName.lastIndexOf('.');
        return dot < 0 ? "" : fileName.substring(dot + 1).toLowerCase(Locale.ROOT);
    }

    /** "25.2.0.1", "Patch 37012345": kept as entered; blank: the release itself. */
    static String patchset(String patchset) {
        String p = patchset == null ? "" : patchset.strip();
        return p.isEmpty() ? null : p.length() > 100 ? p.substring(0, 100) : p;
    }

    /** "25.2", "25.2.0.0.0" and "OBDX 25.2" all become 25.2; the major version alone (25) is accepted too. */
    static String normalizeVersion(String version) {
        String v = version == null ? "" : version.replaceAll("[^0-9.]", "").replaceAll("^\\.+|\\.+$", "");
        if (!v.matches("\\d{2}(\\.\\d+)*")) {
            throw new BadRequestException("Enter the OBDX version of the documents, for example 22.2 or 25.2.");
        }
        String[] parts = v.split("\\.");
        return parts.length == 1 ? parts[0] : parts[0] + "." + parts[1];
    }

    /** The major version: 22.2 and 22.x are both 22. */
    static String versionLine(String version) {
        if (version == null) {
            return null;
        }
        String digits = version.replaceAll("^\\D*", "");
        int dot = digits.indexOf('.');
        String line = dot < 0 ? digits.replaceAll("\\D.*", "") : digits.substring(0, dot);
        return line.isEmpty() ? null : line;
    }

    /** "Oracle Banking Digital Experience Extensibility Guide.pdf" becomes "Extensibility Guide". */
    static String title(String fileName) {
        String t = fileName.replaceAll("(?i)\\.(pdf|docx?|txt|md|html?)$", "").replace('_', ' ').replace('-', ' ').replaceAll("\\s+", " ").strip();
        t = t.replaceFirst("(?i)^Oracle Banking Digital Experience\\s+", "").replaceFirst("(?i)^User Manual Oracle Banking Digital Experience\\s+", "User Manual ");
        if (t.equals(t.toLowerCase(Locale.ROOT))) {
            t = java.util.Arrays.stream(t.split(" ")).map(w -> w.isEmpty() ? w : Character.toUpperCase(w.charAt(0)) + w.substring(1))
                    .reduce((a, b) -> a + " " + b).orElse(t);
        }
        return t.length() > 300 ? t.substring(0, 300) : t;
    }

    private static String sha256(byte[] bytes) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
