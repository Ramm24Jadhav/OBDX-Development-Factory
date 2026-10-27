package com.obdx.factory.indexing;

import java.util.ArrayList;
import java.util.List;

/**
 * Splits a file into windows of lines with a small overlap, so a match near a window edge still has context.
 * Small files stay one chunk.
 */
class LineWindowChunker {

    private final int windowLines;
    private final int overlapLines;

    LineWindowChunker(int windowLines) {
        this.windowLines = Math.max(10, windowLines);
        this.overlapLines = this.windowLines / 6;
    }

    List<Chunk> chunk(String symbol, String content, int firstLine) {
        String[] lines = content.split("\n", -1);
        int count = lines.length;
        while (count > 0 && lines[count - 1].isBlank()) {
            count--;
        }
        List<Chunk> chunks = new ArrayList<>();
        if (count == 0) {
            return chunks;
        }
        if (count <= windowLines + overlapLines) {
            chunks.add(new Chunk("file", symbol, firstLine, firstLine + count - 1, join(lines, 0, count)));
            return chunks;
        }
        int step = windowLines - overlapLines;
        for (int start = 0; start < count; start += step) {
            int end = Math.min(start + windowLines, count);
            chunks.add(new Chunk("lines", symbol, firstLine + start, firstLine + end - 1, join(lines, start, end)));
            if (end == count) {
                break;
            }
        }
        return chunks;
    }

    private static String join(String[] lines, int from, int to) {
        return String.join("\n", java.util.Arrays.copyOfRange(lines, from, to));
    }
}
