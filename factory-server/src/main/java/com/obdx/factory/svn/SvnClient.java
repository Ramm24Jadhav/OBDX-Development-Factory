package com.obdx.factory.svn;

import org.springframework.stereotype.Component;
import org.w3c.dom.Document;
import org.xml.sax.InputSource;

import javax.xml.XMLConstants;
import javax.xml.parsers.DocumentBuilderFactory;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.StringReader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;

/**
 * Runs the Apache Subversion command-line client. Passwords are passed on stdin, never on the command line,
 * and are not cached on disk.
 */
@Component
public class SvnClient {

    private final SvnProperties properties;

    public SvnClient(SvnProperties properties) {
        this.properties = properties;
    }

    public record SvnInfo(String url, String repositoryRoot, long revision) {
    }

    /** Reads repository information for a URL or working copy, which also checks the connection and credentials. */
    public SvnInfo info(String target, SvnCredentials credentials) {
        String xml = run(List.of("info", "--xml", target), credentials, null, properties.commandTimeout());
        Document doc = parseXml(xml);
        String revision = doc.getElementsByTagName("entry").item(0).getAttributes().getNamedItem("revision").getNodeValue();
        String url = doc.getElementsByTagName("url").item(0).getTextContent();
        String root = doc.getElementsByTagName("root").item(0).getTextContent();
        return new SvnInfo(url, root, Long.parseLong(revision));
    }

    /** Checks out the URL at HEAD into the directory and returns the revision checked out. */
    public long checkout(String url, Path directory, SvnCredentials credentials) {
        run(List.of("checkout", "--quiet", "--ignore-externals", url, directory.toString()), credentials, null, properties.checkoutTimeout());
        return info(directory.toString(), credentials).revision();
    }

    /** Updates an existing working copy to HEAD and returns the new revision. */
    public long update(Path directory, SvnCredentials credentials) {
        run(List.of("update", "--quiet", "--ignore-externals"), credentials, directory, properties.checkoutTimeout());
        return info(directory.toString(), credentials).revision();
    }

    /** True if the URL exists in the repository. */
    public boolean exists(String url, SvnCredentials credentials) {
        try {
            run(List.of("info", "--xml", url), credentials, null, properties.commandTimeout());
            return true;
        } catch (SvnException e) {
            if (e.getMessage().contains("E170000") || e.getMessage().contains("E200009") || e.getMessage().contains("non-existent")) {
                return false;
            }
            throw e;
        }
    }

    /**
     * The revisions of source that Subversion's merge tracking reports for target: "eligible" (not merged yet) or
     * "merged", as with TortoiseSVN's merge dialog. Merges recorded with svn:mergeinfo count; hand-copied changes do not.
     */
    public List<Long> mergeinfo(String kind, String source, String target, SvnCredentials credentials) {
        if (!kind.equals("eligible") && !kind.equals("merged")) {
            throw new IllegalArgumentException("kind must be eligible or merged");
        }
        String output = run(List.of("mergeinfo", "--show-revs", kind, source, target), credentials, null, properties.commandTimeout());
        List<Long> revisions = new ArrayList<>();
        java.util.regex.Matcher matcher = java.util.regex.Pattern.compile("(?m)^r(\\d+)").matcher(output);
        while (matcher.find()) {
            revisions.add(Long.parseLong(matcher.group(1)));
        }
        return revisions;
    }

    /**
     * Runs several repository operations as one commit with svnmucc (part of Subversion), for example copying trunk
     * to a branch and putting changed files into it. Operation URLs are relative to rootUrl. Returns the new revision.
     */
    public long multiCommit(String rootUrl, String message, List<String> operations, SvnCredentials credentials) {
        List<String> args = new ArrayList<>(List.of("--root-url", rootUrl, "--message", message));
        args.addAll(operations);
        String output = run(mucc(), args, credentials, null, properties.checkoutTimeout());
        java.util.regex.Matcher matcher = java.util.regex.Pattern.compile("r(\\d+) committed").matcher(output);
        if (!matcher.find()) {
            throw new SvnException("svnmucc did not report a new revision: " + output.trim());
        }
        return Long.parseLong(matcher.group(1));
    }

    /** Paths of the files and folders below the URL or working copy (folders end with "/"), at most limit of them. */
    public List<String> list(String target, SvnCredentials credentials, int limit) {
        return run(List.of("list", "--recursive", target), credentials, null, properties.commandTimeout())
                .lines().map(String::strip).filter(line -> !line.isEmpty()).limit(limit).toList();
    }

    /** The content of one file in the repository. */
    public String cat(String url, SvnCredentials credentials) {
        return run(List.of("cat", url), credentials, null, properties.commandTimeout());
    }

