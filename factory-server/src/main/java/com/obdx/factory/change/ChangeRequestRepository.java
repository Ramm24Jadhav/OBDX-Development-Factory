package com.obdx.factory.change;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

public interface ChangeRequestRepository extends JpaRepository<ChangeRequest, UUID> {

    List<ChangeRequest> findByWorkspaceIdOrderByCreatedAtDesc(UUID workspaceId);

    @Modifying
    @Query("UPDATE ChangeRequest c SET c.status = com.obdx.factory.change.ChangeRequest.Status.FAILED, c.message = :message, "
            + "c.updatedAt = :now WHERE c.status IN (com.obdx.factory.change.ChangeRequest.Status.ANALYZING, "
            + "com.obdx.factory.change.ChangeRequest.Status.GENERATING)")
    int failRunning(String message, OffsetDateTime now);
}
