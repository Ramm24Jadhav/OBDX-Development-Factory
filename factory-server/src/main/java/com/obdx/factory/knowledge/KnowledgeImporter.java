package com.obdx.factory.knowledge;

import com.obdx.factory.common.BadRequestException;
import com.obdx.factory.common.NotFoundException;
import com.obdx.factory.importing.StorageProperties;
import com.obdx.factory.model.ModelGateway;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
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
import java.util.UUID;
import java.util.stream.Stream;

/**
 * Brings documents into the knowledge base: Oracle's OBDX manuals for a version (from a folder on the factory's
 * computer or uploaded), and a bank's own documents for one workspace. Each PDF is copied into the data folder (so
 * answers can open it at the cited page), read page by page, split into sections and embedded in the background.
 * Importing a file that is already there for that version is skipped. Without the embedding model a document is
 * still searched by keywords and can be embedded later.
 */
@Service
public class KnowledgeImporter {

    private static final Logger log = LoggerFactory.getLogger(KnowledgeImporter.class);
    private static final int EMBED_BATCH = 16;

    private final KnowledgeRepository repository;
    private final ModelGateway modelGateway;
    private final StorageProperties storage;
    private final TaskExecutor executor;
    private final KnowledgeVectors vectors;
    private final KnowledgePolicy policy;

    public KnowledgeImporter(KnowledgeRepository repository, ModelGateway modelGateway, StorageProperties storage,
                             @Qualifier("knowledgeExecutor") TaskExecutor executor, KnowledgeVectors vectors,
                             KnowledgePolicy policy) {
        this.repository = repository;
        this.policy = policy;
        this.vectors = vectors;
        this.modelGateway = modelGateway;
        this.storage = storage;
        this.executor = executor;
    }

    public record Imported(List<KnowledgeRepository.Document> queued, List<String> skipped) {
    }

    /** Every PDF in a folder (not its subfolders) for one OBDX version. */
    public Imported importFolder(Path folder, String obdxVersion, UUID workspaceId, String user) {
        if (!Files.isDirectory(folder)) {
            throw new BadRequestException("No folder at " + folder + ". Enter the full path of the folder with the PDF files.");
        }
        List<Path> pdfs;
        try (Stream<Path> files = Files.list(folder)) {
            pdfs = files.filter(f -> f.getFileName().toString().toLowerCase(Locale.ROOT).endsWith(".pdf")).sorted().toList();
        } catch (IOException e) {
            throw new BadRequestException("The folder cannot be read: " + e.getMessage());
        }
        if (pdfs.isEmpty()) {
            throw new BadRequestException("There are no PDF files in " + folder + ".");
        }
        List<KnowledgeRepository.Document> queued = new ArrayList<>();
        List<String> skipped = new ArrayList<>();
        for (Path pdf : pdfs) {
            try {
                add(pdf.getFileName().toString(), Files.readAllBytes(pdf), obdxVersion, workspaceId, user, queued, skipped);
            } catch (IOException e) {
                skipped.add(pdf.getFileName() + " (cannot be read: " + e.getMessage() + ")");
            }
        }
        return new Imported(queued, skipped);
    }

    public Imported importFile(String fileName, byte[] bytes, String obdxVersion, UUID workspaceId, String user) {
        if (fileName == null || !fileName.toLowerCase(Locale.ROOT).endsWith(".pdf")) {
            throw new BadRequestException("Upload a PDF file.");
        }
        List<KnowledgeRepository.Document> queued = new ArrayList<>();
        List<String> skipped = new ArrayList<>();
        add(fileName, bytes, obdxVersion, workspaceId, user, queued, skipped);
        return new Imported(queued, skipped);
    }

    private void add(String fileName, byte[] bytes, String obdxVersion, UUID workspaceId, String user,
                     List<KnowledgeRepository.Document> queued, List<String> skipped) {
        String version = normalizeVersion(obdxVersion);
        String sha = sha256(bytes);
        var existing = repository.findDocument(version, sha, workspaceId);
        if (existing.isPresent() && !"FAILED".equals(existing.get().status())) {
            skipped.add(fileName + " (already imported)");
            return;
        }
        existing.ifPresent(d -> repository.deleteDocument(d.id()));
        UUID id = UUID.randomUUID();
        try {
            Path file = file(id);
            Files.createDirectories(file.getParent());
            Files.write(file, bytes);
        } catch (IOException e) {
            skipped.add(fileName + " (cannot be stored: " + e.getMessage() + ")");
            return;
        }
        var document = new KnowledgeRepository.Document(id, workspaceId, version, versionLine(version), title(fileName), fileName, sha,
                0, 0, 0, "QUEUED", null, user, null, null);
        repository.insertDocument(document);
        queued.add(document);
        executor.execute(() -> read(id));
    }

