package com.obdx.factory.requirements;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

public interface RequirementRepository extends JpaRepository<Requirement, UUID> {

    List<Requirement> findByWorkspaceIdOrderByCreatedAtDesc(UUID workspaceId);

    @Modifying
    @Query("UPDATE Requirement r SET r.status = com.obdx.factory.requirements.Requirement.Status.FAILED, "
            + "r.message = :message, r.updatedAt = :now "
            + "WHERE r.status = com.obdx.factory.requirements.Requirement.Status.PROCESSING")
    int failProcessing(String message, OffsetDateTime now);
}
