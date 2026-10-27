package com.obdx.factory.importing;

import java.time.OffsetDateTime;
import java.util.UUID;

public record ImportJobResponse(
        UUID id,
        UUID workspaceId,
        ImportJob.Status status,
        Long fromRevision,
        Long toRevision,
        int filesScanned,
        int filesIndexed,
        int filesRemoved,
        int chunksIndexed,
        int embeddingsCreated,
        String message,
        OffsetDateTime createdAt,
        OffsetDateTime startedAt,
        OffsetDateTime finishedAt) {

    static ImportJobResponse from(ImportJob job) {
        return new ImportJobResponse(job.getId(), job.getWorkspaceId(), job.getStatus(), job.getFromRevision(),
                job.getToRevision(), job.getFilesScanned(), job.getFilesIndexed(), job.getFilesRemoved(),
                job.getChunksIndexed(), job.getEmbeddingsCreated(), job.getMessage(), job.getCreatedAt(),
                job.getStartedAt(), job.getFinishedAt());
    }
}
