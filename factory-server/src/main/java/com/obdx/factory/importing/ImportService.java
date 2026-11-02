package com.obdx.factory.importing;

import com.obdx.factory.common.BadRequestException;
import com.obdx.factory.common.ConflictException;
import com.obdx.factory.common.NotFoundException;
import com.obdx.factory.indexing.CodeIndexRepository;
import com.obdx.factory.indexing.CodeIndexer;
import com.obdx.factory.modernization.Inventory;
import com.obdx.factory.modernization.InventoryService;
import com.obdx.factory.profile.ProjectProfileService;
import com.obdx.factory.svn.SvnClient;
import com.obdx.factory.svn.SvnCredentials;
import com.obdx.factory.workspace.Workspace;
import com.obdx.factory.workspace.WorkspaceRepository;
import com.obdx.factory.workspace.WorkspaceService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.core.task.TaskExecutor;
import org.springframework.data.domain.Limit;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.FileSystemUtils;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.OffsetDateTime;
import java.util.EnumSet;
import java.util.List;
import java.util.UUID;

/**
 * Brings a workspace's code in from SVN and indexes it, as a background job: the first run checks the code out,
 * later runs update it and re-index only what changed.
 */
@Service
public class ImportService {

    private static final Logger log = LoggerFactory.getLogger(ImportService.class);

    private final ImportJobRepository jobs;
    private final WorkspaceRepository workspaces;
    private final WorkspaceService workspaceService;
    private final SvnClient svnClient;
    private final CodeIndexer indexer;
    private final CodeIndexRepository index;
    private final StorageProperties storage;
    private final ProjectProfileService profiles;
    private final InventoryService inventories;
    private final TaskExecutor executor;
    private final WorkingCopyLocks locks;
    private final com.obdx.factory.auth.AuditLog audit;
    private final org.springframework.jdbc.core.JdbcTemplate jdbc;

    public ImportService(ImportJobRepository jobs, WorkspaceRepository workspaces, WorkspaceService workspaceService,
                         SvnClient svnClient, CodeIndexer indexer, CodeIndexRepository index, StorageProperties storage,
                         ProjectProfileService profiles, InventoryService inventories, @Qualifier("importExecutor") TaskExecutor executor,
                         WorkingCopyLocks locks, com.obdx.factory.auth.AuditLog audit, org.springframework.jdbc.core.JdbcTemplate jdbc) {
        this.locks = locks;
        this.audit = audit;
        this.jdbc = jdbc;
        this.jobs = jobs;
        this.workspaces = workspaces;
        this.workspaceService = workspaceService;
        this.svnClient = svnClient;
        this.indexer = indexer;
        this.index = index;
        this.storage = storage;
        this.profiles = profiles;
        this.inventories = inventories;
        this.executor = executor;
    }

    public synchronized ImportJobResponse start(UUID workspaceId) {
        return start(workspaceId, false);
    }

    public synchronized ImportJobResponse start(UUID workspaceId, boolean fresh) {
        return start(workspaceId, fresh, null);
    }

    /**
     * @param fresh discard the working copy and check out again (a working copy svn cannot use any more): refused while
     *              a change of the workspace is being analyzed, written, built or delivered, which read the working copy
     * @param by    who asked (a failed check-out-again is audited with that name)
     */
    public synchronized ImportJobResponse start(UUID workspaceId, boolean fresh, String by) {
        Workspace workspace = findWorkspace(workspaceId);
        if (workspace.getSvnUrl() == null) {
            throw new BadRequestException("Set the workspace's SVN URL before importing code");
        }
        if (jobs.existsByWorkspaceIdAndStatusIn(workspaceId, EnumSet.of(ImportJob.Status.QUEUED, ImportJob.Status.RUNNING))) {
            throw new ConflictException("An import is already running for this workspace");
        }
        if (fresh) {
            locks.requireFree(workspaceId);
            Integer running = jdbc.queryForObject("SELECT count(*) FROM change_request WHERE workspace_id = ? AND (status IN ('ANALYZING', "
                    + "'GENERATING') OR build_status = 'BUILDING')", Integer.class, workspaceId);
            if (running != null && running > 0) {
                throw new ConflictException("A change of this workspace is being analyzed, written or built, and it reads the working "
                        + "copy. Wait for it to finish, then check out again.");
            }
        }
        ImportJob job = jobs.save(new ImportJob(workspaceId, workspace.getIndexedRevision()));
        executor.execute(() -> run(job.getId(), fresh, by));
        return ImportJobResponse.from(job);
    }

