package com.obdx.factory.requirements;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

public interface RequirementRepository extends JpaRepository<Requirement, UUID> {

    List<Requirement> findByWorkspaceIdOrderByCreatedAtDesc(UUID workspaceId);

    /** A spec being updated with answers when the server stopped: the spec and answers stay, ready to update again. */
    @Modifying
    @Query("UPDATE Requirement r SET r.status = com.obdx.factory.requirements.Requirement.Status.READY, "
            + "r.message = :message, r.updatedAt = :now "
            + "WHERE r.status = com.obdx.factory.requirements.Requirement.Status.PROCESSING AND r.currentVersion > 0")
    int readyAgain(String message, OffsetDateTime now);

    @Modifying
    @Query("UPDATE Requirement r SET r.status = com.obdx.factory.requirements.Requirement.Status.FAILED, "
            + "r.message = :message, r.updatedAt = :now "
            + "WHERE r.status = com.obdx.factory.requirements.Requirement.Status.PROCESSING")
    int failProcessing(String message, OffsetDateTime now);
}
