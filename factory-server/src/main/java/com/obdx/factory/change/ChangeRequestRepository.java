package com.obdx.factory.change;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

public interface ChangeRequestRepository extends JpaRepository<ChangeRequest, UUID> {

    List<ChangeRequest> findByWorkspaceIdOrderByCreatedAtDesc(UUID workspaceId);

    /** Delivered changes whose branch has not been removed: candidates for the merge check. */
    List<ChangeRequest> findByStatusAndBranchUrlIsNotNullAndBranchDeletedRevisionIsNull(ChangeRequest.Status status);

    @Modifying
    @Query("UPDATE ChangeRequest c SET c.status = com.obdx.factory.change.ChangeRequest.Status.FAILED, c.message = :message, "
            + "c.updatedAt = :now WHERE c.status IN (com.obdx.factory.change.ChangeRequest.Status.ANALYZING, "
            + "com.obdx.factory.change.ChangeRequest.Status.GENERATING)")
    int failRunning(String message, OffsetDateTime now);

    @Modifying
    @Query("UPDATE ChangeRequest c SET c.buildStatus = 'FAILED', c.buildMessage = :message WHERE c.buildStatus = 'BUILDING'")
    int failBuilding(String message);
}
