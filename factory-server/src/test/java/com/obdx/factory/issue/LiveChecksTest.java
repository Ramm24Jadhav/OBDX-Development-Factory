package com.obdx.factory.issue;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import javax.net.ssl.KeyManagerFactory;
import javax.net.ssl.SSLContext;
import javax.net.ssl.SSLServerSocket;
import java.io.FileInputStream;
import java.io.InputStream;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.file.Path;
import java.security.KeyStore;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class LiveChecksTest {

    @TempDir
    Path temp;

    @Test
    void findsTargetsInEvidenceAndCodeOnly() {
        Evidence evidence = new Evidence(List.of(
                new Evidence.Item("E1", "URL", "server.log", 3, "https://pay.bank.example/api/transfer"),
                new Evidence.Item("E2", "ERROR_LINE", "server.log", 4, "ERROR calling http://accounts.bank.example:8080/accounts failed"),
                new Evidence.Item("C1", "CODE", "config/db.properties", 1, "db.url=jdbc:oracle:thin:@db1.bank.example:1521/OBDX\nlog=FundTransferService.java:142"),
                new Evidence.Item("O1", "ORACLE_NOTE", "Note", 1, "see https://support.oracle.com:443/x"),
                new Evidence.Item("E3", "URL", "server.log", 5, "https://pay.bank.example/other")), "");
        assertThat(LiveChecks.targets(evidence)).extracting(LiveChecks.Target::label)
                .containsExactly("pay.bank.example:443", "accounts.bank.example:8080", "db1.bank.example:1521");
        assertThat(LiveChecks.targets(evidence).getFirst().tls()).isTrue();
        assertThat(LiveChecks.targets(evidence).get(1).tls()).isFalse();
        assertThat(LiveChecks.targets(evidence).get(2).source()).isEqualTo("C1 config/db.properties");
        assertThat(LiveChecks.targets(null)).isEmpty();
    }

    @Test
    void refusesTheFactorysOwnMachineAndMetadataAddresses() throws Exception {
        LiveChecks checks = new LiveChecks(false);
        assertThatThrownBy(() -> checks.check(new LiveChecks.Target("localhost", 8080, false, "E1")))
                .hasMessageContaining("not checked");
        assertThat(checks.refused(InetAddress.getByName("169.254.169.254"))).isTrue();
        assertThat(new LiveChecks(true).refused(InetAddress.getByName("169.254.169.254"))).isTrue();
        assertThat(new LiveChecks(true).refused(InetAddress.getLoopbackAddress())).isFalse();
    }

    @Test
    void reportsUnknownHostsAndClosedPorts() throws Exception {
        LiveChecks checks = new LiveChecks(true);
        assertThat(checks.check(new LiveChecks.Target("no-such-host.invalid", 443, true, "E1")).result()).isEqualTo("LIVE_UNREACHABLE");
        int closed;
        try (ServerSocket server = new ServerSocket(0, 1, InetAddress.getLoopbackAddress())) {
            closed = server.getLocalPort();
        }
        LiveChecks.Result result = checks.check(new LiveChecks.Target("127.0.0.1", closed, false, "E1"));
        assertThat(result.result()).isEqualTo("LIVE_UNREACHABLE");
        assertThat(result.summary()).contains("No connection to 127.0.0.1:" + closed);
    }

    @Test
    void connectsAndReadsAnUntrustedCertificate() throws Exception {
        LiveChecks checks = new LiveChecks(true);
        try (ServerSocket server = new ServerSocket(0, 5, InetAddress.getLoopbackAddress())) {
            Thread accept = acceptAll(server);
            LiveChecks.Result plain = checks.check(new LiveChecks.Target("127.0.0.1", server.getLocalPort(), false, "E1"));
            assertThat(plain.result()).isEqualTo("LIVE_OK");
            accept.interrupt();
        }

        Path keystore = temp.resolve("test.p12");
        Process keytool = new ProcessBuilder(Path.of(System.getProperty("java.home"), "bin", "keytool").toString(), "-genkeypair",
                "-alias", "test", "-keyalg", "RSA", "-keysize", "2048", "-validity", "10", "-dname", "CN=test.bank.example",
                "-storetype", "PKCS12", "-keystore", keystore.toString(), "-storepass", "changeit", "-keypass", "changeit")
                .redirectErrorStream(true).start();
        assertThat(keytool.waitFor()).isZero();
        KeyStore store = KeyStore.getInstance("PKCS12");
        try (InputStream in = new FileInputStream(keystore.toFile())) {
            store.load(in, "changeit".toCharArray());
        }
        KeyManagerFactory keys = KeyManagerFactory.getInstance(KeyManagerFactory.getDefaultAlgorithm());
        keys.init(store, "changeit".toCharArray());
        SSLContext context = SSLContext.getInstance("TLS");
        context.init(keys.getKeyManagers(), null, null);
        try (SSLServerSocket server = (SSLServerSocket) context.getServerSocketFactory().createServerSocket(0, 5, InetAddress.getLoopbackAddress())) {
            Thread accept = acceptAll(server);
            LiveChecks.Result tls = checks.check(new LiveChecks.Target("127.0.0.1", server.getLocalPort(), true, "E1"));
            assertThat(tls.result()).isEqualTo("LIVE_CERTIFICATE");
            assertThat(tls.summary()).contains("not trusted");
            assertThat(tls.details()).anyMatch(d -> d.contains("CN=test.bank.example")).anyMatch(d -> d.startsWith("Valid until"));
            accept.interrupt();
        }
    }

    /** Accepts connections (and TLS handshakes) until the socket closes. */
    private static Thread acceptAll(ServerSocket server) {
        Thread thread = new Thread(() -> {
            while (!server.isClosed()) {
                try {
                    Socket socket = server.accept();
                    new Thread(() -> {
                        try (socket) {
                            if (socket instanceof javax.net.ssl.SSLSocket ssl) {
                                ssl.startHandshake();
                            }
                            socket.getInputStream().read();
                        } catch (Exception ignored) {
                            // the client closes after reading the certificate
                        }
                    }).start();
                } catch (Exception e) {
                    return;
                }
            }
        });
        thread.setDaemon(true);
        thread.start();
        return thread;
    }
}
