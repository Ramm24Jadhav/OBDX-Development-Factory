package com.obdx.factory.knowledge;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.ProxySelector;
import java.net.URI;
import java.net.URLDecoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Reads Oracle's public OBDX documentation: the documentation index lists the releases, each release's library page
 * lists its manuals (PDF). Only GET requests to Oracle's own documentation hosts, over HTTPS, without cookies: nothing of
 * the bank's leaves the factory. Downloads are conditional (the ETag Oracle sent last time), so a manual that has not
 * changed costs one small request.
 */
@Component
public class OracleLibrary {

    private static final Logger log = LoggerFactory.getLogger(OracleLibrary.class);
    private static final String AGENT = "OBDX-Development-Factory (documentation check)";
    private static final Pattern RELEASE = Pattern.compile(
            "Banking Digital Experience\\s+(\\d{2}\\.\\d+(?:\\.\\d+){0,3})(?![\\d.])", Pattern.CASE_INSENSITIVE);
    private static final Pattern ROW = Pattern.compile("<tr[^>]*>(.*?)</tr>", Pattern.DOTALL | Pattern.CASE_INSENSITIVE);
    private static final Pattern HREF = Pattern.compile("href\\s*=\\s*\"\\s*([^\"]+?)\\s*\"", Pattern.CASE_INSENSITIVE);
    private static final Pattern BOOK_DATA = Pattern.compile("<script[^>]*id=\"book-data\"[^>]*>(.*?)</script>", Pattern.DOTALL);
    private static final Pattern OLD_PDF = Pattern.compile("^(tech_docs|um_docs)(?:-(\\d{2}\\.\\d+(?:\\.\\d+)*))?/([^/]+\\.pdf)$", Pattern.CASE_INSENSITIVE);

    /** A release on the documentation index: 25.2.0.0.0 and its library page. */
    public record Release(String version, String libraryUrl) {
    }

    /**
     * A manual of a release: technical (installation, extensibility, security ...) or a user manual. release is the
     * patchset the file belongs to (22.2.6 for a 22.2 library's patchset folder), for keeping the newest one.
     */
    public record Manual(String title, String url, boolean technical, String release) {
    }

    /** The result of a conditional download: not modified, or the file in a temporary path with its markers. */
    public record Download(boolean changed, Path file, String etag, String lastModified) {
    }

    private final KnowledgeProperties.Oracle settings;
    private final ObjectMapper json;
    private final HttpClient http;

