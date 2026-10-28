package com.obdx.factory.update;

import com.obdx.factory.common.BadRequestException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.info.BuildProperties;
import org.springframework.context.ApplicationContext;
import org.springframework.stereotype.Service;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.security.DigestInputStream;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.time.Instant;
import java.util.HexFormat;
import java.util.function.IntConsumer;

/**
 * Keeps a factory started with start.bat or start.sh up to date: every GitHub build publishes the jar and a
 * version.json to a fixed release, the factory compares its build number with it, and on request downloads the new jar
 * into the update folder and stops with exit code 75. The start script then puts the new jar in place and starts it.
 * Off unless FACTORY_UPDATES=true (the download's settings), because only the start scripts restart the factory.
 */
@Service
public class UpdateService {

    /** Exit code that asks the start script to install the downloaded jar and start again. */
    public static final int RESTART_EXIT_CODE = 75;

    private static final Logger log = LoggerFactory.getLogger(UpdateService.class);
    private static final Duration CHECK_INTERVAL = Duration.ofMinutes(30);

    public enum State { UP_TO_DATE, AVAILABLE, DOWNLOADING, READY, RESTARTING, FAILED, OFF }

    /**
     * @param progress percent downloaded while DOWNLOADING
     */
    public record Status(boolean enabled, String version, String build, String builtAt, String latestBuild, String latestDate,
                         State state, int progress, String message) {
    }

    private record Release(String build, String commit, String date, String sha256, long size) {
    }

    private final boolean enabled;
    private final String baseUrl;
    private final Path folder;
    private final BuildProperties buildInfo;
    private final ObjectMapper json;
    private final HttpClient http;
    /** Stops the factory with an exit code; replaced in tests. */
    private IntConsumer exit;

    private Release latest;
    private Instant checkedAt;
    private State state;
    private int progress;
    private String message;

    public UpdateService(@Value("${factory.update.enabled}") boolean enabled, @Value("${factory.update.url}") String baseUrl,
                         @Value("${factory.update.directory}") Path folder, ObjectProvider<BuildProperties> buildInfo,
                         ObjectMapper json, ApplicationContext context) {
        this.enabled = enabled && !baseUrl.isBlank();
        this.baseUrl = baseUrl.endsWith("/") ? baseUrl : baseUrl + "/";
        this.folder = folder;
        this.buildInfo = buildInfo.getIfAvailable();
        this.json = json;
        this.http = HttpClient.newBuilder().followRedirects(HttpClient.Redirect.NORMAL).connectTimeout(Duration.ofSeconds(20)).build();
        this.state = this.enabled ? State.UP_TO_DATE : State.OFF;
        this.exit = code -> System.exit(SpringApplication.exit(context, () -> code));
    }

    void setExit(IntConsumer exit) {
        this.exit = exit;
    }

    /** What runs now and whether a newer build exists (checks GitHub at most every 30 minutes unless forced). */
    public synchronized Status status(boolean force) {
        if (enabled && state != State.DOWNLOADING && state != State.READY && state != State.RESTARTING
                && (force || checkedAt == null || checkedAt.plus(CHECK_INTERVAL).isBefore(Instant.now()))) {
            check();
        }
        return new Status(enabled, buildInfo == null ? null : buildInfo.getVersion(), currentBuild(),
                buildInfo == null || buildInfo.getTime() == null ? null : buildInfo.getTime().toString(),
                latest == null ? null : latest.build(), latest == null ? null : latest.date(), state, progress, message);
    }

    /** Downloads the newer build in the background; when it is complete and verified, the factory restarts with it. */
    public synchronized Status update() {
        if (!enabled) {
            throw new BadRequestException("Updates are off on this factory (FACTORY_UPDATES)");
        }
        if (state != State.AVAILABLE && state != State.FAILED) {
            throw new BadRequestException("There is no newer version to install");
        }
        Release release = latest;
        state = State.DOWNLOADING;
        progress = 0;
        message = "Downloading build " + release.build();
        Thread.ofVirtual().name("factory-update").start(() -> download(release));
        return status(false);
    }

