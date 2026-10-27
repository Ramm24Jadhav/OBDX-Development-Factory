package com.obdx.factory.workspace;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * One bank's OBDX codebase and settings. The unit of isolation: code, documents and indexes never cross workspaces.
 */
@Entity
@Table(name = "workspace")
public class Workspace {

    @Id
    private UUID id;

    @Column(nullable = false, unique = true, length = 100)
    private String name;

    @Column(name = "bank_name", nullable = false, length = 200)
    private String bankName;

    @Column(name = "obdx_version", nullable = false, length = 20)
    private String obdxVersion;

    @Column(name = "svn_url", length = 1000)
    private String svnUrl;

    @Column(name = "svn_username", length = 200)
    private String svnUsername;

    @Column(name = "svn_password_encrypted")
    private String svnPasswordEncrypted;

    @Column(name = "indexed_revision")
    private Long indexedRevision;

    @Column(name = "created_at", nullable = false)
    private OffsetDateTime createdAt;

    protected Workspace() {
        // for JPA
    }

    public Workspace(String name, String bankName, String obdxVersion, String svnUrl) {
        this.id = UUID.randomUUID();
        this.name = name;
        this.bankName = bankName;
        this.obdxVersion = obdxVersion;
        this.svnUrl = svnUrl;
        this.createdAt = OffsetDateTime.now();
    }

    public UUID getId() {
        return id;
    }

    public String getName() {
        return name;
    }

    public String getBankName() {
        return bankName;
    }

    public String getObdxVersion() {
        return obdxVersion;
    }

    public String getSvnUrl() {
        return svnUrl;
    }

    public OffsetDateTime getCreatedAt() {
        return createdAt;
    }

    public String getSvnUsername() {
        return svnUsername;
    }

    public String getSvnPasswordEncrypted() {
        return svnPasswordEncrypted;
    }

    public Long getIndexedRevision() {
        return indexedRevision;
    }

    public void setSvnUrl(String svnUrl) {
        this.svnUrl = svnUrl;
    }

    public void setSvnUsername(String svnUsername) {
        this.svnUsername = svnUsername;
    }

    public void setSvnPasswordEncrypted(String svnPasswordEncrypted) {
        this.svnPasswordEncrypted = svnPasswordEncrypted;
    }

    public void setIndexedRevision(Long indexedRevision) {
        this.indexedRevision = indexedRevision;
    }
}
