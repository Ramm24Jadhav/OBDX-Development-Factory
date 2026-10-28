package com.obdx.factory.update;

import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.support.DefaultListableBeanFactory;
import org.springframework.boot.info.BuildProperties;
import tools.jackson.databind.json.JsonMapper;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.Properties;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;

/** Checking for and installing a newer build, against a local server standing in for the GitHub release. */
class UpdateServiceTest {

    private static final byte[] JAR = "new factory jar".getBytes(StandardCharsets.UTF_8);

    @TempDir
    Path folder;
    private HttpServer server;
    private String sha256;

    @BeforeEach
    void serveRelease() throws Exception {
        sha256 = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(JAR));
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/latest/version.json", exchange -> respond(exchange,
                ("{\"build\": \"7\", \"commit\": \"abc\", \"date\": \"2026-10-28T12:00:00Z\", \"sha256\": \"" + sha256 + "\", \"size\": "
                        + JAR.length + "}").getBytes(StandardCharsets.UTF_8)));
        server.createContext("/latest/obdx-factory.jar", exchange -> respond(exchange, JAR));
        server.start();
    }

    @AfterEach
    void stop() {
        server.stop(0);
    }

    @Test
    void downloadsVerifiesAndRestartsWithTheNewerBuild() throws Exception {
        UpdateService service = service("5");
        CompletableFuture<Integer> exitCode = new CompletableFuture<>();
        service.setExit(exitCode::complete);

        UpdateService.Status status = service.status(true);
        assertThat(status.state()).isEqualTo(UpdateService.State.AVAILABLE);
        assertThat(status.latestBuild()).isEqualTo("7");

        service.update();
        assertThat(exitCode.get(20, TimeUnit.SECONDS)).isEqualTo(UpdateService.RESTART_EXIT_CODE);
        assertThat(Files.readAllBytes(folder.resolve("obdx-factory.jar"))).isEqualTo(JAR);
        assertThat(service.status(false).state()).isEqualTo(UpdateService.State.RESTARTING);
    }

    @Test
    void theLatestBuildAndDevelopmentBuildsAreNotReplaced() {
        assertThat(service("7").status(true).state()).isEqualTo(UpdateService.State.UP_TO_DATE);
        assertThat(service("dev").status(true).state()).isEqualTo(UpdateService.State.UP_TO_DATE);
    }

    @Test
    void reportsAnUnreachableUpdateServer() {
        server.stop(0);
        UpdateService.Status status = service("5").status(true);
        assertThat(status.state()).isEqualTo(UpdateService.State.FAILED);
        assertThat(status.message()).startsWith("Could not check for updates");
    }

    private UpdateService service(String build) {
        Properties properties = new Properties();
        properties.setProperty("version", "0.1.0-SNAPSHOT");
        properties.setProperty("number", build);
        DefaultListableBeanFactory beans = new DefaultListableBeanFactory();
        beans.registerSingleton("buildProperties", new BuildProperties(properties));
        return new UpdateService(true, "http://127.0.0.1:" + server.getAddress().getPort() + "/latest/", folder,
                beans.getBeanProvider(BuildProperties.class), JsonMapper.builder().build(), null);
    }

    private static void respond(com.sun.net.httpserver.HttpExchange exchange, byte[] body) throws IOException {
        exchange.sendResponseHeaders(200, body.length);
        exchange.getResponseBody().write(body);
        exchange.close();
    }
}
