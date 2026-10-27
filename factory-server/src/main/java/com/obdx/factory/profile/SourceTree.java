package com.obdx.factory.profile;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.nio.file.FileVisitResult;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.SimpleFileVisitor;
import java.nio.file.attribute.BasicFileAttributes;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.function.Predicate;

/**
 * The files of a working copy, for detectors to look through. Paths are relative and use forward slashes.
 * Contents are read on demand, so a detector only reads the files it needs.
 */
public class SourceTree {

    private final Path root;
    private final List<String> paths;
    private final long maxReadBytes;

    private SourceTree(Path root, List<String> paths, long maxReadBytes) {
        this.root = root;
        this.paths = paths;
        this.maxReadBytes = maxReadBytes;
    }

    public static SourceTree scan(Path root, Collection<String> excludedDirs, long maxReadBytes) throws IOException {
        Set<String> excluded = Set.copyOf(excludedDirs);
        List<String> paths = new ArrayList<>();
        Files.walkFileTree(root, new SimpleFileVisitor<>() {
            @Override
            public FileVisitResult preVisitDirectory(Path dir, BasicFileAttributes attrs) {
                return !dir.equals(root) && excluded.contains(dir.getFileName().toString())
                        ? FileVisitResult.SKIP_SUBTREE : FileVisitResult.CONTINUE;
            }

            @Override
            public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) {
                if (attrs.isRegularFile()) {
                    paths.add(root.relativize(file).toString().replace('\\', '/'));
                }
                return FileVisitResult.CONTINUE;
            }
        });
        paths.sort(null);
        return new SourceTree(root, List.copyOf(paths), maxReadBytes);
    }

    public List<String> paths() {
        return paths;
    }

    public List<String> paths(Predicate<String> filter) {
        return paths.stream().filter(filter).toList();
    }

    /** Files with one of the extensions (without dot, case-insensitive). */
    public List<String> withExtension(String... extensions) {
        return paths(path -> {
            String lower = path.toLowerCase(Locale.ROOT);
            for (String extension : extensions) {
                if (lower.endsWith("." + extension)) {
                    return true;
                }
            }
            return false;
        });
    }

    /** Files with exactly this file name, in any folder. */
    public List<String> named(String fileName) {
        return paths(path -> path.equals(fileName) || path.endsWith("/" + fileName));
    }

    /** File content as text, or "" for files that are too large or unreadable. */
    public String read(String path) {
        Path file = root.resolve(path);
        try {
            if (Files.size(file) > maxReadBytes) {
                return "";
            }
            byte[] bytes = Files.readAllBytes(file);
            try {
                return StandardCharsets.UTF_8.newDecoder()
                        .onMalformedInput(CodingErrorAction.REPORT)
                        .onUnmappableCharacter(CodingErrorAction.REPORT)
                        .decode(java.nio.ByteBuffer.wrap(bytes)).toString();
            } catch (CharacterCodingException e) {
                return new String(bytes, StandardCharsets.ISO_8859_1);
            }
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }
}
