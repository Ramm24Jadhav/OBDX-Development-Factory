package com.obdx.factory.indexing;

import com.obdx.factory.model.ModelGateway;
import com.obdx.factory.model.ModelGatewayException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import java.io.IOException;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.nio.file.FileVisitResult;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.SimpleFileVisitor;
import java.nio.file.attribute.BasicFileAttributes;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

/**
 * Indexes a workspace's working copy: finds source files, re-indexes only those whose content changed since the
 * last run, removes files that disappeared, then creates embeddings for chunks that do not have one yet.
 */
@Service
public class CodeIndexer {

    private static final Logger log = LoggerFactory.getLogger(CodeIndexer.class);

    private final CodeIndexRepository repository;
    private final Chunkers chunkers;
    private final ModelGateway modelGateway;
    private final IndexingProperties properties;
    private final TransactionTemplate transactions;

    public CodeIndexer(CodeIndexRepository repository, Chunkers chunkers, ModelGateway modelGateway,
                       IndexingProperties properties, TransactionTemplate transactions) {
        this.repository = repository;
        this.chunkers = chunkers;
        this.modelGateway = modelGateway;
        this.properties = properties;
        this.transactions = transactions;
    }

    /** Running totals, reported to the caller as the index progresses. */
    public static final class Progress {
        public int filesScanned;
        public int filesIndexed;
        public int filesRemoved;
        public int chunksIndexed;
        public int embeddingsCreated;
        public String warning;
    }

    public interface ProgressListener {
        void onProgress(Progress progress);
    }

    public Progress index(UUID workspaceId, Path root, long revision, ProgressListener listener) throws IOException {
        Progress progress = new Progress();
        Map<String, CodeIndexRepository.StoredFile> stored = repository.findFiles(workspaceId);
        Set<String> seen = new HashSet<>();

        for (Path file : findSourceFiles(root)) {
            String path = root.relativize(file).toString().replace('\\', '/');
            String language = Language.of(file.getFileName().toString()).orElseThrow();
            seen.add(path);
            progress.filesScanned++;

            byte[] bytes = Files.readAllBytes(file);
            String hash = sha256(bytes);
            CodeIndexRepository.StoredFile existing = stored.get(path);
            if (existing != null && existing.contentHash().equals(hash)) {
                continue;
            }
            Optional<String> content = decode(bytes);
            if (content.isEmpty()) {
                log.debug("Skipping {}: looks like a binary file", path);
                seen.remove(path);
                continue;
            }
            List<Chunk> chunks = chunkers.chunk(path, language, content.get().replace("\r\n", "\n"));
            transactions.executeWithoutResult(status ->
                    repository.replaceFile(workspaceId, path, language, bytes.length, hash, revision, chunks));
            progress.filesIndexed++;
            progress.chunksIndexed += chunks.size();
            if (progress.filesScanned % 100 == 0) {
                listener.onProgress(progress);
            }
        }

        for (Map.Entry<String, CodeIndexRepository.StoredFile> entry : stored.entrySet()) {
            if (!seen.contains(entry.getKey())) {
                repository.deleteFile(entry.getValue().id());
                progress.filesRemoved++;
            }
        }
        listener.onProgress(progress);

        if (properties.embeddingsEnabled()) {
            createEmbeddings(workspaceId, progress, listener);
        }
        return progress;
    }

    private void createEmbeddings(UUID workspaceId, Progress progress, ProgressListener listener) {
        int batchSize = Math.max(1, properties.embeddingBatchSize());
        while (true) {
            List<CodeIndexRepository.PendingEmbedding> batch = repository.findChunksWithoutEmbedding(workspaceId, batchSize);
            if (batch.isEmpty()) {
                return;
            }
            List<float[]> vectors;
            try {
                vectors = modelGateway.embedAll(batch.stream().map(CodeIndexRepository.PendingEmbedding::text).toList());
            } catch (ModelGatewayException e) {
                // Keyword search still works without embeddings; the next import retries the missing ones.
                progress.warning = "Semantic search embeddings were not created: " + e.getMessage();
                log.warn(progress.warning);
                return;
            }
            transactions.executeWithoutResult(status -> {
                for (int i = 0; i < batch.size(); i++) {
                    repository.saveEmbedding(batch.get(i).chunkId(), vectors.get(i));
                }
            });
            progress.embeddingsCreated += batch.size();
            listener.onProgress(progress);
        }
    }

    private List<Path> findSourceFiles(Path root) throws IOException {
        Set<String> excluded = new HashSet<>(properties.excludeDirs());
        long maxBytes = properties.maxFileSize().toBytes();
        List<Path> files = new ArrayList<>();
        Files.walkFileTree(root, new SimpleFileVisitor<>() {
            @Override
            public FileVisitResult preVisitDirectory(Path dir, BasicFileAttributes attrs) {
                return !dir.equals(root) && excluded.contains(dir.getFileName().toString())
                        ? FileVisitResult.SKIP_SUBTREE : FileVisitResult.CONTINUE;
            }

            @Override
            public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) {
                if (attrs.isRegularFile() && attrs.size() <= maxBytes && Language.of(file.getFileName().toString()).isPresent()) {
                    files.add(file);
                }
                return FileVisitResult.CONTINUE;
            }
        });
        files.sort(null);
        return files;
    }

    private static Optional<String> decode(byte[] bytes) {
        try {
            return Optional.of(StandardCharsets.UTF_8.newDecoder()
                    .onMalformedInput(CodingErrorAction.REPORT)
                    .onUnmappableCharacter(CodingErrorAction.REPORT)
                    .decode(java.nio.ByteBuffer.wrap(bytes)).toString());
        } catch (CharacterCodingException e) {
            // Older OBDX files may be ISO-8859-1; every byte sequence is valid there, but skip binary-looking files.
            for (byte b : bytes) {
                if (b == 0) {
                    return Optional.empty();
                }
            }
            return Optional.of(new String(bytes, StandardCharsets.ISO_8859_1));
        }
    }

    private static String sha256(byte[] bytes) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