    private void check() {
        checkedAt = Instant.now();
        try {
            HttpResponse<String> response = http.send(HttpRequest.newBuilder(URI.create(baseUrl + "version.json"))
                    .timeout(Duration.ofSeconds(30)).GET().build(), HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() != 200) {
                throw new IOException("HTTP " + response.statusCode());
            }
            JsonNode node = json.readTree(response.body());
            latest = new Release(node.path("build").asString(), node.path("commit").asString(), node.path("date").asString(),
                    node.path("sha256").asString(), node.path("size").asLong());
            boolean newer = isNewer(latest.build(), currentBuild());
            state = newer ? State.AVAILABLE : State.UP_TO_DATE;
            message = newer ? "Build " + latest.build() + " is available" : "This is the latest version";
        } catch (IOException | RuntimeException e) {
            state = State.FAILED;
            message = "Could not check for updates at " + baseUrl + ": " + e.getMessage();
            log.info(message);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    private void download(Release release) {
        Path part = folder.resolve("obdx-factory.jar.part");
        try {
            Files.createDirectories(folder);
            HttpResponse<InputStream> response = http.send(HttpRequest.newBuilder(URI.create(baseUrl + "obdx-factory.jar")).GET().build(),
                    HttpResponse.BodyHandlers.ofInputStream());
            if (response.statusCode() != 200) {
                throw new IOException("HTTP " + response.statusCode());
            }
            MessageDigest sha256 = MessageDigest.getInstance("SHA-256");
            long total = response.headers().firstValueAsLong("Content-Length").orElse(release.size());
            try (InputStream in = new DigestInputStream(response.body(), sha256); OutputStream out = Files.newOutputStream(part)) {
                byte[] buffer = new byte[1 << 16];
                long done = 0;
                for (int n; (n = in.read(buffer)) > 0; ) {
                    out.write(buffer, 0, n);
                    done += n;
                    if (total > 0) {
                        setProgress((int) (done * 100 / total));
                    }
                }
            }
            String actual = HexFormat.of().formatHex(sha256.digest());
            if (!release.sha256().isBlank() && !actual.equalsIgnoreCase(release.sha256())) {
                throw new IOException("the download is damaged (SHA-256 " + actual + ", expected " + release.sha256() + ")");
            }
            Files.move(part, folder.resolve("obdx-factory.jar"), StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
            restart(release);
        } catch (IOException | NoSuchAlgorithmException | RuntimeException e) {
            fail("The update could not be downloaded: " + e.getMessage(), part);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            fail("The update was interrupted", part);
        }
    }

    private synchronized void setProgress(int percent) {
        progress = percent;
    }

    private synchronized void fail(String text, Path part) {
        state = State.FAILED;
        message = text;
        log.warn(text);
        try {
            Files.deleteIfExists(part);
        } catch (IOException ignored) {
            // a leftover .part file is overwritten by the next download
        }
    }

    private void restart(Release release) throws InterruptedException {
        synchronized (this) {
            state = State.RESTARTING;
            progress = 100;
            message = "Restarting with build " + release.build();
        }
        log.info("Build {} downloaded; restarting to install it", release.build());
        // Give the browser time to see RESTARTING before the server stops.
        Thread.sleep(2000);
        exit.accept(RESTART_EXIT_CODE);
    }

    private String currentBuild() {
        return buildInfo == null ? "dev" : buildInfo.get("number");
    }

    /** Builds are numbered; a development build ("dev") is never replaced automatically. */
    static boolean isNewer(String latest, String current) {
        try {
            return Long.parseLong(latest) > Long.parseLong(current);
        } catch (NumberFormatException | NullPointerException e) {
            return false;
        }
    }
}
