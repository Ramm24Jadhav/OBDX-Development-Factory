package com.obdx.factory.importing;

import com.obdx.factory.common.BadRequestException;
import com.obdx.factory.common.ConflictException;
import com.obdx.factory.common.NotFoundException;
import com.obdx.factory.indexing.CodeIndexRepository;
import com.obdx.factory.indexing.CodeIndexer;
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
    private final TaskExecutor executor;

    public ImportService(ImportJobRepository jobs, WorkspaceRepository workspaces, WorkspaceService workspaceService,
                         SvnClient svnClient, CodeIndexer indexer, CodeIndexRepository index, StorageProperties storage,
                         @Qualifier("importExecutor") TaskExecutor executor) {
        this.jobs = jobs;
        this.workspaces = workspaces;
        this.workspaceService = workspaceService;
        this.svnClient = svnClient;
        this.indexer = indexer;
        this.index = index;
        this.storage = storage;
        this.executor = executor;
    }

    public synchronized ImportJobResponse start(UUID workspaceId) {
        Workspace workspace = findWorkspace(workspaceId);
        if (workspace.getSvnUrl() == null) {
            throw new BadRequestException("Set the workspace's SVN URL before importing code");
        }
        if (jobs.existsByWorkspaceIdAndStatusIn(workspaceId, EnumSet.of(ImportJob.Status.QUEUED, ImportJob.Status.RUNNING))) {
            throw new ConflictException("An import is already running for this workspace");
        }
        ImportJob job = jobs.save(new ImportJob(workspaceId, workspace.getIndexedRevision()));
        executor.execute(() -> run(job.getId()));
        return ImportJobResponse.from(job);
    }

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
    @Transactional
    public void failInterruptedJobs() {
        int count = jobs.failUnfinished("Interrupted because the server restarted. Start the import again.", OffsetDateTime.now());
        if (count > 0) {
            log.warn("Marked {} unfinished import job(s) as failed after restart", count);
        }
    }

    void run(UUID jobId) {
        ImportJob job = jobs.findById(jobId).orElseThrow();
        job.start();
        jobs.save(job);
        try {
            Workspace workspace = findWorkspace(job.getWorkspaceId());
            SvnCredentials credentials = workspaceService.credentials(workspace);
            Path workingCopy = storage.workingCopy(workspace.getId());

            long revision = checkoutOrUpdate(workspace.getSvnUrl(), workingCopy, credentials);
            job.setToRevision(revision);
            jobs.save(job);

            CodeIndexer.Progress progress = indexer.index(workspace.getId(), workingCopy, revision, p -> saveProgress(job, p));
            saveProgress(job, progress);

            Workspace latest = findWorkspace(workspace.getId());
            latest.setIndexedRevision(revision);
            workspaces.save(latest);

            String summary = "Indexed revision " + revision + ": " + progress.filesIndexed + " changed file(s), "
                    + progress.filesRemoved + " removed, " + progress.embeddingsCreated + " embedding(s) created.";
            job.succeed(progress.warning == null ? summary : summary + " " + progress.warning);
        } catch (Exception e) {
            log.error("Import job {} failed", jobId, e);
            job.fail(e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName());
        }
        jobs.save(job);
    }

    private long checkoutOrUpdate(String url, Path workingCopy, SvnCredentials credentials) throws IOException {
        if (Files.isDirectory(workingCopy.resolve(".svn"))) {
            String checkedOutUrl = svnClient.info(workingCopy.toString(), credentials).url();
            if (checkedOutUrl.equals(url.replaceAll("/+$", ""))) {
                return svnClient.update(workingCopy, credentials);
            }
            log.info("SVN URL changed from {} to {}; checking out again", checkedOutUrl, url);
        }
        FileSystemUtils.deleteRecursively(workingCopy);
        Files.createDirectories(workingCopy.getParent());
        return svnClient.checkout(url, workingCopy, credentials);
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
