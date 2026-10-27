package com.obdx.factory.design;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * A screen being designed, with its review state. The Screen Model itself is stored in versions.
 */
@Entity
@Table(name = "screen_design")
public class ScreenDesign {

    /** DRAFT: being designed. IN_REVIEW: a review link is out. APPROVED: locked for development. */
    public enum Status { DRAFT, IN_REVIEW, APPROVED }

    @Id
    private UUID id;

    @Column(name = "workspace_id", nullable = false)
    private UUID workspaceId;

    @Column(name = "requirement_id")
    private UUID requirementId;

    @Column(nullable = false, length = 300)
    private String name;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Status status;

    @Column(name = "current_version", nullable = false)
    private int currentVersion;

    @Column(name = "review_token", length = 64)
    private String reviewToken;

    @Column(name = "review_expires_at")
    private OffsetDateTime reviewExpiresAt;

    @Column(name = "approved_version")
    private Integer approvedVersion;

    @Column(name = "approved_by", length = 200)
    private String approvedBy;

    @Column(name = "approved_at")
    private OffsetDateTime approvedAt;

    @Column(name = "created_at", nullable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;

    protected ScreenDesign() {
        // for JPA
    }

    public ScreenDesign(UUID workspaceId, UUID requirementId, String name) {
        this.id = UUID.randomUUID();
        this.workspaceId = workspaceId;
        this.requirementId = requirementId;
        this.name = name;
        this.status = Status.DRAFT;
        this.createdAt = OffsetDateTime.now();
        this.updatedAt = createdAt;
    }

    void newVersion(int version, String name) {
        this.currentVersion = version;
        this.name = name;
        this.updatedAt = OffsetDateTime.now();
    }

    void openReview(String token, OffsetDateTime expiresAt) {
        this.reviewToken = token;
        this.reviewExpiresAt = expiresAt;
        this.status = Status.IN_REVIEW;
        this.updatedAt = OffsetDateTime.now();
    }

    void closeReview() {
        this.reviewToken = null;
        this.reviewExpiresAt = null;
        if (status == Status.IN_REVIEW) {
            status = Status.DRAFT;
        }
        this.updatedAt = OffsetDateTime.now();
    }

    void approve(String by) {
        status = Status.APPROVED;
        approvedVersion = currentVersion;
        approvedBy = by;
        approvedAt = OffsetDateTime.now();
        reviewToken = null;
        reviewExpiresAt = null;
        updatedAt = approvedAt;
    }

    void reopen() {
        status = Status.DRAFT;
        approvedVersion = null;
        approvedBy = null;
        approvedAt = null;
        updatedAt = OffsetDateTime.now();
    }

    public UUID getId() {
        return id;
    }

    public UUID getWorkspaceId() {
        return workspaceId;
    }

    public UUID getRequirementId() {
        return requirementId;
    }

    public String getName() {
        return name;
    }

    public Status getStatus() {
        return status;
    }

    public int getCurrentVersion() {
        return currentVersion;
    }

    public String getReviewToken() {
        return reviewToken;
    }

    public OffsetDateTime getReviewExpiresAt() {
        return reviewExpiresAt;
    }

    public Integer getApprovedVersion() {
        return approvedVersion;
    }

    public String getApprovedBy() {
        return approvedBy;
    }

    public OffsetDateTime getApprovedAt() {
        return approvedAt;
    }

    public OffsetDateTime getCreatedAt() {
        return createdAt;
    }

    public OffsetDateTime getUpdatedAt() {
        return updatedAt;
    }
}
