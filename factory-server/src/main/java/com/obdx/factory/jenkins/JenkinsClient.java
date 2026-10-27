package com.obdx.factory.jenkins;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.net.CookieManager;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Talks to a Jenkins server through its REST API: starts parameterized builds, follows them from the queue to the
 * result, and reads console logs and test reports. Authenticates with a username and API token.
 */
public class JenkinsClient {

    private static final JsonMapper JSON = JsonMapper.builder().build();

    private final String baseUrl;
    private final String authorization;
    private final JenkinsProperties properties;
    private final HttpClient http;
    private String crumbField;
    private String crumb;

    public JenkinsClient(String baseUrl, String username, String token, JenkinsProperties properties) {
        this.baseUrl = baseUrl.replaceAll("/+$", "");
        this.authorization = username == null || username.isBlank() ? null
                : "Basic " + Base64.getEncoder().encodeToString((username + ":" + (token == null ? "" : token)).getBytes(StandardCharsets.UTF_8));
        this.properties = properties;
        this.http = HttpClient.newBuilder().cookieHandler(new CookieManager()).connectTimeout(properties.requestTimeout())
                .followRedirects(HttpClient.Redirect.NORMAL).build();
    }

    public record JobInfo(String name, String url, List<String> parameters) {
    }

    public record BuildRef(int number, String url) {
    }

    /** A file sent as a file parameter, for example the patch to apply. */
    public record FileParameter(String name, String fileName, byte[] content) {
    }

    /** Checks access to a job and lists its build parameters. Job names may contain folders: "folder/job". */
    public JobInfo job(String job) {
        JsonNode node = getJson(jobUrl(job) + "/api/json?tree=name,url,property[parameterDefinitions[name]]");
        List<String> parameters = new ArrayList<>();
        for (JsonNode property : node.path("property")) {
            for (JsonNode definition : property.path("parameterDefinitions")) {
                parameters.add(definition.path("name").asString());
            }
        }
        return new JobInfo(node.path("name").asString(), node.path("url").asString(), parameters);
    }

    /** Starts a build and returns the URL of its queue item. */
    public String trigger(String job, Map<String, String> parameters, FileParameter file) {
        String url = jobUrl(job) + "/buildWithParameters";
        HttpRequest.Builder request = request(url).timeout(properties.requestTimeout());
        if (file == null) {
            String form = parameters.entrySet().stream()
                    .map(e -> encode(e.getKey()) + "=" + encode(e.getValue())).collect(Collectors.joining("&"));
            request.header("Content-Type", "application/x-www-form-urlencoded").POST(HttpRequest.BodyPublishers.ofString(form));
        } else {
            String boundary = "----factory" + UUID.randomUUID();
            request.header("Content-Type", "multipart/form-data; boundary=" + boundary)
                    .POST(HttpRequest.BodyPublishers.ofByteArray(multipart(boundary, parameters, file)));
        }
        addCrumb(request);
        HttpResponse<String> response = send(request.build());
        if (response.statusCode() == 403 && crumb == null && loadCrumb()) {
            addCrumb(request);
            response = send(request.build());
        }
        if (response.statusCode() != 201 && response.statusCode() != 200) {
            throw new JenkinsException("Jenkins did not start " + job + ": HTTP " + response.statusCode() + " " + firstLine(response.body()));
        }
        return response.headers().firstValue("Location")
                .orElseThrow(() -> new JenkinsException("Jenkins started " + job + " but did not say where it is queued"));
    }

    /** Waits until the queued build starts. */
    public BuildRef waitForStart(String queueUrl) {
        Instant deadline = Instant.now().plus(properties.queueTimeout());
        while (Instant.now().isBefore(deadline)) {
            JsonNode item = getJson(queueUrl.replaceAll("/+$", "") + "/api/json");
            if (item.path("cancelled").asBoolean(false)) {
                throw new JenkinsException("The build was cancelled in the Jenkins queue");
            }
            JsonNode executable = item.path("executable");
            if (executable.has("number")) {
                return new BuildRef(executable.path("number").asInt(), executable.path("url").asString());
            }
            sleep();
        }
        throw new JenkinsException("The build did not start within " + properties.queueTimeout()
                + "; Jenkins may be busy or the job may be waiting for an agent");
    }

    /** Waits until the build finishes and returns its result: SUCCESS, UNSTABLE, FAILURE or ABORTED. */
    public String waitForResult(BuildRef build) {
        Instant deadline = Instant.now().plus(properties.buildTimeout());
        while (Instant.now().isBefore(deadline)) {
            JsonNode node = getJson(build.url().replaceAll("/+$", "") + "/api/json?tree=building,result");
            if (!node.path("building").asBoolean(true) && !node.path("result").isNull() && node.has("result")) {
                return node.path("result").asString();
            }
            sleep();
        }
        throw new JenkinsException("Build " + build.number() + " did not finish within " + properties.buildTimeout());
    }

