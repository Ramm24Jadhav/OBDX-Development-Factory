package com.obdx.factory.workspace;

import java.time.OffsetDateTime;
import java.util.UUID;

public record WorkspaceResponse(
        UUID id,
        String name,
        String bankName,
        String obdxVersion,
        String svnUrl,
        OffsetDateTime createdAt) {

    static WorkspaceResponse from(Workspace workspace) {
        return new WorkspaceResponse(
                workspace.getId(),
                workspace.getName(),
                workspace.getBankName(),
                workspace.getObdxVersion(),
                workspace.getSvnUrl(),
                workspace.getCreatedAt());
    }
}