    /**
     * Creates a repository in the (new) directory with the usual layout and the folder's files as trunk, as
     * create-demo-svn does. Returns the trunk URL.
     */
    public String createRepository(Path directory, Path folder, String message) {
        run(tool("svnadmin"), List.of("create", directory.toString()), SvnCredentials.NONE, null, properties.commandTimeout(), false);
        String root = directory.toAbsolutePath().toUri().toString().replaceAll("/+$", "");
        run(List.of("mkdir", "--parents", "--message", "Repository layout", root + "/branches/factory", root + "/tags"),
                SvnCredentials.NONE, null, properties.commandTimeout());
        run(List.of("import", "--message", message, folder.toString(), root + "/trunk"), SvnCredentials.NONE, null, properties.checkoutTimeout());
        return root + "/trunk";
    }

    /** svnmucc lives next to svn. */
    private String mucc() {
        return tool("svnmucc");
    }

    /** Another Subversion tool (svnmucc, svnadmin) from the same folder as svn. */
    private String tool(String name) {
        String svn = properties.command();
        return svn.endsWith("svn") ? svn.substring(0, svn.length() - 3) + name : name;
    }

    private String run(List<String> args, SvnCredentials credentials, Path workingDirectory, Duration timeout) {
        return run(properties.command(), args, credentials, workingDirectory, timeout);
    }

    private String run(String executable, List<String> args, SvnCredentials credentials, Path workingDirectory, Duration timeout) {
        return run(executable, args, credentials, workingDirectory, timeout, true);
    }

    /** @param clientOptions add the options of svn and svnmucc (svnadmin has none of them) */
    private String run(String executable, List<String> args, SvnCredentials credentials, Path workingDirectory, Duration timeout,
                       boolean clientOptions) {
        List<String> command = new ArrayList<>();
        command.add(executable);
        command.addAll(args);
        if (clientOptions) {
            command.add("--non-interactive");
            command.add("--no-auth-cache");
        }
        if (clientOptions && properties.trustUnknownCa()) {
            command.add("--trust-server-cert-failures=unknown-ca");
        }
        boolean sendPassword = credentials.present() && credentials.password() != null;
        if (credentials.present()) {
            command.add("--username");
            command.add(credentials.username());
        }
        if (sendPassword) {
            command.add("--password-from-stdin");
        }

        ProcessBuilder builder = new ProcessBuilder(command);
        if (workingDirectory != null) {
            builder.directory(workingDirectory.toFile());
        }
        builder.environment().put("LC_ALL", "C");

        Process process;
        try {
            process = builder.start();
        } catch (IOException e) {
            throw new SvnException("Could not run '" + executable
                    + "'. Is the Subversion command-line client installed on the factory server?", e);
        }
        try (OutputStream stdin = process.getOutputStream()) {
            if (sendPassword) {
                stdin.write(credentials.password().getBytes(StandardCharsets.UTF_8));
            }
        } catch (IOException e) {
            process.destroyForcibly();
            throw new SvnException("Could not send credentials to svn", e);
        }

        String label = executable.endsWith("svn") ? "svn " + args.get(0) : Path.of(executable).getFileName() + " " + args.get(0);
        CompletableFuture<String> stdout = readAsync(process.getInputStream());
        CompletableFuture<String> stderr = readAsync(process.getErrorStream());
        try {
            if (!process.waitFor(timeout.toMillis(), TimeUnit.MILLISECONDS)) {
                process.destroyForcibly();
                throw new SvnException(label + " did not finish within " + timeout);
            }
            if (process.exitValue() != 0) {
                throw new SvnException(label + " failed: " + summarize(stderr.join()));
            }
            return stdout.join();
        } catch (InterruptedException e) {
            process.destroyForcibly();
            Thread.currentThread().interrupt();
            throw new SvnException(label + " was interrupted", e);
        }
    }

    private static CompletableFuture<String> readAsync(InputStream stream) {
        return CompletableFuture.supplyAsync(() -> {
            try (stream) {
                return new String(stream.readAllBytes(), StandardCharsets.UTF_8);
            } catch (IOException e) {
                return "";
            }
        });
    }

    /** Keeps the meaningful "svn: E....." lines of svn's error output. */
    private static String summarize(String stderr) {
        List<String> lines = stderr.lines().map(String::trim).filter(line -> line.startsWith("svn: E")).toList();
        String text = lines.isEmpty() ? stderr.trim() : String.join(" ", lines);
        return text.length() > 1000 ? text.substring(0, 1000) + "..." : text;
    }

    private static Document parseXml(String xml) {
        try {
            DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
            factory.setFeature(XMLConstants.FEATURE_SECURE_PROCESSING, true);
            factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
            return factory.newDocumentBuilder().parse(new InputSource(new StringReader(xml)));
        } catch (Exception e) {
            throw new SvnException("Could not read svn output", e);
        }
    }
}
