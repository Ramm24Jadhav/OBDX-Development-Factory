package com.obdx.factory.issue;

import com.obdx.factory.auth.UserDirectory;
import com.obdx.factory.model.ModelGateway;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Issue Analyzer through the real security filters: an analyst files an issue with a log and a screenshot, the canned
 * models read and diagnose it, the outcome is recorded, a lead shares the fix, and another workspace's issue finds it.
 * Runs when FACTORY_TEST_DB_URL is set.
 */
@SpringBootTest(properties = "factory.auth.initial-admin-password=Admin-Password-1")
@AutoConfigureMockMvc
@EnabledIfEnvironmentVariable(named = "FACTORY_TEST_DB_URL", matches = ".+")
class IssueFlowIntegrationTest {

    @TempDir
    static Path temp;

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", () -> System.getenv("FACTORY_TEST_DB_URL"));
        registry.add("spring.datasource.username", () -> System.getenv().getOrDefault("FACTORY_TEST_DB_USER", "factory"));
        registry.add("spring.datasource.password", () -> System.getenv().getOrDefault("FACTORY_TEST_DB_PASSWORD", "factory"));
        registry.add("factory.storage.root", () -> temp.resolve("data").toString());
        registry.add("factory.security.secret-key", () -> Base64.getEncoder().encodeToString(new byte[32]));
    }

    static final String DIAGNOSIS = """
            {"category": "DEPENDENCY", "state": "PROBABLE", "summary": "The payment host refuses connections.",
             "rootCause": "The payment host at the configured address is not running", "evidence": ["E1", "E77"],
             "steps": [{"action": "Check that the payment host is running", "risk": "LOW", "evidence": ["E1"], "audience": "ADMIN"},
                       {"action": "Read the WebLogic log around the error", "risk": "LOW", "audience": "ENGINEER"}],
             "oracleReferences": [{"id": "O1", "why": "The note describes this refused connection"}]}
            """;
    static final String ANSWER = "Because E1 shows the payment host refuses the connection.";

    @TestConfiguration
    static class CannedModels {
        @Bean
        @Primary
        ModelGateway cannedModelGateway() {
            return new ModelGateway() {
                @Override
                public ChatResult chat(String systemPrompt, String userPrompt) {
                    return new ChatResult(ANSWER, "canned", 0);
                }

                @Override
                public ChatResult chatJson(String systemPrompt, String userPrompt) {
                    return new ChatResult(DIAGNOSIS, "canned", 0);
                }

                @Override
                public ChatResult chatJsonWithImage(String systemPrompt, String userPrompt, byte[] image, String mimeType) {
                    return new ChatResult("{\"errorText\": \"Transfer could not be completed\", \"screen\": \"Own Account Transfer\"}", "canned", 0);
                }

                @Override
                public float[] embed(String text) {
                    return new float[]{1, 0};
                }

                @Override
                public List<float[]> embedAll(List<String> texts) {
                    return texts.stream().map(this::embed).toList();
                }
            };
        }
    }

    private static final byte[] PNG = {(byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A};
    private static final String LOG = """
            2026-11-06 10:15:02 ERROR Transfer failed, db.password=Welcome#123
            java.net.ConnectException: Connection refused
                at com.bank.obdx.payments.FundTransferService.transfer(FundTransferService.java:142)
            """;

    @Autowired
    private MockMvc mvc;

    @Autowired
    private ObjectMapper json;

    @Autowired
    private UserDirectory directory;

    @BeforeEach
    void knownAdminPassword() {
        directory.resetPassword(directory.find("admin").getId(), "Admin-Password-1");
    }

    @Test
    void filesDiagnosesResolvesSharesAndFindsSharedKnowledge() throws Exception {
        String suffix = UUID.randomUUID().toString().substring(0, 8);
        MockHttpSession admin = login("admin", "Admin-Password-1");
        UUID bankA = UUID.fromString(send(admin, "/api/workspaces",
                "{\"name\": \"issues-a-" + suffix + "\", \"bankName\": \"Alpha Bank\", \"obdxVersion\": \"22.x\"}", 201).get("id").asString());
        UUID bankB = UUID.fromString(send(admin, "/api/workspaces",
                "{\"name\": \"issues-b-" + suffix + "\", \"bankName\": \"Beta Bank\", \"obdxVersion\": \"22.x\"}", 201).get("id").asString());
        try {
            UUID analyst = UUID.fromString(send(admin, "/api/admin/users",
                    "{\"username\": \"issue-analyst-" + suffix + "\", \"password\": \"Analyst-Password-1\"}", 201).get("id").asString());
            mvc.perform(put("/api/workspaces/" + bankA + "/members/" + analyst).session(admin).with(csrf())
                    .contentType(MediaType.APPLICATION_JSON).content("{\"role\": \"ANALYST\"}")).andExpect(status().isOk());
            MockHttpSession asha = login("issue-analyst-" + suffix, "Analyst-Password-1");

            // An analyst (any member) files an issue with a log and a screenshot; analysis starts at once.
            JsonNode created = json.readTree(mvc.perform(multipart("/api/workspaces/" + bankA + "/issues").session(asha).with(csrf())
                            .file(new MockMultipartFile("files", "server.log", "text/plain", LOG.getBytes(StandardCharsets.UTF_8)))
                            .file(new MockMultipartFile("files", "error.png", "image/png", PNG))
                            .param("description", "Own account transfer fails with a technical error")
                            .param("environment", "uat"))
                    .andExpect(status().isAccepted())
                    .andReturn().getResponse().getContentAsString());
            String issue = "/api/workspaces/" + bankA + "/issues/" + created.get("id").asString();
            assertThat(created.get("title").asString()).isEqualTo("Own account transfer fails with a technical error");
            assertThat(created.get("environment").asString()).isEqualTo("UAT");

            JsonNode diagnosed = waitFor(asha, issue, "DIAGNOSED");
            assertThat(diagnosed.at("/diagnosis/category").asString()).isEqualTo("DEPENDENCY");
            assertThat(diagnosed.at("/diagnosis/evidence").toString()).isEqualTo("[\"E1\"]");
            assertThat(diagnosed.at("/files/1/extractedText").asString()).contains("Transfer could not be completed");
            assertThat(diagnosed.at("/evidence/items").toString()).contains("SCREENSHOT", "java.net.ConnectException");
            mvc.perform(get(issue + "/files/1").session(asha)).andExpect(status().isOk());

            // Members of other workspaces see nothing.
            mvc.perform(get("/api/workspaces/" + bankB + "/issues").session(asha)).andExpect(status().isForbidden());
            mvc.perform(get("/api/workspaces/" + bankB + "/issues/" + created.get("id").asString()).session(admin))
                    .andExpect(status().isNotFound());

            // The SR draft is masked.
            String sr = send(asha, issue + "/sr-draft", "", 200).get("srDraft").asString();
            assertThat(sr).contains("## Error details", "java.net.ConnectException").doesNotContain("Welcome#123");

            // Resolving needs what fixed it; only leads share and delete.
            send(asha, issue + "/outcome", "{\"status\": \"RESOLVED\"}", 400);
            send(asha, issue + "/outcome", "{\"status\": \"RESOLVED\", \"resolution\": \"Started the payment host\"}", 200);
            String share = "{\"title\": \"Payment host down\", \"category\": \"DEPENDENCY\", \"rootCause\": \"The payment host was not running\", "
                    + "\"resolution\": \"Start the payment host\"}";
            send(asha, issue + "/share", share, 403);
            mvc.perform(delete(issue).session(asha).with(csrf())).andExpect(status().isForbidden());
            send(admin, issue + "/share", share.replace("Start the payment host", "Start it at http://pay.alpha:8080 for Alpha Bank"), 400);
            JsonNode shared = send(admin, issue + "/share", share, 200);
            send(admin, issue + "/share", share, 400);

            // The same error in another bank's workspace finds the shared fix, without the first bank's data.
            JsonNode other = json.readTree(mvc.perform(multipart("/api/workspaces/" + bankB + "/issues").session(admin).with(csrf())
                            .param("logText", LOG))
                    .andExpect(status().isAccepted()).andReturn().getResponse().getContentAsString());
            JsonNode otherDiagnosed = waitFor(admin, "/api/workspaces/" + bankB + "/issues/" + other.get("id").asString(), "DIAGNOSED");
            assertThat(otherDiagnosed.at("/diagnosis/similar/0/title").asString()).isEqualTo("Payment host down");
            assertThat(otherDiagnosed.at("/diagnosis/similar/0/shared").asBoolean()).isTrue();
            assertThat(otherDiagnosed.at("/diagnosis/similar/0/issueId").isNull()).isTrue();

            JsonNode knowledge = json.readTree(mvc.perform(get("/api/issue-knowledge").session(asha)).andReturn().getResponse().getContentAsString());
            assertThat(knowledge.toString()).contains("Payment host down").doesNotContain(bankA.toString());
            mvc.perform(delete("/api/issue-knowledge/" + shared.get("id").asString()).session(asha).with(csrf())).andExpect(status().isForbidden());
            mvc.perform(delete("/api/issue-knowledge/" + shared.get("id").asString()).session(admin).with(csrf())).andExpect(status().isNoContent());
        } finally {
            mvc.perform(delete("/api/workspaces/" + bankA).session(admin).with(csrf()));
            mvc.perform(delete("/api/workspaces/" + bankB).session(admin).with(csrf()));
        }
    }

    @Test
    void bankReportsFollowsAndChecksAFixWithAnOracleNoteGroupedAndAnswered() throws Exception {
        String suffix = UUID.randomUUID().toString().substring(0, 8);
        MockHttpSession admin = login("admin", "Admin-Password-1");
        UUID bank = UUID.fromString(send(admin, "/api/workspaces",
                "{\"name\": \"issues-c-" + suffix + "\", \"bankName\": \"Gamma Bank\", \"obdxVersion\": \"22.x\"}", 201).get("id").asString());
        String noteId = null;
        try {
            // An Oracle support note in the Library, shared with every workspace
            JsonNode imported = json.readTree(mvc.perform(multipart("/api/knowledge/documents").session(admin).with(csrf())
                            .file(new MockMultipartFile("file", "payment-host-" + suffix + ".txt", "text/plain", ("Payments: java.net.ConnectException: "
                                    + "Connection refused when the payment host is down. Workaround: start the payment host. " + suffix).getBytes(StandardCharsets.UTF_8)))
                            .param("obdxVersion", "22.2").param("kind", "ORACLE_NOTE").param("reference", "Doc ID 2345678.1"))
                    .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
            noteId = imported.at("/queued/0/id").asString();
            waitForDocument(admin, noteId);

            // A lead makes an issue link; the bank reports through it without signing in
            JsonNode link = send(admin, "/api/workspaces/" + bank + "/issue-links", "{\"label\": \"Gamma admins\", \"days\": 7}", 200);
            String token = link.get("token").asString();
            mvc.perform(get("/api/issue-report/" + token)).andExpect(status().isOk()).andExpect(jsonPath("$.bankName").value("Gamma Bank"));
            mvc.perform(multipart("/api/issue-report/" + token).with(csrf()).param("description", "Transfers fail")).andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.detail").value("Enter your name, so the support team knows who reported it"));
            JsonNode reported = json.readTree(mvc.perform(multipart("/api/issue-report/" + token).with(csrf())
                            .file(new MockMultipartFile("files", "server.log", "text/plain", LOG.getBytes(StandardCharsets.UTF_8)))
                            .param("name", "Priya").param("email", "priya@gamma.example").param("description", "Transfers fail with a technical error"))
                    .andExpect(status().isAccepted()).andReturn().getResponse().getContentAsString());
            String follow = "/api/issue-follow/" + reported.get("followToken").asString();

            JsonNode issues = json.readTree(mvc.perform(get("/api/workspaces/" + bank + "/issues").session(admin)).andReturn().getResponse().getContentAsString());
            String issue = "/api/workspaces/" + bank + "/issues/" + issues.get(0).get("id").asString();
            JsonNode diagnosed = waitFor(admin, issue, "DIAGNOSED");
            assertThat(diagnosed.get("source").asString()).isEqualTo("BANK");
            assertThat(diagnosed.get("createdBy").asString()).isEqualTo("bank: Priya");
            assertThat(diagnosed.at("/diagnosis/oracleReferences/0/reference").asString()).isEqualTo("Doc ID 2345678.1");
            assertThat(diagnosed.at("/diagnosis/oracleReferences/0/documentId").asString()).isEqualTo(noteId);

            // Nothing is shown to the bank until an engineer releases it; then only the summary and the bank's steps
            JsonNode before = json.readTree(mvc.perform(get(follow)).andReturn().getResponse().getContentAsString());
            assertThat(before.get("released").asBoolean()).isFalse();
            assertThat(before.get("summary").isNull()).isTrue();
            assertThat(before.get("steps").size()).isZero();
            send(admin, issue + "/release", "", 200);
            JsonNode after = json.readTree(mvc.perform(get(follow)).andReturn().getResponse().getContentAsString());
            assertThat(after.get("summary").asString()).isEqualTo("The payment host refuses connections.");
            assertThat(after.get("steps").size()).isEqualTo(1);
            assertThat(after.toString()).doesNotContain("WebLogic", "E1", "server.log", "FundTransferService");

            // The bank says it still fails with a new log: the factory compares it with the original error
            mvc.perform(multipart(follow + "/still-failing").with(csrf()).param("name", "Priya").param("logText", LOG)).andExpect(status().isOk());
            assertThat(waitForCheck(admin, issue, 0).get("result").asString()).isEqualTo("STILL_FAILING");
            // An engineer checks again after the real fix
            mvc.perform(multipart(issue + "/checks").session(admin).with(csrf()).param("logText", "2026-11-06 12:00:00 INFO Transfer TX-9 completed"))
                    .andExpect(status().isAccepted());
            assertThat(waitForCheck(admin, issue, 1).get("result").asString()).isEqualTo("ERROR_GONE");
            mvc.perform(post(follow + "/works").with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{\"name\": \"Priya\"}"))
                    .andExpect(status().isOk()).andExpect(jsonPath("$.checks.length()").value(3));

            // A question about the issue
            send(admin, issue + "/questions", "{\"text\": \"Why is it the payment host?\"}", 202);
            JsonNode answered = waitForAnswer(admin, issue);
            assertThat(answered.get("answer").asString()).isEqualTo(ANSWER);

            // The same error filed again the same day joins a group
            JsonNode again = json.readTree(mvc.perform(multipart("/api/workspaces/" + bank + "/issues").session(admin).with(csrf()).param("logText", LOG))
                    .andExpect(status().isAccepted()).andReturn().getResponse().getContentAsString());
            JsonNode grouped = waitFor(admin, "/api/workspaces/" + bank + "/issues/" + again.get("id").asString(), "DIAGNOSED");
            assertThat(grouped.get("groupId").asString()).isEqualTo(issues.get(0).get("id").asString());
            assertThat(grouped.get("group").size()).isEqualTo(1);
            send(admin, issue + "/group-outcome", "{\"status\": \"RESOLVED\", \"resolution\": \"Started the payment host\"}", 200);
            JsonNode list = json.readTree(mvc.perform(get("/api/workspaces/" + bank + "/issues").session(admin)).andReturn().getResponse().getContentAsString());
            assertThat(list.size()).isEqualTo(2);
            list.forEach(row -> assertThat(row.get("status").asString()).isEqualTo("RESOLVED"));

            // A revoked link stops working; the follow link keeps working
            mvc.perform(delete("/api/workspaces/" + bank + "/issue-links/" + link.at("/link/id").asString()).session(admin).with(csrf()))
                    .andExpect(status().isNoContent());
            mvc.perform(get("/api/issue-report/" + token)).andExpect(status().isNotFound());
            mvc.perform(get(follow)).andExpect(status().isOk()).andExpect(jsonPath("$.statusText").value("Resolved"));
            mvc.perform(get("/api/issue-follow/not-a-token")).andExpect(status().isNotFound());
        } finally {
            if (noteId != null) {
                mvc.perform(delete("/api/knowledge/documents/" + noteId).session(admin).with(csrf()));
            }
            mvc.perform(delete("/api/workspaces/" + bank).session(admin).with(csrf()));
        }
    }

    @Test
    void notifiesTheFilerAndLeadsAndGuardsLiveChecks() throws Exception {
        String suffix = UUID.randomUUID().toString().substring(0, 8);
        MockHttpSession admin = login("admin", "Admin-Password-1");
        UUID bank = UUID.fromString(send(admin, "/api/workspaces",
                "{\"name\": \"issues-d-" + suffix + "\", \"bankName\": \"Delta Bank\", \"obdxVersion\": \"22.x\"}", 201).get("id").asString());
        try {
            UUID dev = UUID.fromString(send(admin, "/api/admin/users",
                    "{\"username\": \"issue-dev-" + suffix + "\", \"password\": \"Developer-Password-1\"}", 201).get("id").asString());
            UUID analyst = UUID.fromString(send(admin, "/api/admin/users",
                    "{\"username\": \"issue-an-" + suffix + "\", \"password\": \"Analyst-Password-1\"}", 201).get("id").asString());
            mvc.perform(put("/api/workspaces/" + bank + "/members/" + dev).session(admin).with(csrf())
                    .contentType(MediaType.APPLICATION_JSON).content("{\"role\": \"DEVELOPER\"}")).andExpect(status().isOk());
            mvc.perform(put("/api/workspaces/" + bank + "/members/" + analyst).session(admin).with(csrf())
                    .contentType(MediaType.APPLICATION_JSON).content("{\"role\": \"ANALYST\"}")).andExpect(status().isOk());
            MockHttpSession devSession = login("issue-dev-" + suffix, "Developer-Password-1");
            MockHttpSession analystSession = login("issue-an-" + suffix, "Analyst-Password-1");

            // A developer files a production issue whose log names the factory's own machine
            String log = LOG + "Calling https://localhost:8443/pay failed\n";
            JsonNode created = json.readTree(mvc.perform(multipart("/api/workspaces/" + bank + "/issues").session(devSession).with(csrf())
                            .file(new MockMultipartFile("files", "error.png", "image/png", PNG))
                            .param("logText", log).param("environment", "PROD"))
                    .andExpect(status().isAccepted()).andReturn().getResponse().getContentAsString());
            String issue = "/api/workspaces/" + bank + "/issues/" + created.get("id").asString();
            waitFor(devSession, issue, "DIAGNOSED");

            // The filer and the lead are told; another member is not
            String events = "/api/workspaces/" + bank + "/issue-events";
            mvc.perform(get(events).session(devSession)).andExpect(jsonPath("$[0].kind").value("ANALYZED"));
            mvc.perform(get(events).session(admin)).andExpect(jsonPath("$.length()").value(1));
            mvc.perform(get(events).session(analystSession)).andExpect(jsonPath("$.length()").value(0));

            // Live checks: only targets of the issue, PROD needs a lead, the factory's own machine is refused
            mvc.perform(get(issue + "/live-targets").session(devSession)).andExpect(status().isOk())
                    .andExpect(jsonPath("$[0].host").value("localhost")).andExpect(jsonPath("$[0].port").value(8443));
            mvc.perform(get(issue + "/live-targets").session(analystSession)).andExpect(status().isForbidden());
            send(devSession, issue + "/live-checks", "{\"host\": \"localhost\", \"port\": 8443}", 403);
            send(admin, issue + "/live-checks", "{\"host\": \"example.org\", \"port\": 443}", 400);
            mvc.perform(post(issue + "/live-checks").session(admin).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                            .content("{\"host\": \"localhost\", \"port\": 8443}"))
                    .andExpect(status().isBadRequest()).andExpect(jsonPath("$.detail").value(org.hamcrest.Matchers.containsString("not checked")));

            // A screenshot can be removed (the canned model is not local, so nothing was blurred)
            JsonNode before = json.readTree(mvc.perform(get(issue).session(devSession)).andReturn().getResponse().getContentAsString());
            assertThat(before.at("/files/0/hiddenAreas").isNull()).isTrue();
            mvc.perform(delete(issue + "/files/0").session(devSession).with(csrf())).andExpect(status().isOk())
                    .andExpect(jsonPath("$.files.length()").value(0));
        } finally {
            mvc.perform(delete("/api/workspaces/" + bank).session(admin).with(csrf()));
        }
    }

    private void waitForDocument(MockHttpSession admin, String id) throws Exception {
        Instant deadline = Instant.now().plus(Duration.ofSeconds(60));
        while (true) {
            JsonNode overview = json.readTree(mvc.perform(get("/api/knowledge").session(admin)).andReturn().getResponse().getContentAsString());
            for (JsonNode d : overview.get("documents")) {
                if (d.get("id").asString().equals(id)) {
                    assertThat(d.get("status").asString()).as(d.toString()).isNotEqualTo("FAILED");
                    if (d.get("status").asString().equals("READY")) {
                        assertThat(d.get("kind").asString()).isEqualTo("ORACLE_NOTE");
                        return;
                    }
                }
            }
            assertThat(Instant.now()).as("document not read in time").isBefore(deadline);
            Thread.sleep(300);
        }
    }

    private JsonNode waitForCheck(MockHttpSession session, String issue, int index) throws Exception {
        Instant deadline = Instant.now().plus(Duration.ofSeconds(30));
        while (true) {
            JsonNode checks = json.readTree(mvc.perform(get(issue).session(session)).andReturn().getResponse().getContentAsString()).get("checks");
            if (checks.size() > index && !checks.get(index).get("result").asString().equals("CHECKING")) {
                return checks.get(index);
            }
            assertThat(Instant.now()).as("check still running").isBefore(deadline);
            Thread.sleep(200);
        }
    }

    private JsonNode waitForAnswer(MockHttpSession session, String issue) throws Exception {
        Instant deadline = Instant.now().plus(Duration.ofSeconds(30));
        while (true) {
            JsonNode questions = json.readTree(mvc.perform(get(issue).session(session)).andReturn().getResponse().getContentAsString()).get("questions");
            if (questions.size() > 0 && !questions.get(0).get("status").asString().equals("ANSWERING")) {
                assertThat(questions.get(0).get("status").asString()).isEqualTo("ANSWERED");
                return questions.get(0);
            }
            assertThat(Instant.now()).as("answer still running").isBefore(deadline);
            Thread.sleep(200);
        }
    }

    private JsonNode waitFor(MockHttpSession session, String path, String status) throws Exception {
        Instant deadline = Instant.now().plus(Duration.ofSeconds(30));
        while (true) {
            JsonNode detail = json.readTree(mvc.perform(get(path).session(session)).andReturn().getResponse().getContentAsString());
            if (detail.get("status").asString().equals(status)) {
                return detail;
            }
            assertThat(detail.get("status").asString()).as(detail.toString()).isIn("ANALYZING", status);
            assertThat(Instant.now()).as("issue still " + detail.get("status")).isBefore(deadline);
            Thread.sleep(200);
        }
    }

    private MockHttpSession login(String username, String password) throws Exception {
        return (MockHttpSession) mvc.perform(post("/api/auth/login").with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\": \"" + username + "\", \"password\": \"" + password + "\"}"))
                .andExpect(status().isOk()).andReturn().getRequest().getSession();
    }

    private JsonNode send(MockHttpSession session, String path, String body, int expected) throws Exception {
        String response = mvc.perform(post(path).session(session).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().is(expected)).andReturn().getResponse().getContentAsString();
        return response.isEmpty() ? null : json.readTree(response);
    }
}
