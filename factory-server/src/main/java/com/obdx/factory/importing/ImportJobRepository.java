package com.obdx.factory.importing;

import org.springframework.data.domain.Limit;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

import java.time.OffsetDateTime;
import java.util.Collection;
import java.util.List;
import java.util.UUID;

public interface ImportJobRepository extends JpaRepository<ImportJob, UUID> {

    List<ImportJob> findByWorkspaceIdOrderByCreatedAtDesc(UUID workspaceId, Limit limit);

    boolean existsByWorkspaceIdAndStatusIn(UUID workspaceId, Collection<ImportJob.Status> statuses);

    @Modifying
    @Query("UPDATE ImportJob j SET j.status = com.obdx.factory.importing.ImportJob.Status.FAILED, j.message = :message, "
            + "j.finishedAt = :now WHERE j.status IN (com.obdx.factory.importing.ImportJob.Status.QUEUED, "
            + "com.obdx.factory.importing.ImportJob.Status.RUNNING)")
    int failUnfinished(String message, OffsetDateTime now);
}
