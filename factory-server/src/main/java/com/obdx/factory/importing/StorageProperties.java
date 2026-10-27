package com.obdx.factory.importing;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

import java.nio.file.Path;
import java.util.UUID;

/**
 * @param root folder where the factory keeps its files, such as each workspace's SVN working copy
 */
@ConfigurationProperties(prefix = "factory.storage")
public record StorageProperties(@DefaultValue("data") Path root) {

    public Path workingCopy(UUID workspaceId) {
        return root.resolve("workspaces").resolve(workspaceId.toString()).resolve("checkout").toAbsolutePath();
    }
}
