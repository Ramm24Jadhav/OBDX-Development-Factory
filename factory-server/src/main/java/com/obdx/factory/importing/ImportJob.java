package com.obdx.factory.importing;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * One run of "check out or update the workspace's code from SVN, then index it".
 */
@Entity
@Table(name = "import_job")
public class ImportJob {

    public enum Status { QUEUED, RUNNING, SUCCEEDED, FAILED }

    @Id
    private UUID id;

    @Column(name = "workspace_id", nullable = false)
    private UUID workspaceId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Status status;

    @Column(name = "from_revision")
    private Long fromRevision;

    @Column(name = "to_revision")
    private Long toRevision;

    @Column(name = "files_scanned", nullable = false)
    private int filesScanned;

    @Column(name = "files_indexed", nullable = false)
    private int filesIndexed;

    @Column(name = "files_removed", nullable = false)
    private int filesRemoved;

    @Column(name = "chunks_indexed", nullable = false)
    private int chunksIndexed;

    @Column(name = "embeddings_created", nullable = false)
    private int embeddingsCreated;

    private String message;

    @Column(name = "created_at", nullable = false)
    private OffsetDateTime createdAt;

    @Column(name = "started_at")
    private OffsetDateTime startedAt;

    @Column(name = "finished_at")
    private OffsetDateTime finishedAt;

    protected ImportJob() {
        // for JPA
    }

    public ImportJob(UUID workspaceId, Long fromRevision) {
        this.id = UUID.randomUUID();
        this.workspaceId = workspaceId;
        this.fromRevision = fromRevision;
        this.status = Status.QUEUED;
        this.createdAt = OffsetDateTime.now();
    }

    void start() {
        status = Status.RUNNING;
        startedAt = OffsetDateTime.now();
    }

    void succeed(String message) {
        status = Status.SUCCEEDED;
        this.message = message;
        finishedAt = OffsetDateTime.now();
    }

    void fail(String message) {
        status = Status.FAILED;
        this.message = message;
        finishedAt = OffsetDateTime.now();
    }

    void setToRevision(long toRevision) {
        this.toRevision = toRevision;
    }

    void setCounts(int filesScanned, int filesIndexed, int filesRemoved, int chunksIndexed, int embeddingsCreated) {
        this.filesScanned = filesScanned;
        this.filesIndexed = filesIndexed;
        this.filesRemoved = filesRemoved;
        this.chunksIndexed = chunksIndexed;
        this.embeddingsCreated = embeddingsCreated;
    }

    public UUID getId() {
        return id;
    }

    public UUID getWorkspaceId() {
        return workspaceId;
    }

    public Status getStatus() {
        return status;
    }

    public Long getFromRevision() {
        return fromRevision;
    }

    public Long getToRevision() {
        return toRevision;
    }

    public int getFilesScanned() {
        return filesScanned;
    }

    public int getFilesIndexed() {
        return filesIndexed;
    }

    public int getFilesRemoved() {
        return filesRemoved;
    }

    public int getChunksIndexed() {
        return chunksIndexed;
    }

    public int getEmbeddingsCreated() {
        return embeddingsCreated;
    }

    public String getMessage() {
        return message;
    }

    public OffsetDateTime getCreatedAt() {
        return createdAt;
    }

    public OffsetDateTime getStartedAt() {
        return startedAt;
    }

    public OffsetDateTime getFinishedAt() {
        return finishedAt;
    }
}