    /** The end of the build's console log. */
    public String console(BuildRef build) {
        HttpResponse<String> response = send(request(build.url().replaceAll("/+$", "") + "/consoleText").GET().build());
        if (response.statusCode() != 200) {
            return "";
        }
        String text = response.body();
        int max = (int) properties.maxLogSize().toBytes();
        return text.length() <= max ? text : text.substring(text.length() - max);
    }

    /** Failed test cases from the JUnit report, if the job publishes one. */
    public List<String> failedTests(BuildRef build) {
        HttpResponse<String> response = send(request(build.url().replaceAll("/+$", "")
                + "/testReport/api/json?tree=suites[cases[className,name,status,errorDetails]]").GET().build());
        if (response.statusCode() != 200) {
            return List.of();
        }
        List<String> failures = new ArrayList<>();
        for (JsonNode suite : JSON.readTree(response.body()).path("suites")) {
            for (JsonNode test : suite.path("cases")) {
                String status = test.path("status").asString();
                if ("FAILED".equals(status) || "REGRESSION".equals(status)) {
                    failures.add(test.path("className").asString() + "." + test.path("name").asString() + ": "
                            + firstLine(test.path("errorDetails").asString("")));
                }
            }
        }
        return failures;
    }

    // --- HTTP ---

    String jobUrl(String job) {
        StringBuilder url = new StringBuilder(baseUrl);
        for (String part : job.trim().split("/")) {
            if (!part.isBlank() && !part.equals("job")) {
                url.append("/job/").append(URLEncoder.encode(part, StandardCharsets.UTF_8).replace("+", "%20"));
            }
        }
        return url.toString();
    }

    private JsonNode getJson(String url) {
        HttpResponse<String> response = send(request(url).GET().build());
        if (response.statusCode() == 401 || response.statusCode() == 403) {
            throw new JenkinsException("Jenkins refused access (HTTP " + response.statusCode() + "). Check the username and API token.");
        }
        if (response.statusCode() == 404) {
            throw new JenkinsException("Not found in Jenkins: " + url);
        }
        if (response.statusCode() != 200) {
            throw new JenkinsException("Jenkins answered HTTP " + response.statusCode() + " for " + url);
        }
        return JSON.readTree(response.body());
    }

    private boolean loadCrumb() {
        HttpResponse<String> response = send(request(baseUrl + "/crumbIssuer/api/json").GET().build());
        if (response.statusCode() != 200) {
            return false;
        }
        JsonNode node = JSON.readTree(response.body());
        crumbField = node.path("crumbRequestField").asString();
        crumb = node.path("crumb").asString();
        return true;
    }

    private void addCrumb(HttpRequest.Builder request) {
        if (crumb != null) {
            request.setHeader(crumbField, crumb);
        }
    }

    private HttpRequest.Builder request(String url) {
        HttpRequest.Builder request = HttpRequest.newBuilder(URI.create(url)).timeout(properties.requestTimeout());
        if (authorization != null) {
            request.header("Authorization", authorization);
        }
        return request;
    }

    private HttpResponse<String> send(HttpRequest request) {
        try {
            return http.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
        } catch (IOException e) {
            throw new JenkinsException("Could not reach Jenkins at " + baseUrl + ": " + e.getMessage(), e);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new JenkinsException("Interrupted while talking to Jenkins", e);
        }
    }

    private void sleep() {
        try {
            Thread.sleep(properties.pollInterval().toMillis());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new JenkinsException("Interrupted while waiting for Jenkins", e);
        }
    }

    private static byte[] multipart(String boundary, Map<String, String> parameters, FileParameter file) {
        ByteArrayOutputStream body = new ByteArrayOutputStream();
        for (Map.Entry<String, String> parameter : parameters.entrySet()) {
            write(body, "--" + boundary + "\r\nContent-Disposition: form-data; name=\"" + parameter.getKey() + "\"\r\n\r\n"
                    + parameter.getValue() + "\r\n");
        }
        write(body, "--" + boundary + "\r\nContent-Disposition: form-data; name=\"" + file.name() + "\"; filename=\""
                + file.fileName() + "\"\r\nContent-Type: application/octet-stream\r\n\r\n");
        body.writeBytes(file.content());
        write(body, "\r\n--" + boundary + "--\r\n");
        return body.toByteArray();
    }

    private static void write(ByteArrayOutputStream out, String text) {
        out.writeBytes(text.getBytes(StandardCharsets.UTF_8));
    }

    private static String encode(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8);
    }

    private static String firstLine(String text) {
        if (text == null) {
            return "";
        }
        String line = text.strip().lines().findFirst().orElse("");
        return line.length() > 300 ? line.substring(0, 300) : line;
    }
}
