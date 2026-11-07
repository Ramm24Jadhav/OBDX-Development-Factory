package com.obdx.factory.jenkins;

import com.obdx.factory.auth.AccessGuard;
import com.obdx.factory.auth.AuditLog;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;
import java.util.UUID;

import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Each Jenkins connection test is recorded, so the Integrations page shows the last result rather than the saved settings. */
@WebMvcTest(JenkinsController.class)
@WithMockUser
class JenkinsControllerTest {

    @Autowired
    private MockMvc mvc;

    @MockitoBean
    private JenkinsSettingsService service;

    @MockitoBean
    private AccessGuard guard;

    @MockitoBean
    private AuditLog audit;

    @Test
    void recordsPassedWarningAndFailedTests() throws Exception {
        UUID id = UUID.randomUUID();
        JenkinsClient.JobInfo job = new JenkinsClient.JobInfo("obdx-build", "https://jenkins.bank.local/job/obdx-build/", List.of("BRANCH"));

        when(service.test(id)).thenReturn(new JenkinsSettingsService.ConnectionResult(List.of(job), List.of()));
        mvc.perform(post("/api/workspaces/" + id + "/jenkins/test").with(csrf())).andExpect(status().isOk());
        verify(audit).record("JENKINS_TEST_PASSED", id, null, "1 job");

        when(service.test(id)).thenReturn(new JenkinsSettingsService.ConnectionResult(List.of(job, job), List.of("Job obdx-build has no build parameter.")));
        mvc.perform(post("/api/workspaces/" + id + "/jenkins/test").with(csrf())).andExpect(status().isOk());
        verify(audit).record("JENKINS_TEST_WARNING", id, null, "2 jobs. Job obdx-build has no build parameter.");

        when(service.test(id)).thenThrow(new JenkinsException("Jenkins refused access (HTTP 401). Check the username and API token."));
        mvc.perform(post("/api/workspaces/" + id + "/jenkins/test").with(csrf())).andExpect(status().isBadGateway());
        verify(audit).record("JENKINS_TEST_FAILED", id, null, "Jenkins refused access (HTTP 401). Check the username and API token.");
    }
}