    /** How the audit names a check-out-again that failed (the job's message says why). */
    public static final String CHECK_OUT_AGAIN_FAILED = "WORKING_COPY_CHECK_OUT_AGAIN_FAILED";

    @Transactional(readOnly = true)
    public List<ImportJobResponse> recent(UUID workspaceId, int limit) {
        findWorkspace(workspaceId);
        return jobs.findByWorkspaceIdOrderByCreatedAtDesc(workspaceId, Limit.of(Math.clamp(limit, 1, 100)))
                .stream().map(ImportJobResponse::from).toList();
    }

    @Transactional(readOnly = true)
    public IndexStatusResponse indexStatus(UUID workspaceId) {
        Workspace workspace = findWorkspace(workspaceId);
        CodeIndexRepository.IndexStats stats = index.stats(workspaceId);
        return new IndexStatusResponse(workspace.getIndexedRevision(), stats.files(), stats.chunks(),
                stats.chunksWithEmbedding(), stats.filesByLanguage());
    }

    public record IndexStatusResponse(Long indexedRevision, long files, long chunks, long chunksWithEmbedding,
                                      java.util.Map<String, Long> filesByLanguage) {
    }

    /** Jobs cannot survive a restart; mark any left over as failed so a new import can start. */
    @EventListener(ApplicationReadyEvent.class)
    @Order(Ordered.HIGHEST_PRECEDENCE)
    @Transactional
    public void failInterruptedJobs() {
        int count = jobs.failUnfinished("Interrupted because the server restarted. Start the import again.", OffsetDateTime.now());
        if (count > 0) {
            log.warn("Marked {} unfinished import job(s) as failed after restart", count);
        }
    }

    void run(UUID jobId) {
        run(jobId, false);
    }

    void run(UUID jobId, boolean fresh) {
        run(jobId, fresh, null);
    }

    void run(UUID jobId, boolean fresh, String by) {
        ImportJob job = jobs.findById(jobId).orElseThrow();
        job.start();
        jobs.save(job);
        // Check out again holds the working copy from start to end: a delivery or a change's writing waits
        boolean held = fresh && locks.hold(job.getWorkspaceId(), "checked out again");
        try {
            if (fresh && !held) {
                throw new ConflictException("The workspace's code is being " + locks.holder(job.getWorkspaceId())
                        + " right now. Wait for it to finish, then check out again.");
            }
            Workspace workspace = findWorkspace(job.getWorkspaceId());
            SvnCredentials credentials = workspaceService.credentials(workspace);
            Path workingCopy = storage.workingCopy(workspace.getId());

            long revision = checkoutOrUpdate(workspace.getSvnUrl(), workingCopy, credentials, fresh);
            job.setToRevision(revision);
            jobs.save(job);

            CodeIndexer.Progress progress = indexer.index(workspace.getId(), workingCopy, revision, p -> saveProgress(job, p));
            saveProgress(job, progress);

            Workspace latest = findWorkspace(workspace.getId());
            latest.setIndexedRevision(revision);
            workspaces.save(latest);

            String summary = "Indexed revision " + revision + ": " + progress.filesIndexed + " changed file(s), "
                    + progress.filesRemoved + " removed, " + progress.embeddingsCreated + " embedding(s) created.";
            if (progress.warning != null) {
                summary += " " + progress.warning;
            }
            summary += refreshProfile(workspace.getId());
            summary += refreshInventory(workspace.getId());
            job.succeed(summary);
        } catch (Exception e) {
            log.error("Import job {} failed", jobId, e);
            job.fail(e.getMessage() != null ? com.obdx.factory.common.Messages.redacted(e.getMessage()) : e.getClass().getSimpleName());
            if (fresh) {
                try {
                    audit.recordAs(by, CHECK_OUT_AGAIN_FAILED, job.getWorkspaceId(), jobId.toString(), job.getMessage());
                } catch (RuntimeException auditFailed) {
                    log.warn("Could not record the failed check-out-again of job {}", jobId, auditFailed);
                }
            }
        } finally {
            if (held) {
                locks.release(job.getWorkspaceId());
            }
        }
        jobs.save(job);
    }

    /** The profile follows the code, so it is re-detected after every import. A failure here does not fail the import. */
    private String refreshProfile(UUID workspaceId) {
        try {
            profiles.refresh(workspaceId);
            return " Project profile updated.";
        } catch (RuntimeException e) {
            log.warn("Project profile detection failed for workspace {}", workspaceId, e);
            return " Project profile could not be updated: " + e.getMessage();
        }
    }

