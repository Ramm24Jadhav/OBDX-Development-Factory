package com.obdx.factory.jenkins;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * A small stand-in for Jenkins' REST API: crumbs, jobs in folders, parameterized builds through the queue, build
 * status, console logs and JUnit test reports. Each job answers with the next scripted outcome.
 */
public class StubJenkins implements AutoCloseable {

    /** One scripted build: its result, console log and failed tests (className, name, error). */
    public record Outcome(String result, String console, List<String[]> failedTests) {
        public static Outcome success() {
            return new Outcome("SUCCESS", "BUILD SUCCESS", List.of());
        }
    }

    /** What the factory sent when it started a build. */
    public record Trigger(String job, String contentType, String body, String authorization, String crumb) {
    }

    private final HttpServer server;
    private final Map<String, Deque<Outcome>> scripts = new ConcurrentHashMap<>();
    private final Map<Integer, String> queueToJob = new ConcurrentHashMap<>();
    private final Map<String, Outcome> builds = new ConcurrentHashMap<>();
    private final Map<Integer, AtomicInteger> queuePolls = new ConcurrentHashMap<>();
    private final Map<String, AtomicInteger> buildPolls = new ConcurrentHashMap<>();
    private final AtomicInteger queueCounter = new AtomicInteger();
    private final Map<String, AtomicInteger> buildCounters = new ConcurrentHashMap<>();
    public final List<Trigger> triggers = new ArrayList<>();
    public volatile boolean requireCrumb = true;
    public final List<String> parameters = new ArrayList<>(List.of("BRANCH"));

    public StubJenkins() throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/", this::handle);
        server.start();
    }

    public String url() {
        return "http://127.0.0.1:" + server.getAddress().getPort() + "/jenkins";
    }

    public void script(String job, Outcome... outcomes) {
        scripts.computeIfAbsent(job, k -> new ArrayDeque<>()).addAll(List.of(outcomes));
    }

    @Override
    public void close() {
        server.stop(0);
    }

    private void handle(HttpExchange exchange) throws IOException {
        String path = exchange.getRequestURI().getRawPath().replaceFirst("^/jenkins", "");
        String auth = exchange.getRequestHeaders().getFirst("Authorization");
        if (auth == null || !auth.equals("Basic " + java.util.Base64.getEncoder().encodeToString("factory:api-token".getBytes()))) {
            respond(exchange, 401, "text/plain", "Unauthorized");
            return;
        }
        if (path.equals("/crumbIssuer/api/json")) {
            respond(exchange, 200, "application/json", "{\"crumbRequestField\": \"Jenkins-Crumb\", \"crumb\": \"c-123\"}");
            return;
        }
        if (path.startsWith("/queue/item/")) {
            int id = Integer.parseInt(path.replaceAll("\\D+", " ").trim().split(" ")[0]);
            String job = queueToJob.get(id);
            if (queuePolls.computeIfAbsent(id, k -> new AtomicInteger()).incrementAndGet() < 2) {
                respond(exchange, 200, "application/json", "{\"why\": \"Waiting for next available executor\"}");
                return;
            }
            String buildUrl = url() + jobPath(job) + "/" + id + "/";
            respond(exchange, 200, "application/json", "{\"executable\": {\"number\": " + id + ", \"url\": \"" + buildUrl + "\"}}");
            return;
        }
        String job = jobName(path);
        String rest = path.substring(jobPath(job).length());
        if (rest.equals("/api/json")) {
            String params = String.join(",", parameters.stream().map(p -> "{\"name\": \"" + p + "\"}").toList());
            respond(exchange, 200, "application/json", "{\"name\": \"" + job.substring(job.lastIndexOf('/') + 1) + "\", \"url\": \""
                    + url() + jobPath(job) + "/\", \"property\": [{\"parameterDefinitions\": [" + params + "]}]}");
            return;
        }
        if (rest.equals("/buildWithParameters")) {
            String crumb = exchange.getRequestHeaders().getFirst("Jenkins-Crumb");
            if (requireCrumb && !"c-123".equals(crumb)) {
                respond(exchange, 403, "text/plain", "No valid crumb was included in the request");
                return;
            }
            String body = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
            synchronized (triggers) {
                triggers.add(new Trigger(job, exchange.getRequestHeaders().getFirst("Content-Type"), body, auth, crumb));
            }
            int queueId = queueCounter.incrementAndGet();
            queueToJob.put(queueId, job);
            Deque<Outcome> script = scripts.get(job);
            builds.put(job + "#" + queueId, script == null || script.isEmpty() ? Outcome.success() : script.poll());
            exchange.getResponseHeaders().add("Location", url() + "/queue/item/" + queueId + "/");
            respond(exchange, 201, "text/plain", "");
            return;
        }
        String[] parts = rest.split("/");
        int number = Integer.parseInt(parts[1]);
        Outcome outcome = builds.get(job + "#" + number);
        String what = rest.substring(("/" + number).length());
        switch (what) {
            case "/api/json" -> {
                boolean building = buildPolls.computeIfAbsent(job + number, k -> new AtomicInteger()).incrementAndGet() < 2;
                respond(exchange, 200, "application/json", building ? "{\"building\": true, \"result\": null}"
                        : "{\"building\": false, \"result\": \"" + outcome.result() + "\"}");
            }
            case "/consoleText" -> respond(exchange, 200, "text/plain", outcome.console());
            case "/testReport/api/json" -> {
                if (outcome.failedTests().isEmpty()) {
                    respond(exchange, 404, "text/plain", "No test report");
                } else {
                    String cases = String.join(",", outcome.failedTests().stream().map(t -> "{\"className\": \"" + t[0]
                            + "\", \"name\": \"" + t[1] + "\", \"status\": \"FAILED\", \"errorDetails\": \"" + t[2] + "\"}").toList());
                    respond(exchange, 200, "application/json", "{\"suites\": [{\"cases\": [" + cases + "]}]}");
                }
            }
            default -> respond(exchange, 404, "text/plain", "Not found");
        }
    }

    /** "/job/a/job/b/..." gives "a/b". */
    private static String jobName(String path) {
        StringBuilder name = new StringBuilder();
        String[] parts = path.split("/");
        for (int i = 1; i + 1 < parts.length; i += 2) {
            if (!parts[i].equals("job")) {
                break;
            }
            name.append(name.isEmpty() ? "" : "/").append(java.net.URLDecoder.decode(parts[i + 1], StandardCharsets.UTF_8));
        }
        return name.toString();
    }

    private static String jobPath(String job) {
        StringBuilder path = new StringBuilder();
        for (String part : job.split("/")) {
            path.append("/job/").append(java.net.URLEncoder.encode(part, StandardCharsets.UTF_8).replace("+", "%20"));
        }
        return path.toString();
    }

    private static void respond(HttpExchange exchange, int status, String type, String body) throws IOException {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().add("Content-Type", type);
        exchange.sendResponseHeaders(status, bytes.length == 0 ? -1 : bytes.length);
        if (bytes.length > 0) {
            try (OutputStream out = exchange.getResponseBody()) {
                out.write(bytes);
            }
        }
        exchange.close();
    }
}
