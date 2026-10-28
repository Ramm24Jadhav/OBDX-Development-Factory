package com.obdx.factory.source;

import com.obdx.factory.common.BadRequestException;
import com.obdx.factory.importing.StorageProperties;
import com.obdx.factory.svn.SvnClient;
import com.obdx.factory.svn.SvnCredentials;
import com.obdx.factory.svn.SvnException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.File;
import java.io.IOException;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.nio.file.FileVisitResult;
import java.nio.file.Files;
import java.nio.file.InvalidPathException;
import java.nio.file.Path;
import java.nio.file.SimpleFileVisitor;
import java.nio.file.attribute.BasicFileAttributes;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.stream.Stream;

/**
 * Where a new workspace's code comes from: an SVN URL, or a folder on the computer the factory runs on (a TortoiseSVN
 * working copy, an SVN repository, or a plain folder that becomes a local SVN repository). Each is inspected first:
 * the factory checks it can read it and suggests the workspace name, bank and OBDX version from the code.
 * <p>
 * Folders on this computer are offered only when local folders are enabled (by default with the trial database),
 * because they are the factory server's folders, not the browser's.
 */
@Service
public class SourceService {

    private static final Logger log = LoggerFactory.getLogger(SourceService.class);
    private static final int MAX_PATHS = 20000;
    private static final int MAX_READ_BYTES = 256 * 1024;
    private static final Set<String> SKIPPED_FOLDERS = Set.of(".svn", ".git", "node_modules", "target", "bower_components", ".idea");

    public enum Kind {
        /** An SVN URL (server or file://) */
        SVN_URL,
        /** A checkout made with TortoiseSVN or svn; its URL is used */
        WORKING_COPY,
        /** An SVN repository folder (as made by svnadmin or create-demo-svn) */
        REPOSITORY,
        /** A folder that is not under SVN; it can be made into a local SVN repository */
        FOLDER
    }

    public record Inspection(Kind kind, String svnUrl, Long revision, String path, String message, CodeDetector.Suggestion suggestion) {
    }

    public record LocalFolder(String name, String path, Kind kind) {
    }

    public record FolderListing(String path, String parent, List<LocalFolder> folders) {
    }

    public record LocalOverview(boolean enabled, String home, List<LocalFolder> roots, List<LocalFolder> found) {
    }

    private final SvnClient svn;
    private final boolean localEnabled;
    private final Path demoFolder;
    private final Path localRepositories;

    public SourceService(SvnClient svn, StorageProperties storage,
                         @Value("${factory.local-folders.enabled}") boolean localEnabled,
                         @Value("${factory.trial-database.demo-svn}") Path demoFolder) {
        this.svn = svn;
        this.localEnabled = localEnabled;
        this.demoFolder = demoFolder;
        this.localRepositories = storage.root().resolve("local-repositories");
    }

    /** Checks an SVN URL with the credentials and suggests the workspace's details from its files. */
    public Inspection inspectUrl(String url, SvnCredentials credentials) {
        if (url == null || !url.strip().matches("(svn|svn\\+ssh|https?|file)://.+")) {
            throw new BadRequestException("Enter an svn://, http://, https:// or file:// URL");
        }
        String target = url.strip().replaceAll("/+$", "");
        SvnClient.SvnInfo info = svn.info(target, credentials);
        CodeDetector.Suggestion suggestion = detectInRepository(info.url(), credentials, urlNames(info.url()));
        return new Inspection(Kind.SVN_URL, info.url(), info.revision(), null,
                "Connected: revision " + info.revision() + " of " + info.repositoryRoot(), suggestion);
    }