    /** The modernization inventory also follows the code. A failure here does not fail the import. */
    private String refreshInventory(UUID workspaceId) {
        try {
            Inventory inventory = inventories.scan(workspaceId);
            return " Inventory: " + inventory.summary().screens() + " screen(s), " + inventory.summary().endpoints() + " service(s).";
        } catch (RuntimeException e) {
            log.warn("Inventory scan failed for workspace {}", workspaceId, e);
            return " Inventory could not be updated: " + e.getMessage();
        }
    }

    private long checkoutOrUpdate(String url, Path workingCopy, SvnCredentials credentials, boolean fresh) throws IOException {
        if (fresh) {
            log.info("Discarding the working copy {} to check it out again", workingCopy);
        } else if (Files.isDirectory(workingCopy.resolve(".svn"))) {
            String checkedOutUrl = svnClient.info(workingCopy.toString(), credentials).url();
            if (checkedOutUrl.equals(url.replaceAll("/+$", ""))) {
                return svnClient.update(workingCopy, credentials);
            }
            log.info("SVN URL changed from {} to {}; checking out again", checkedOutUrl, url);
        }
        return checkOutInPlace(url, workingCopy, credentials);
    }

    /**
     * Checks the code out next to the working copy and puts it in its place only once the check-out succeeded: a server
     * that cannot be reached leaves the old working copy (and the code the factory reads) as it was.
     */
    private long checkOutInPlace(String url, Path workingCopy, SvnCredentials credentials) throws IOException {
        Path fresh = workingCopy.resolveSibling(workingCopy.getFileName() + ".new");
        deleteWorkingCopy(fresh);
        Files.createDirectories(workingCopy.getParent());
        long revision;
        try {
            revision = svnClient.checkout(url, fresh, credentials);
        } catch (RuntimeException e) {
            try {
                deleteWorkingCopy(fresh);
            } catch (IOException cleanup) {
                e.addSuppressed(cleanup);
            }
            throw e;
        }
        deleteWorkingCopy(workingCopy);
        Files.move(fresh, workingCopy);
        return revision;
    }

    /**
     * Removes a working copy. svn keeps its pristine copies read-only, which Windows refuses to delete, so each file
     * is made writable first; a file another program holds open is named in the error. Symbolic links and junctions are
     * removed themselves, never followed: what they point to is left as it is.
     */
    static void deleteWorkingCopy(Path workingCopy) throws IOException {
        if (!Files.exists(workingCopy, java.nio.file.LinkOption.NOFOLLOW_LINKS)) {
            return;
        }
        try {
            Files.walkFileTree(workingCopy, new java.nio.file.SimpleFileVisitor<>() {
                @Override
                public java.nio.file.FileVisitResult preVisitDirectory(Path dir, java.nio.file.attribute.BasicFileAttributes attrs)
                        throws IOException {
                    if (attrs.isOther() || attrs.isSymbolicLink()) {
                        // a junction (Windows) or a link: the link goes, not what it points to
                        Files.delete(dir);
                        return java.nio.file.FileVisitResult.SKIP_SUBTREE;
                    }
                    dir.toFile().setWritable(true);
                    return java.nio.file.FileVisitResult.CONTINUE;
                }

                @Override
                public java.nio.file.FileVisitResult visitFile(Path file, java.nio.file.attribute.BasicFileAttributes attrs) throws IOException {
                    if (!attrs.isSymbolicLink() && !attrs.isOther()) {
                        file.toFile().setWritable(true);
                    }
                    Files.delete(file);
                    return java.nio.file.FileVisitResult.CONTINUE;
                }

                @Override
                public java.nio.file.FileVisitResult postVisitDirectory(Path dir, IOException failure) throws IOException {
                    if (failure != null) {
                        throw failure;
                    }
                    Files.delete(dir);
                    return java.nio.file.FileVisitResult.CONTINUE;
                }
            });
        } catch (IOException e) {
            throw new IOException("Could not remove the old working copy (" + e.getMessage() + "). Close any program that uses its "
                    + "files (an editor, TortoiseSVN, a virus scan), then try again.", e);
        }
    }

    private void saveProgress(ImportJob job, CodeIndexer.Progress progress) {
        job.setCounts(progress.filesScanned, progress.filesIndexed, progress.filesRemoved, progress.chunksIndexed,
                progress.embeddingsCreated);
        jobs.save(job);
    }

    private Workspace findWorkspace(UUID id) {
        return workspaces.findById(id).orElseThrow(() -> new NotFoundException("Workspace not found: " + id));
    }
}