    public OracleLibrary(KnowledgeProperties properties, ObjectMapper json) {
        this.settings = properties.oracle();
        this.json = json;
        // Redirects are followed by hand, so every hop is checked against the allowed hosts
        this.http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(20)).followRedirects(HttpClient.Redirect.NEVER)
                .proxy(ProxySelector.getDefault()).build();
    }

    public boolean enabled() {
        return settings.enabled();
    }

    /** The OBDX releases on Oracle's documentation index, newest first. */
    public List<Release> releases() {
        return parseReleases(page(settings.indexUrl()), settings.indexUrl());
    }

    /** The manuals of a release, the newest patchset's file of each. */
    public List<Manual> manuals(Release release) {
        String home = page(release.libraryUrl());
        List<Manual> found = new ArrayList<>(parseOldLibrary(home, release));
        if (found.isEmpty()) {
            // The newer libraries list their books per page (user manuals, technical guides, security ...)
            found.addAll(parseBookData(home, release.version(), false, release.libraryUrl()));
            for (String sibling : libraryPages(home, release.libraryUrl())) {
                try {
                    found.addAll(parseBookData(page(sibling), release.version(), true, sibling));
                    pause();
                } catch (RuntimeException e) {
                    log.info("Oracle library page {} not read: {}", sibling, e.getMessage());
                }
            }
        }
        return newestOfEach(found);
    }

    /**
     * Downloads a manual unless it is unchanged since etag/lastModified. The file goes to a temporary path, at most
     * the configured size; the caller deletes it.
     */
    public Download download(String url, String etag, String lastModified) {
        URI uri = allowed(url);
        for (int hop = 0; hop < 5; hop++) {
            HttpRequest.Builder request = HttpRequest.newBuilder(uri).timeout(Duration.ofMinutes(10)).header("User-Agent", AGENT).GET();
            if (etag != null) {
                request.header("If-None-Match", etag);
            }
            if (lastModified != null) {
                request.header("If-Modified-Since", lastModified);
            }
            HttpResponse<InputStream> response = send(request.build(), HttpResponse.BodyHandlers.ofInputStream());
            int status = response.statusCode();
            if (status / 100 == 3 && status != 304) {
                close(response);
                uri = allowed(redirect(uri, response));
                continue;
            }
            if (status == 304) {
                close(response);
                return new Download(false, null, etag, lastModified);
            }
            if (status != 200) {
                close(response);
                throw new IllegalStateException("Oracle's site answered HTTP " + status + " for " + uri);
            }
            long limit = settings.maxFileSize().toBytes();
            long declared = response.headers().firstValueAsLong("Content-Length").orElse(-1);
            if (declared > limit) {
                close(response);
                throw new IllegalStateException("The file is larger than " + settings.maxFileSize().toMegabytes() + " MB");
            }
            Path file = null;
            try (InputStream in = response.body()) {
                file = Files.createTempFile("oracle-manual-", ".pdf");
                copy(in, file, limit);
                return new Download(true, file, response.headers().firstValue("ETag").orElse(null),
                        response.headers().firstValue("Last-Modified").orElse(null));
            } catch (IOException | RuntimeException e) {
                deleteQuietly(file);
                throw new IllegalStateException("The download stopped: " + e.getMessage(), e);
            }
        }
        throw new IllegalStateException("Too many redirects for " + url);
    }

    /** A short pause between requests, so the checks never load Oracle's site or the bank's connection. */
    public void pause() {
        try {
            Thread.sleep(settings.pause().toMillis());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    // --- reading pages ---

    private String page(String url) {
        URI uri = allowed(url);
        for (int hop = 0; hop < 5; hop++) {
            HttpRequest request = HttpRequest.newBuilder(uri).timeout(Duration.ofSeconds(60)).header("User-Agent", AGENT).GET().build();
            HttpResponse<String> response = send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            if (response.statusCode() / 100 == 3) {
                uri = allowed(redirect(uri, response));
                continue;
            }
            if (response.statusCode() != 200) {
                throw new IllegalStateException("Oracle's site answered HTTP " + response.statusCode() + " for " + uri);
            }
            if (response.body().length() > 5_000_000) {
                throw new IllegalStateException("The page " + uri + " is unexpectedly large");
            }
            return response.body();
        }
        throw new IllegalStateException("Too many redirects for " + url);
    }

    private <T> HttpResponse<T> send(HttpRequest request, HttpResponse.BodyHandler<T> handler) {
        try {
            return http.send(request, handler);
        } catch (IOException e) {
            throw new IllegalStateException("Oracle's documentation site cannot be reached (" + e.getMessage() + "). If the factory "
                    + "has no internet access, import the manuals from a folder instead.", e);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("Stopped", e);
        }
    }

    private static String redirect(URI from, HttpResponse<?> response) {
        String location = response.headers().firstValue("Location")
                .orElseThrow(() -> new IllegalStateException("A redirect without a location from " + from));
        return from.resolve(location.strip()).toString();
    }

    /**
     * Only HTTPS to Oracle's documentation hosts. Plain http links on Oracle's pages are taken over HTTPS, and links to
     * Oracle's staging copy (docs-stage) go to the published site.
     */
    URI allowed(String url) {
        URI uri;
        try {
            uri = URI.create(url.strip().replace(" ", "%20"));
        } catch (IllegalArgumentException e) {
            throw new IllegalStateException("Not a valid address: " + url);
        }
        String host = uri.getHost() == null ? "" : uri.getHost().toLowerCase(Locale.ROOT);
        if (host.equals("docs-stage.oracle.com")) {
            host = "docs.oracle.com";
        }
        if (!"https".equalsIgnoreCase(uri.getScheme()) && !"http".equalsIgnoreCase(uri.getScheme())) {
            throw new IllegalStateException("Not a web address: " + url);
        }
        if (!settings.hosts().contains(host) || uri.getUserInfo() != null || (uri.getPort() != -1 && uri.getPort() != 443)) {
            throw new IllegalStateException("Not one of Oracle's documentation sites: " + url);
        }
        return URI.create("https://" + host + uri.getRawPath() + (uri.getRawQuery() == null ? "" : "?" + uri.getRawQuery()));
    }

    // --- parsing (static, tested without the network) ---

    /**
     * The index lists each release in a table row: its library link and "Documentation Library for Oracle Banking
     * Digital Experience 25.2.0.0.0". The cloud service is a different product. Newest first.
     */
    static List<Release> parseReleases(String html, String base) {
        Map<String, Release> releases = new LinkedHashMap<>();
        Matcher row = ROW.matcher(html);
        while (row.find()) {
            String cells = row.group(1);
            Matcher m = RELEASE.matcher(cells);
            if (!m.find() || cells.toLowerCase(Locale.ROOT).contains("cloud service")) {
                continue;
            }
            String version = m.group(1);
            Matcher href = HREF.matcher(cells);
            while (href.find()) {
                String link = href.group(1);
                String lower = link.toLowerCase(Locale.ROOT);
                if (lower.endsWith("homepage.htm") || lower.endsWith("/index.html") || lower.endsWith("/")) {
                    releases.putIfAbsent(version, new Release(version, URI.create(base).resolve(link.replace(" ", "%20")).toString()));
                    break;
                }
            }
        }
        List<Release> list = new ArrayList<>(releases.values());
        list.sort(Comparator.comparing(Release::version, OracleLibrary::compareVersions).reversed());
        return list;
    }

    /** The older libraries (22.x): tech_docs/ and um_docs/ folders, one more of each per patchset (tech_docs-22.2.6). */
    static List<Manual> parseOldLibrary(String html, Release release) {
        List<Manual> manuals = new ArrayList<>();
        Matcher href = HREF.matcher(html);
        while (href.find()) {
            Matcher m = OLD_PDF.matcher(href.group(1));
            if (!m.matches()) {
                continue;
            }
            String name = URLDecoder.decode(m.group(3).replace("+", "%2B"), StandardCharsets.UTF_8).replaceFirst("(?i)\\.pdf$", "");
            boolean technical = m.group(1).equalsIgnoreCase("tech_docs");
            String patch = m.group(2) == null ? release.version() : m.group(2);
            manuals.add(new Manual(cleanTitle(name, technical), URI.create(release.libraryUrl()).resolve(href.group(1).replace(" ", "%20")).toString(),
                    technical, patch));
        }
        return manuals;
    }

    /**
     * The newer libraries (25.x): a JSON list of the page's books with their PDF and category. The library's home page
     * lists the user manuals; its other pages the technical guides, security and release notes.
     */
    List<Manual> parseBookData(String html, String version, boolean technicalPage, String pageUrl) {
        Matcher m = BOOK_DATA.matcher(html);
        if (!m.find()) {
            return List.of();
        }
        List<Map<String, Object>> books;
        try {
            books = json.readValue(m.group(1).strip(), new TypeReference<List<Map<String, Object>>>() {
            });
        } catch (RuntimeException e) {
            return List.of();
        }
        List<Manual> manuals = new ArrayList<>();
        for (Map<String, Object> book : books) {
            Object pdf = book.get("pdf");
            Object title = book.get("title");
            if (!(pdf instanceof String p) || !(title instanceof String t) || !p.toLowerCase(Locale.ROOT).endsWith(".pdf")) {
                continue;
            }
            String category = String.valueOf(book.get("category"));
            boolean technical = technicalPage || category.toLowerCase(Locale.ROOT).contains("technical");
            String url = p.startsWith("//") ? "https:" + p : URI.create(pageUrl).resolve(p.replace(" ", "%20")).toString();
            manuals.add(new Manual(cleanTitle(t, technical), url, technical, version));
        }
        return manuals;
    }

    /** The newer libraries' other pages (technical guides, security, release notes), from the page's navigation. */
    static List<String> libraryPages(String html, String libraryUrl) {
        Set<String> pages = new LinkedHashSet<>();
        URI base = URI.create(libraryUrl);
        Matcher href = HREF.matcher(html);
        while (href.find()) {
            String link = href.group(1);
            if (link.startsWith("http") || link.startsWith("/") || link.startsWith("#") || link.startsWith("../") || !link.endsWith(".html")) {
                continue;
            }
            String url = base.resolve(link).toString();
            if (!url.equals(libraryUrl)) {
                pages.add(url);
            }
        }
        return pages.stream().limit(20).toList();
    }

    /** One file per title: the one from the newest patchset. */
    static List<Manual> newestOfEach(List<Manual> manuals) {
        Map<String, Manual> newest = new LinkedHashMap<>();
        for (Manual manual : manuals) {
            newest.merge(manual.title().toLowerCase(Locale.ROOT), manual,
                    (a, b) -> compareVersions(b.release(), a.release()) > 0 ? b : a);
        }
        return new ArrayList<>(newest.values());
    }

    /**
     * The title the factory files a manual under, which is also its file name, so a later patchset's file of the same
     * manual is a newer revision: "Oracle Banking Digital Experience Security Guide" becomes "Security Guide",
     * "User Manual Oracle Banking Digital Experience Core" and a user manual book "01. Core" become "User Manual - Core".
     */
    static String cleanTitle(String title, boolean technical) {
        String t = title.replaceAll("\\s+", " ").strip().replaceFirst("^\\d+\\.\\s*", "");
        boolean userManual = t.matches("(?i)^User Manual\\b.*");
        t = t.replaceFirst("(?i)^User Manual\\s*-?\\s*", "").replaceFirst("(?i)^Oracle Banking Digital Experience\\s*-?\\s*", "")
                .replaceAll("[\\\\/:*?\"<>|]", " ").replaceAll("\\s+", " ").strip();
        if (userManual || !technical) {
            t = "User Manual - " + t;
        }
        return t.length() > 200 ? t.substring(0, 200) : t;
    }

    static int compareVersions(String a, String b) {
        String[] x = a.split("\\.");
        String[] y = b.split("\\.");
        for (int i = 0; i < Math.max(x.length, y.length); i++) {
            int p = i < x.length ? parse(x[i]) : 0;
            int q = i < y.length ? parse(y[i]) : 0;
            if (p != q) {
                return Integer.compare(p, q);
            }
        }
        return 0;
    }

    private static int parse(String s) {
        try {
            return Integer.parseInt(s);
        } catch (NumberFormatException e) {
            return 0;
        }
    }

    private static void copy(InputStream in, Path file, long limit) throws IOException {
        byte[] buffer = new byte[64 * 1024];
        long total = 0;
        try (OutputStream out = Files.newOutputStream(file)) {
            int n;
            while ((n = in.read(buffer)) >= 0) {
                total += n;
                if (total > limit) {
                    throw new IOException("the file is larger than " + (limit / (1024 * 1024)) + " MB");
                }
                out.write(buffer, 0, n);
            }
        }
    }

    private static void close(HttpResponse<InputStream> response) {
        try {
            response.body().close();
        } catch (IOException e) {
            // nothing to do
        }
    }

    static void deleteQuietly(Path file) {
        if (file == null) {
            return;
        }
        try {
            Files.deleteIfExists(file);
        } catch (IOException e) {
            // a temporary file; the system removes it later
        }
    }

    /** The release on the index for an OBDX version (22.2), newest first: 22.2.0.0.0 before 22.1. */
    static Optional<Release> releaseFor(List<Release> releases, String version) {
        return releases.stream().filter(r -> r.version().equals(version) || r.version().startsWith(version + ".")).findFirst();
    }
}
