package com.obdx.factory.svn;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;

/**
 * Creates a local SVN repository (file:// URL) for tests, using the svnadmin and svn command-line tools.
 */
public final class TestSvnRepository {

    private final Path root;
    private final Path repository;

    private TestSvnRepository(Path root) {
        this.root = root;
        this.repository = root.resolve("repo");
    }

    public static boolean toolsAvailable() {
        try {
            return new ProcessBuilder("svnadmin", "--version", "--quiet").start().waitFor() == 0
                    && new ProcessBuilder("svn", "--version", "--quiet").start().waitFor() == 0;
        } catch (IOException | InterruptedException e) {
            return false;
        }
    }

    /** Creates a repository whose trunk contains the given files (path relative to trunk to content). */
    public static TestSvnRepository create(Path root, Map<String, String> trunkFiles) throws IOException {
        TestSvnRepository repo = new TestSvnRepository(root);
        Files.createDirectories(root);
        run(root, "svnadmin", "create", repo.repository.toString());
        Path source = root.resolve("import");
        writeFiles(source, trunkFiles);
        run(root, "svn", "import", "--quiet", "-m", "Initial import", source.toString(), repo.trunkUrl());
        return repo;
    }

    public String trunkUrl() {
        return repository.toUri().toString().replaceAll("/$", "") + "/trunk";
    }

    /** Commits changes to trunk: files to add or modify, and paths to delete. */
    public void commit(Map<String, String> changedFiles, List<String> deletedPaths) throws IOException {
        Path workingCopy = root.resolve("wc-" + System.nanoTime());
        run(root, "svn", "checkout", "--quiet", trunkUrl(), workingCopy.toString());
        writeFiles(workingCopy, changedFiles);
        for (String path : deletedPaths) {
            run(workingCopy, "svn", "delete", "--quiet", path);
        }
        run(workingCopy, "svn", "add", "--quiet", "--force", ".");
        run(workingCopy, "svn", "commit", "--quiet", "-m", "Change");
    }

    /** Merges a branch into trunk as TortoiseSVN's "merge a range of revisions" would (recording svn:mergeinfo). */
    public void mergeIntoTrunk(String branchUrl) throws IOException {
        Path workingCopy = root.resolve("wc-merge-" + System.nanoTime());
        run(root, "svn", "checkout", "--quiet", trunkUrl(), workingCopy.toString());
        run(workingCopy, "svn", "merge", "--quiet", branchUrl, ".");
        run(workingCopy, "svn", "commit", "--quiet", "-m", "Merge " + branchUrl);
    }

    private static void writeFiles(Path base, Map<String, String> files) throws IOException {
        for (Map.Entry<String, String> file : files.entrySet()) {
            Path path = base.resolve(file.getKey());
            Files.createDirectories(path.getParent());
            Files.writeString(path, file.getValue());
        }
    }

    private static void run(Path directory, String... command) throws IOException {
        List<String> args = new ArrayList<>(List.of(command));
        Process process = new ProcessBuilder(args).directory(directory.toFile()).redirectErrorStream(true).start();
        try {
            String output = new String(process.getInputStream().readAllBytes());
            if (!process.waitFor(60, TimeUnit.SECONDS) || process.exitValue() != 0) {
                throw new IOException(String.join(" ", args) + " failed: " + output);
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IOException(e);
        }
    }
}
