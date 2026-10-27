package com.obdx.factory.jenkins;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.util.unit.DataSize;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class JenkinsClientTest {

    private final JenkinsProperties properties = new JenkinsProperties(Duration.ofMillis(20), Duration.ofSeconds(5),
            Duration.ofSeconds(5), Duration.ofSeconds(5), 2, DataSize.ofKilobytes(300));
    private StubJenkins jenkins;

    @BeforeEach
    void start() throws Exception {
        jenkins = new StubJenkins();
    }

    @AfterEach
    void stop() {
        jenkins.close();
    }

    @Test
    void runsParameterizedBuildInAFolderJob() {
        jenkins.script("obdx/backend build", new StubJenkins.Outcome("FAILURE", "[INFO] Compiling\n[ERROR] /w/A.java:[3,5] cannot find symbol\nBUILD FAILURE",
                List.<String[]>of(new String[]{"com.bank.ATest", "rejectsLongRemarks", "expected exception"})));
        JenkinsClient client = new JenkinsClient(jenkins.url() + "/", "factory", "api-token", properties);

        JenkinsClient.JobInfo job = client.job("obdx/backend build");
        assertThat(job.name()).isEqualTo("backend build");
        assertThat(job.parameters()).containsExactly("BRANCH");

        String queue = client.trigger("obdx/backend build", Map.of("BRANCH", "branches/factory/cr-1"), null);
        JenkinsClient.BuildRef build = client.waitForStart(queue);
        assertThat(client.waitForResult(build)).isEqualTo("FAILURE");
        assertThat(client.console(build)).contains("cannot find symbol");
        assertThat(client.failedTests(build)).containsExactly("com.bank.ATest.rejectsLongRemarks: expected exception");

        StubJenkins.Trigger trigger = jenkins.triggers.getFirst();
        assertThat(trigger.body()).isEqualTo("BRANCH=branches%2Ffactory%2Fcr-1");
        assertThat(trigger.crumb()).as("crumb fetched after the first 403").isEqualTo("c-123");
    }

    @Test
    void sendsPatchAsFileParameter() {
        jenkins.parameters.add("PATCH");
        JenkinsClient client = new JenkinsClient(jenkins.url(), "factory", "api-token", properties);

        JenkinsClient.BuildRef build = client.waitForStart(client.trigger("ui", Map.of("NOTE", "x"),
                new JenkinsClient.FileParameter("PATCH", "change.patch", "Index: a.js\n".getBytes(StandardCharsets.UTF_8))));

        assertThat(client.waitForResult(build)).isEqualTo("SUCCESS");
        assertThat(client.failedTests(build)).isEmpty();
        StubJenkins.Trigger trigger = jenkins.triggers.getFirst();
        assertThat(trigger.contentType()).startsWith("multipart/form-data; boundary=");
        assertThat(trigger.body()).contains("name=\"NOTE\"", "name=\"PATCH\"; filename=\"change.patch\"", "Index: a.js");
    }

    @Test
    void explainsAccessAndConnectionProblems() {
        assertThatThrownBy(() -> new JenkinsClient(jenkins.url(), "factory", "wrong", properties).job("backend"))
                .isInstanceOf(JenkinsException.class).hasMessageContaining("Check the username and API token");
        assertThatThrownBy(() -> new JenkinsClient("http://127.0.0.1:1", "factory", "api-token", properties).job("backend"))
                .isInstanceOf(JenkinsException.class).hasMessageContaining("Could not reach Jenkins");
    }
}
