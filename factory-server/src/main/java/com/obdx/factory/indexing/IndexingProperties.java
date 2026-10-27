package com.obdx.factory.indexing;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;
import org.springframework.util.unit.DataSize;

import java.util.List;

/**
 * @param excludeDirs        directory names never indexed (build output, dependencies, VCS metadata)
 * @param maxFileSize        larger files are skipped; they are usually generated or third-party
 * @param windowLines        lines per chunk for files that are not split by structure
 * @param embeddingsEnabled  create vector embeddings for semantic search (needs the embedding model)
 * @param embeddingBatchSize chunks sent to the embedding model per call
 */
@ConfigurationProperties(prefix = "factory.indexing")
public record IndexingProperties(
        @DefaultValue({".svn", ".git", "node_modules", "bower_components", "target", "build", "dist"})
        List<String> excludeDirs,
        @DefaultValue("512KB") DataSize maxFileSize,
        @DefaultValue("60") int windowLines,
        @DefaultValue("true") boolean embeddingsEnabled,
        @DefaultValue("16") int embeddingBatchSize) {
}
