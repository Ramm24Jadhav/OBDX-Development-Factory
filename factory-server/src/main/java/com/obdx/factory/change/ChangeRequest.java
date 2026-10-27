package com.obdx.factory.change;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * Turning one approved requirement into code.
 */
@Entity
@Table(name = "change_request")
public class ChangeRequest {

    /**
     * ANALYZING: impact analysis is running. PLAN_READY: the plan waits for review. GENERATING: files are written.
     * GENERATED: the code waits for review and delivery. DELIVERED: committed to an SVN branch.
     */
    public enum Status { ANALYZING, PLAN_READY, GENERATING, GENERATED, DELIVERED, FAILED }

    @Id
    private UUID id;

    @Column(name = "workspace_id", nullable = false)
    private UUID workspaceId;

    @Column(name = "requirement_id")
    private UUID requirementId;

    @Column(nullable = false, length = 300)
    private String title;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Status status;

    private String message;

    @Column(name = "base_revision")
    private Long baseRevision;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb")
    private String plan;

    @Column(name = "plan_approved_by", length = 200)
    private String planApprovedBy;

    @Column(name = "plan_approved_at")
    private OffsetDateTime planApprovedAt;

    @Column(name = "branch_url", length = 1000)
    private String branchUrl;

    @Column(name = "delivered_revision")
    private Long deliveredRevision;

    /** BUILDING, PASSED or FAILED; null before the first Jenkins build. */
    @Column(name = "build_status", length = 20)
    private String buildStatus;

    @Column(name = "build_message")
    private String buildMessage;

    @Column(name = "created_by", length = 200)
    private String createdBy;

    @Column(name = "created_at", nullable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;

    protected ChangeRequest() {
        // for JPA
    }

    public ChangeRequest(UUID workspaceId, UUID requirementId, String title, String createdBy) {
        this.id = UUID.randomUUID();
        this.workspaceId = workspaceId;
        this.requirementId = requirementId;
        this.title = title;
        this.createdBy = createdBy;
        this.status = Status.ANALYZING;
        this.createdAt = OffsetDateTime.now();
        this.updatedAt = createdAt;
    }

    void status(Status status, String message) {
        this.status = status;
        this.message = message;
        this.updatedAt = OffsetDateTime.now();
    }

    void plan(String planJson, Long baseRevision) {
        this.plan = planJson;
        this.baseRevision = baseRevision;
        this.planApprovedBy = null;
        this.planApprovedAt = null;
        this.updatedAt = OffsetDateTime.now();
    }

    void approvePlan(String by) {
        this.planApprovedBy = by;
        this.planApprovedAt = OffsetDateTime.now();
        this.updatedAt = planApprovedAt;
    }

    void baseRevision(Long baseRevision) {
        this.baseRevision = baseRevision;
    }

    void delivered(String branchUrl, long revision) {
        this.branchUrl = branchUrl;
        this.deliveredRevision = revision;
        status(Status.DELIVERED, "Committed to " + branchUrl + " in revision " + revision + ".");
    }

    void build(String status, String message) {
        this.buildStatus = status;
        this.buildMessage = message;
        this.updatedAt = OffsetDateTime.now();
    }

    public String getBuildStatus() {
        return buildStatus;
    }

    public String getBuildMessage() {
        return buildMessage;
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

    public String getTitle() {
        return title;
    }

    public Status getStatus() {
        return status;
    }

    public String getMessage() {
        return message;
    }

    public Long getBaseRevision() {
        return baseRevision;
    }

    public String getPlan() {
        return plan;
    }

    public String getPlanApprovedBy() {
        return planApprovedBy;
    }

    public OffsetDateTime getPlanApprovedAt() {
        return planApprovedAt;
    }

    public String getBranchUrl() {
        return branchUrl;
    }

    public Long getDeliveredRevision() {
        return deliveredRevision;
    }

    public String getCreatedBy() {
        return createdBy;
    }

    public OffsetDateTime getCreatedAt() {
        return createdAt;
    }

    public OffsetDateTime getUpdatedAt() {
        return updatedAt;
    }
}