    /** Works out what a folder on this computer is, its SVN URL, and the workspace's details. */
    public Inspection inspectFolder(String pathText) {
        Path folder = existingFolder(pathText);
        List<String> names = folderNames(folder);
        if (isRepository(folder)) {
            String root = fileUrl(folder);
            String url = svn.exists(root + "/trunk", SvnCredentials.NONE) ? root + "/trunk" : root;
            SvnClient.SvnInfo info = svn.info(url, SvnCredentials.NONE);
            return new Inspection(Kind.REPOSITORY, url, info.revision(), folder.toString(),
                    "An SVN repository folder; the factory imports " + (url.endsWith("/trunk") ? "its trunk" : "it"),
                    detectInRepository(url, SvnCredentials.NONE, names));
        }
        if (isWorkingCopy(folder)) {
            SvnClient.SvnInfo info;
            try {
                info = svn.info(folder.toString(), SvnCredentials.NONE);
            } catch (SvnException e) {
                throw new BadRequestException("This folder looks like an SVN checkout, but svn could not read it: " + e.getMessage());
            }
            return new Inspection(Kind.WORKING_COPY, info.url(), info.revision(), folder.toString(),
                    "An SVN checkout of " + info.url() + ". The factory imports from that URL, so it sees what is committed, not "
                            + "changes that are only in this folder. It signs in with the login TortoiseSVN saved on this computer; if "
                            + "the server needs another, choose SVN server (URL) and enter it there.",
                    detectInFolder(folder, names));
        }
        return new Inspection(Kind.FOLDER, null, null, folder.toString(),
                "This folder is not under SVN. The factory can copy it into a new SVN repository on this computer, so that "
                        + "its changes can be delivered as branches.", detectInFolder(folder, names));
    }

    /** Creates an SVN repository from a plain folder (trunk with the folder's files) and returns its inspection. */
    public Inspection createRepository(String pathText, String name) {
        Path folder = existingFolder(pathText);
        if (isRepository(folder) || isWorkingCopy(folder)) {
            throw new BadRequestException("This folder is already under SVN");
        }
        String slug = (name == null ? folder.getFileName().toString() : name).toLowerCase(Locale.ROOT)
                .replaceAll("[^a-z0-9]+", "-").replaceAll("^-|-$", "");
        if (slug.isEmpty()) {
            throw new BadRequestException("Give the repository a name");
        }
        Path repository = localRepositories.resolve(slug).toAbsolutePath();
        if (Files.exists(repository)) {
            throw new BadRequestException("A local repository named " + slug + " already exists: " + repository);
        }
        try {
            Files.createDirectories(localRepositories);
        } catch (IOException e) {
            throw new BadRequestException("Could not create " + localRepositories.toAbsolutePath() + ": " + e.getMessage());
        }
        String url = svn.createRepository(repository, folder, "Code from " + folder);
        log.info("Created local SVN repository {} from {}", repository, folder);
        SvnClient.SvnInfo info = svn.info(url, SvnCredentials.NONE);
        return new Inspection(Kind.REPOSITORY, url, info.revision(), repository.toString(),
                "Copied into a new SVN repository: " + repository, detectInFolder(folder, folderNames(folder)));
    }

    /** Whether local folders can be used, where to start browsing, and SVN repositories found already. */
    public LocalOverview overview() {
        if (!localEnabled) {
            return new LocalOverview(false, null, List.of(), List.of());
        }
        List<LocalFolder> roots = new ArrayList<>();
        Path home = Path.of(System.getProperty("user.home"));
        roots.add(new LocalFolder("Home (" + home + ")", home.toString(), Kind.FOLDER));
        Path here = Path.of("").toAbsolutePath();
        roots.add(new LocalFolder("Factory folder (" + here + ")", here.toString(), Kind.FOLDER));
        for (File root : File.listRoots()) {
            roots.add(new LocalFolder(root.getPath(), root.getPath(), Kind.FOLDER));
        }
        List<LocalFolder> found = new ArrayList<>();
        for (Path parent : List.of(demoFolder, localRepositories)) {
            found.addAll(children(parent).stream().filter(f -> f.kind() == Kind.REPOSITORY).toList());
        }
        return new LocalOverview(true, home.toString(), roots, found);
    }

    /** The subfolders of a folder, each marked as SVN checkout, SVN repository or plain folder. */
    public FolderListing folders(String pathText) {
        Path folder = existingFolder(pathText);
        Path parent = folder.getParent();
        return new FolderListing(folder.toString(), parent == null ? null : parent.toString(), children(folder));
    }

    private List<LocalFolder> children(Path folder) {
        if (!Files.isDirectory(folder)) {
            return List.of();
        }
        try (Stream<Path> list = Files.list(folder)) {
            return list.filter(Files::isDirectory)
                    .filter(p -> !p.getFileName().toString().startsWith("."))
                    .sorted(Comparator.comparing(p -> p.getFileName().toString().toLowerCase(Locale.ROOT)))
                    .limit(500)
                    .map(p -> new LocalFolder(p.getFileName().toString(), p.toAbsolutePath().toString(),
                            isRepository(p) ? Kind.REPOSITORY : Files.isDirectory(p.resolve(".svn")) ? Kind.WORKING_COPY : Kind.FOLDER))
                    .toList();
        } catch (IOException | SecurityException e) {
            throw new BadRequestException("Could not open " + folder + ": " + e.getMessage());
        }
    }

