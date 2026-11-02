package com.obdx.factory.design;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ScreenDesignRepository extends JpaRepository<ScreenDesign, UUID> {

    List<ScreenDesign> findByWorkspaceIdOrderByCreatedAt(UUID workspaceId);

    Optional<ScreenDesign> findByReviewToken(String reviewToken);

    boolean existsByRequirementId(UUID requirementId);

    List<ScreenDesign> findByRequirementIdOrderByCreatedAt(UUID requirementId);

    /** The same, in an order that never changes between calls (designs created at the same moment by their id). */
    List<ScreenDesign> findByRequirementIdOrderByCreatedAtAscIdAsc(UUID requirementId);
}
