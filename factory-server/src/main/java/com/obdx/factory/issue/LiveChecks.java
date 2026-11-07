package com.obdx.factory.issue;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.net.ssl.SSLContext;
import javax.net.ssl.SSLSocket;
import javax.net.ssl.SSLSocketFactory;
import javax.net.ssl.TrustManager;
import javax.net.ssl.X509TrustManager;
import java.io.IOException;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.net.UnknownHostException;
import java.security.GeneralSecurityException;
import java.security.cert.Certificate;
import java.security.cert.X509Certificate;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/**
 * Read-only checks of hosts found in an issue, from the factory server: name lookup, a connection to the port, and
 * for TLS the certificate. Only hosts and ports that appear in the issue's evidence and the bank's code excerpts can
 * be checked, and the factory's own machine and link-local (cloud metadata) addresses are refused. Nothing is sent
 * over the connection.
 */
@Component
public class LiveChecks {

    static final int TIMEOUT_MS = 5000;
    static final int EXPIRING_DAYS = 30;
    private static final int MAX_TARGETS = 20;
    private static final Pattern URL = Pattern.compile("(?i)\\b(https?|ldaps?|t3s?|jdbc:[a-z]+(?::[a-z]+)*)://?@?([A-Za-z0-9.-]+)(?::(\\d{1,5}))?");
    private static final Pattern HOST_PORT = Pattern.compile("(?<![\\w./-])([A-Za-z][A-Za-z0-9-]*(?:\\.[A-Za-z0-9-]+)+|\\d{1,3}(?:\\.\\d{1,3}){3}):(\\d{2,5})\\b");
    private static final Set<Integer> TLS_PORTS = Set.of(443, 636, 7002, 8443, 9443);

    /** @param source where the issue mentions it ("E3 server.log", "C1 config/hosts.properties") */
    public record Target(String host, int port, boolean tls, String source) {

        public String label() {
            return host + ":" + port;
        }
    }

    /**
     * @param result  LIVE_OK, LIVE_UNREACHABLE or LIVE_CERTIFICATE
     * @param details one line per finding: addresses, connection, certificate subject, issuer, expiry, trust
     */
    public record Result(String result, String summary, List<String> details) {
    }

    private final boolean allowLoopback;

    public LiveChecks(@Value("${factory.issue.live-checks.allow-loopback:false}") boolean allowLoopback) {
        this.allowLoopback = allowLoopback;
    }

    /** The hosts and ports an issue mentions: in URLs and host:port values of its evidence and code excerpts. */
    public static List<Target> targets(Evidence evidence) {
        Map<String, Target> found = new LinkedHashMap<>();
        for (Evidence.Item item : evidence == null ? List.<Evidence.Item>of() : evidence.items()) {
            if (IssueAnalyzer.LIBRARY_OR_CODE.contains(item.kind()) && !item.kind().equals("CODE")) {
                continue;
            }
            String source = item.id() + " " + item.source();
            Matcher url = URL.matcher(item.text());
            while (url.find()) {
                String scheme = url.group(1).toLowerCase(Locale.ROOT);
                int port = url.group(3) != null ? Integer.parseInt(url.group(3)) : defaultPort(scheme);
                if (port > 0) {
                    boolean tls = scheme.equals("https") || scheme.equals("ldaps") || scheme.equals("t3s") || TLS_PORTS.contains(port);
                    found.putIfAbsent(url.group(2).toLowerCase(Locale.ROOT) + ":" + port, new Target(url.group(2).toLowerCase(Locale.ROOT), port, tls, source));
                }
            }
            Matcher hostPort = HOST_PORT.matcher(item.text());
            while (hostPort.find()) {
                int port = Integer.parseInt(hostPort.group(2));
                String host = hostPort.group(1).toLowerCase(Locale.ROOT);
                if (port <= 65535 && !host.matches(".*\\.(java|js|xml|properties|jsp|class)$")) {
                    found.putIfAbsent(host + ":" + port, new Target(host, port, TLS_PORTS.contains(port), source));
                }
            }
        }
        return found.values().stream().limit(MAX_TARGETS).toList();
    }

    static int defaultPort(String scheme) {
        return switch (scheme) {
            case "https" -> 443;
            case "http" -> 80;
            case "ldap" -> 389;
            case "ldaps" -> 636;
            default -> -1;
        };
    }