    private Path existingFolder(String pathText) {
        if (!localEnabled) {
            throw new BadRequestException("Folders on this computer are turned off on this factory (FACTORY_LOCAL_FOLDERS). Use an SVN URL.");
        }
        if (pathText == null || pathText.isBlank()) {
            throw new BadRequestException("Choose a folder");
        }
        Path folder;
        try {
            folder = Path.of(pathText.strip().replaceAll("^\"|\"$", "")).toAbsolutePath().normalize();
        } catch (InvalidPathException e) {
            throw new BadRequestException("Not a valid folder path: " + pathText);
        }
        if (!Files.isDirectory(folder)) {
            throw new BadRequestException("No folder " + folder + " on the computer the factory runs on");
        }
        return folder;
    }

    static boolean isRepository(Path folder) {
        return Files.isRegularFile(folder.resolve("format")) && Files.isDirectory(folder.resolve("db"))
                && Files.isDirectory(folder.resolve("hooks"));
    }

    /** A folder in a working copy: it or one of its parents has a .svn folder. */
    static boolean isWorkingCopy(Path folder) {
        for (Path p = folder; p != null; p = p.getParent()) {
            if (Files.isDirectory(p.resolve(".svn"))) {
                return true;
            }
        }
        return false;
    }

    private CodeDetector.Suggestion detectInRepository(String url, SvnCredentials credentials, List<String> names) {
        List<String> paths;
        try {
            paths = svn.list(url, credentials, MAX_PATHS);
        } catch (SvnException e) {
            log.info("Could not list {} for suggestions: {}", url, e.getMessage());
            return CodeDetector.detect(List.of(), p -> null, names);
        }
        return CodeDetector.detect(paths, path -> {
            try {
                String content = svn.cat(url + "/" + path, credentials);
                return content.length() > MAX_READ_BYTES ? content.substring(0, MAX_READ_BYTES) : content;
            } catch (SvnException e) {
                return null;
            }
        }, names);
    }

    private CodeDetector.Suggestion detectInFolder(Path folder, List<String> names) {
        List<String> paths = new ArrayList<>();
        try {
            Files.walkFileTree(folder, new SimpleFileVisitor<>() {
                @Override
                public FileVisitResult preVisitDirectory(Path dir, BasicFileAttributes attrs) {
                    return !dir.equals(folder) && SKIPPED_FOLDERS.contains(dir.getFileName().toString())
                            ? FileVisitResult.SKIP_SUBTREE : FileVisitResult.CONTINUE;
                }

                @Override
                public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) {
                    paths.add(folder.relativize(file).toString().replace('\\', '/'));
                    return paths.size() >= MAX_PATHS ? FileVisitResult.TERMINATE : FileVisitResult.CONTINUE;
                }

                @Override
                public FileVisitResult visitFileFailed(Path file, IOException e) {
                    return FileVisitResult.CONTINUE;
                }
            });
        } catch (IOException e) {
            log.info("Could not read {} for suggestions: {}", folder, e.getMessage());
        }
        return CodeDetector.detect(paths, path -> {
            try {
                byte[] bytes = Files.readAllBytes(folder.resolve(path));
                return new String(bytes, 0, Math.min(bytes.length, MAX_READ_BYTES), StandardCharsets.UTF_8);
            } catch (IOException e) {
                return null;
            }
        }, names);
    }

    /** The folder and its parents' names, most specific first, without generic ones such as trunk. */
    private static List<String> folderNames(Path folder) {
        Set<String> names = new LinkedHashSet<>();
        for (Path p = folder; p != null && p.getFileName() != null && names.size() < 4; p = p.getParent()) {
            names.add(p.getFileName().toString());
        }
        return new ArrayList<>(names);
    }

    /** The URL's path segments, most specific first (the host is left out). */
    private static List<String> urlNames(String url) {
        String path = URI.create(url.replace(" ", "%20")).getPath();
        List<String> segments = new ArrayList<>(Arrays.stream(path == null ? new String[0] : path.split("/"))
                .filter(s -> !s.isBlank()).toList());
        java.util.Collections.reverse(segments);
        return segments.stream().limit(5).toList();
    }

    private static String fileUrl(Path folder) {
        return folder.toAbsolutePath().toUri().toString().replaceAll("/+$", "");
    }
}
