package com.obdx.factory.indexing;

import org.springframework.stereotype.Component;

import java.util.List;

/**
 * Picks the chunking strategy for a file: structural for Java, line windows for everything else.
 */
@Component
public class Chunkers {

    private final LineWindowChunker lineWindows;
    private final JavaChunker java;

    public Chunkers(IndexingProperties properties) {
        this.lineWindows = new LineWindowChunker(properties.windowLines());
        this.java = new JavaChunker(lineWindows);
    }

    public List<Chunk> chunk(String path, String language, String content) {
        String fileName = path.substring(path.lastIndexOf('/') + 1);
        return "java".equals(language) ? java.chunk(fileName, content) : lineWindows.chunk(fileName, content, 1);
    }
}