    public Result check(Target target) {
        List<String> details = new ArrayList<>();
        InetAddress[] addresses;
        try {
            addresses = InetAddress.getAllByName(target.host());
        } catch (UnknownHostException e) {
            return new Result("LIVE_UNREACHABLE", target.host() + " is not known to the name server (DNS) of the factory's network.", details);
        }
        details.add("Addresses: " + Arrays.stream(addresses).map(InetAddress::getHostAddress).collect(Collectors.joining(", ")));
        for (InetAddress address : addresses) {
            if (refused(address)) {
                throw new IllegalArgumentException(target.host() + " is the factory's own machine or a link-local address; those are not checked.");
            }
        }
        try (Socket socket = new Socket()) {
            socket.connect(new InetSocketAddress(addresses[0], target.port()), TIMEOUT_MS);
            details.add("Connected to port " + target.port() + ".");
        } catch (IOException e) {
            return new Result("LIVE_UNREACHABLE", "No connection to " + target.label() + " from the factory: " + e.getMessage()
                    + ". Check that the service is running and that firewalls allow it.", details);
        }
        if (!target.tls()) {
            return new Result("LIVE_OK", target.label() + " answers (connection made).", details);
        }
        return certificate(target, addresses[0], details);
    }

    private Result certificate(Target target, InetAddress address, List<String> details) {
        String trustProblem = null;
        X509Certificate cert;
        try {
            cert = peer((SSLSocketFactory) SSLSocketFactory.getDefault(), target, address);
        } catch (IOException e) {
            trustProblem = e.getMessage();
            try {
                // Only to read the certificate the server presents; nothing is sent
                cert = peer(readOnlyFactory(), target, address);
            } catch (IOException | GeneralSecurityException again) {
                return new Result("LIVE_CERTIFICATE", "The TLS handshake with " + target.label() + " failed: " + again.getMessage() + ".", details);
            }
        } catch (GeneralSecurityException e) {
            return new Result("LIVE_CERTIFICATE", "The TLS handshake with " + target.label() + " failed: " + e.getMessage() + ".", details);
        }
        long days = Duration.between(Instant.now(), cert.getNotAfter().toInstant()).toDays();
        details.add("Certificate: " + cert.getSubjectX500Principal().getName());
        details.add("Issued by: " + cert.getIssuerX500Principal().getName());
        details.add("Valid until: " + cert.getNotAfter().toInstant() + " (" + days + " days)");
        details.add(trustProblem == null ? "Trusted by the factory's Java." : "Not trusted by the factory's Java: " + trustProblem);
        if (days < 0) {
            return new Result("LIVE_CERTIFICATE", "The certificate of " + target.label() + " expired " + (-days) + " days ago.", details);
        }
        if (trustProblem != null) {
            return new Result("LIVE_CERTIFICATE", "The certificate of " + target.label() + " is not trusted (self-signed, or its issuer is "
                    + "missing from the trust store).", details);
        }
        if (days < EXPIRING_DAYS) {
            return new Result("LIVE_CERTIFICATE", "The certificate of " + target.label() + " expires in " + days + " days.", details);
        }
        return new Result("LIVE_OK", target.label() + " answers, and its certificate is trusted and valid for " + days + " more days.", details);
    }

    private static X509Certificate peer(SSLSocketFactory factory, Target target, InetAddress address) throws IOException, GeneralSecurityException {
        try (Socket plain = new Socket()) {
            plain.connect(new InetSocketAddress(address, target.port()), TIMEOUT_MS);
            plain.setSoTimeout(TIMEOUT_MS);
            try (SSLSocket socket = (SSLSocket) factory.createSocket(plain, target.host(), target.port(), true)) {
                socket.startHandshake();
                Certificate[] chain = socket.getSession().getPeerCertificates();
                if (chain.length == 0 || !(chain[0] instanceof X509Certificate first)) {
                    throw new GeneralSecurityException("the server sent no certificate");
                }
                return first;
            }
        }
    }

    private static SSLSocketFactory readOnlyFactory() throws GeneralSecurityException {
        TrustManager accept = new X509TrustManager() {
            @Override
            public void checkClientTrusted(X509Certificate[] chain, String authType) {
            }

            @Override
            public void checkServerTrusted(X509Certificate[] chain, String authType) {
            }

            @Override
            public X509Certificate[] getAcceptedIssuers() {
                return new X509Certificate[0];
            }
        };
        SSLContext context = SSLContext.getInstance("TLS");
        context.init(null, new TrustManager[]{accept}, null);
        return context.getSocketFactory();
    }

    boolean refused(InetAddress address) {
        if (address.isLinkLocalAddress() || address.getHostAddress().equals("169.254.169.254")) {
            return true;
        }
        return !allowLoopback && (address.isLoopbackAddress() || address.isAnyLocalAddress());
    }

    /** Lines for the evidence of the next analysis. */
    static String describe(Target target, Result result) {
        return target.label() + ": " + result.summary() + (result.details().isEmpty() ? "" : " " + String.join("; ", result.details()));
    }
}
