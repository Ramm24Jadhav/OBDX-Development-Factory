package com.obdx.factory.workspace;

import java.time.OffsetDateTime;
import java.util.UUID;

public record WorkspaceResponse(
        UUID id,
        String name,
        String bankName,
        String obdxVersion,
        String svnUrl,
        String svnUsername,
        boolean svnPasswordSet,
        Long indexedRevision,
        String target,
        String appFolder,
        OffsetDateTime createdAt) {

    public static WorkspaceResponse from(Workspace workspace) {
        return new WorkspaceResponse(
                workspace.getId(),
                workspace.getName(),
                workspace.getBankName(),
                workspace.getObdxVersion(),
                workspace.getSvnUrl(),
                workspace.getSvnUsername(),
                workspace.getSvnPasswordEncrypted() != null,
                workspace.getIndexedRevision(),
                workspace.getTarget(),
                workspace.getAppFolder(),
                workspace.getCreatedAt());
    }
}