    /** Embeds the sections still without an embedding (after the model was unavailable), in the background. */
    public void embedAgain(UUID documentId) {
        var document = repository.findDocument(documentId).orElseThrow(() -> new NotFoundException("Document not found"));
        if (!"READY".equals(document.status()) && !"FAILED".equals(document.status())) {
            throw new BadRequestException("The document is still being imported.");
        }
        executor.execute(() -> embed(documentId));
    }

    public Path file(UUID documentId) {
        return storage.root().resolve("knowledge").resolve(documentId + ".pdf").toAbsolutePath();
    }

    public void delete(UUID documentId) {
        repository.findDocument(documentId).orElseThrow(() -> new NotFoundException("Document not found"));
        repository.deleteDocument(documentId);
        vectors.changed();
        try {
            Files.deleteIfExists(file(documentId));
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
        List<String> pages = new ArrayList<>();
        try (PDDocument pdf = Loader.loadPDF(file(id).toFile())) {
            PDFTextStripper stripper = new PDFTextStripper();
            stripper.setSortByPosition(true);
            for (int p = 1; p <= pdf.getNumberOfPages(); p++) {
                stripper.setStartPage(p);
                stripper.setEndPage(p);
                pages.add(stripper.getText(pdf));
            }
        } catch (IOException | RuntimeException e) {
            repository.updateDocument(id, "FAILED", "The PDF cannot be read: " + e.getMessage(), null, null, null);
            return;
        }
        List<ManualSplitter.Section> sections = ManualSplitter.split(pages);
        if (sections.isEmpty()) {
            repository.updateDocument(id, "FAILED", "No text found. If it is a scanned PDF, it needs OCR first.", pages.size(), 0, 0);
            return;
        }
        repository.replaceSections(id, document.workspaceId(), document.versionLine(), sections);
        vectors.changed();
        repository.updateDocument(id, "EMBEDDING", null, pages.size(), sections.size(), 0);
        embed(id);
    }

    private void embed(UUID id) {
        String problem = policy.embeddingProblem();
        if (problem != null) {
            // The bank's documents are not sent to an embedding model outside the bank
            repository.updateDocument(id, "READY", "Searched by keywords only. " + problem, null, null, repository.embeddedSections(id));
            return;
        }
        try {
            while (true) {
                List<KnowledgeRepository.PendingEmbedding> batch = repository.sectionsWithoutEmbedding(id, EMBED_BATCH);
                if (batch.isEmpty()) {
                    break;
                }
                List<float[]> embeddings = modelGateway.embedAll(batch.stream().map(KnowledgeRepository.PendingEmbedding::text).toList());
                for (int i = 0; i < batch.size(); i++) {
                    repository.saveSectionEmbedding(batch.get(i).id(), embeddings.get(i));
                }
                vectors.changed();
                repository.updateDocument(id, "EMBEDDING", null, null, null, repository.embeddedSections(id));
            }
        } catch (RuntimeException e) {  // the model gateway reports problems as ModelGatewayException
            problem = "Searched by keywords only: the embedding model is unavailable (" + e.getMessage() + "). Use Embed again when it is back.";
            log.info("Knowledge document {}: {}", id, problem);
        }
        repository.updateDocument(id, "READY", problem, null, null, repository.embeddedSections(id));
    }

    @EventListener(ApplicationReadyEvent.class)
    public void resumeUnfinished() {
        // The files are kept, so imports the factory stopped in the middle of carry on: documents that were being
        // embedded have all their sections and finish their embeddings; the others are read again
        List<UUID> unfinished = repository.unfinished();
        for (UUID id : unfinished) {
            var document = repository.findDocument(id).orElse(null);
            if (document == null) {
                continue;
            }
            if (!Files.exists(file(id))) {
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
    }

    // --- helpers ---

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
        String t = fileName.replaceAll("(?i)\\.pdf$", "").replace('_', ' ').replace('-', ' ').replaceAll("\\s+", " ").strip();
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
