package com.obdx.factory.requirements;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * A requirement document or pasted request, the text extracted from it, and where its spec is in review.
 */
@Entity
@Table(name = "requirement")
public class Requirement {

    /** PROCESSING: the model is drafting or updating the spec. READY: waiting for review. APPROVED: locked. */
    public enum Status { PROCESSING, READY, FAILED, APPROVED }

    @Id
    private UUID id;

    @Column(name = "workspace_id", nullable = false)
    private UUID workspaceId;

    @Column(nullable = false, length = 300)
    private String title;

    @Column(name = "file_name", length = 500)
    private String fileName;

    @Column(name = "size_bytes", nullable = false)
    private int sizeBytes;

    @Column(name = "document_text", nullable = false)
    private String documentText;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Status status;

    private String message;

    @Column(name = "current_version")
    private Integer currentVersion;

    @Column(name = "created_at", nullable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;

    @Column(name = "approved_at")
    private OffsetDateTime approvedAt;

    @Column(name = "approved_by", length = 200)
    private String approvedBy;

    protected Requirement() {
        // for JPA
    }

    public Requirement(UUID workspaceId, String title, String fileName, int sizeBytes, String documentText) {
        this.id = UUID.randomUUID();
        this.workspaceId = workspaceId;
        this.title = title;
        this.fileName = fileName;
        this.sizeBytes = sizeBytes;
        this.documentText = documentText;
        this.status = Status.PROCESSING;
        this.createdAt = OffsetDateTime.now();
        this.updatedAt = createdAt;
    }

    void processing(String message) {
        status = Status.PROCESSING;
        this.message = message;
        updatedAt = OffsetDateTime.now();
    }

    void ready(int version, String message) {
        status = Status.READY;
        currentVersion = version;
        this.message = message;
        updatedAt = OffsetDateTime.now();
    }

    void failed(String message) {
        status = Status.FAILED;
        this.message = message;
        updatedAt = OffsetDateTime.now();
    }

    void approve(String by) {
        status = Status.APPROVED;
        approvedBy = by;
        approvedAt = OffsetDateTime.now();
        updatedAt = approvedAt;
        message = null;
    }

    public UUID getId() {
        return id;
    }

    public UUID getWorkspaceId() {
        return workspaceId;
    }

    public String getTitle() {
        return title;
    }

    public String getFileName() {
        return fileName;
    }

    public int getSizeBytes() {
        return sizeBytes;
    }

    public String getDocumentText() {
        return documentText;
    }

    public Status getStatus() {
        return status;
    }

    public String getMessage() {
        return message;
    }

    public Integer getCurrentVersion() {
        return currentVersion;
    }

    public OffsetDateTime getCreatedAt() {
        return createdAt;
    }

    public OffsetDateTime getUpdatedAt() {
        return updatedAt;
    }

    public OffsetDateTime getApprovedAt() {
        return approvedAt;
    }

    public String getApprovedBy() {
        return approvedBy;
    }
}
