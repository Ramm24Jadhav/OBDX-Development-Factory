package com.obdx.factory.auth;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.nio.file.Path;
import java.util.Base64;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Sign-in, sessions, CSRF, lockout and workspace roles with local accounts, through the real security filters.
 * Runs when FACTORY_TEST_DB_URL is set.
 */
@SpringBootTest(properties = {"factory.auth.initial-admin-password=Admin-Password-1", "factory.auth.max-failed-logins=3"})
@AutoConfigureMockMvc
@EnabledIfEnvironmentVariable(named = "FACTORY_TEST_DB_URL", matches = ".+")
class SecurityIntegrationTest {

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

    @Autowired
    private MockMvc mvc;

    @Autowired
    private ObjectMapper json;

    @Autowired
    private UserDirectory directory;

    /** Other tests share the database and may have created "admin" first, with a random password. */
    @BeforeEach
    void knownAdminPassword() {
        directory.resetPassword(directory.find("admin").getId(), "Admin-Password-1");
    }

    @Test
    void protectsTheApiAndAppliesWorkspaceRoles() throws Exception {
        String suffix = UUID.randomUUID().toString().substring(0, 8);

        // Public: sign-in configuration, health and review links. Everything else needs a session.
        mvc.perform(get("/api/auth/config")).andExpect(status().isOk()).andExpect(jsonPath("$.mode").value("local"))
                .andExpect(jsonPath("$.version").hasJsonPath()).andExpect(jsonPath("$.environment").doesNotExist());
        mvc.perform(get("/actuator/health")).andExpect(status().isOk());
        mvc.perform(get("/api/review/not-a-token")).andExpect(status().isNotFound());
        mvc.perform(get("/api/workspaces")).andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.detail").value("Sign in to continue"));
        mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                .content("{\"username\": \"admin\", \"password\": \"Admin-Password-1\"}"))
                .andExpect(status().isForbidden());

        MockHttpSession admin = login("admin", "Admin-Password-1");
        mvc.perform(get("/api/auth/me").session(admin)).andExpect(jsonPath("$.admin").value(true));

        UUID bankA = UUID.fromString(create(admin, "/api/workspaces",
                "{\"name\": \"a-" + suffix + "\", \"bankName\": \"Bank A\", \"obdxVersion\": \"22.x\"}").get("id").asString());
        UUID bankB = UUID.fromString(create(admin, "/api/workspaces",
                "{\"name\": \"b-" + suffix + "\", \"bankName\": \"Bank B\", \"obdxVersion\": \"25.x\"}").get("id").asString());
        UUID analyst = UUID.fromString(create(admin, "/api/admin/users",
                "{\"username\": \"analyst-" + suffix + "\", \"displayName\": \"Asha\", \"password\": \"Analyst-Password-1\"}").get("id").asString());
        UUID developer = UUID.fromString(create(admin, "/api/admin/users",
                "{\"username\": \"dev-" + suffix + "\", \"password\": \"Developer-Password-1\"}").get("id").asString());
        mvc.perform(post("/api/admin/users").session(admin).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\": \"weak-" + suffix + "\", \"password\": \"short\"}"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.detail").value("Passwords need at least 12 characters"));
        setRole(admin, bankA, analyst, "ANALYST");
        setRole(admin, bankA, developer, "DEVELOPER");

        MockHttpSession asha = login("analyst-" + suffix, "Analyst-Password-1");
        mvc.perform(get("/api/auth/me").session(asha))
                .andExpect(jsonPath("$.displayName").value("Asha"))
                .andExpect(jsonPath("$.memberships[0].role").value("ANALYST"))
                .andExpect(jsonPath("$.memberships[0].permissions.length()").value(4));
        mvc.perform(get("/api/workspaces").session(asha))
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].id").value(bankA.toString()));
        mvc.perform(get("/api/workspaces/" + bankB).session(asha)).andExpect(status().isForbidden())
                .andExpect(jsonPath("$.detail").value("You are not a member of this workspace"));
        mvc.perform(put("/api/workspaces/" + bankA + "/svn").session(asha).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"svnUrl\": \"svn://svn.bank-a/obdx/trunk\"}"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.detail").value("Your role in this workspace (analyst) does not allow this"));
        mvc.perform(post("/api/workspaces").session(asha).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\": \"x\", \"bankName\": \"X\", \"obdxVersion\": \"22.x\"}"))
                .andExpect(status().isForbidden());
        mvc.perform(get("/api/admin/users").session(asha)).andExpect(status().isForbidden());
        mvc.perform(post("/api/auth/password").session(asha).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"currentPassword\": \"wrong\", \"newPassword\": \"Another-Password-1\"}"))
                .andExpect(status().isBadRequest());

        MockHttpSession dev = login("dev-" + suffix, "Developer-Password-1");
        mvc.perform(put("/api/workspaces/" + bankA + "/svn").session(dev).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"svnUrl\": \"svn://svn.bank-a/obdx/trunk\", \"svnUsername\": \"svc\"}"))
                .andExpect(status().isOk());

        // Sign-out ends the session.
        mvc.perform(post("/api/auth/logout").session(dev).with(csrf())).andExpect(status().isNoContent());
        mvc.perform(get("/api/auth/me").session(dev)).andExpect(status().isUnauthorized());

        // Disabled accounts cannot sign in; repeated wrong passwords lock the username.
        mvc.perform(put("/api/admin/users/" + developer).session(admin).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"enabled\": false}")).andExpect(status().isOk());
        loginExpect("dev-" + suffix, "Developer-Password-1", 403);
        for (int i = 0; i < 3; i++) {
            loginExpect("analyst-" + suffix, "wrong-password", 401);
        }
        loginExpect("analyst-" + suffix, "Analyst-Password-1", 429);

        JsonNode audit = json.readTree(mvc.perform(get("/api/admin/audit").session(admin)).andReturn().getResponse().getContentAsString());
        String actions = audit.toString();
        assertThat(actions).contains("WORKSPACE_CREATED", "USER_CREATED", "MEMBER_SET", "SVN_SETTINGS_CHANGED", "LOGIN_FAILED", "LOGIN");
        assertThat(actions).doesNotContain("Developer-Password-1");

        mvc.perform(delete("/api/workspaces/" + bankA).session(admin).with(csrf())).andExpect(status().isNoContent());
        mvc.perform(delete("/api/workspaces/" + bankB).session(admin).with(csrf())).andExpect(status().isNoContent());
    }

    /**
     * Review links over HTTP: the link opens without a session and shows nothing of the workspace but the screen; managing
     * links, resolving comments and the review history need the workspace's permissions; revoking ends the link at once;
     * the audit log records the link without its address.
     */
    @Test
    void reviewLinksShowOnlyTheirScreenAndAreManagedWithWorkspacePermissions() throws Exception {
        String suffix = UUID.randomUUID().toString().substring(0, 8);
        MockHttpSession admin = login("admin", "Admin-Password-1");
        UUID bankA = UUID.fromString(create(admin, "/api/workspaces",
                "{\"name\": \"ra-" + suffix + "\", \"bankName\": \"Bank A\", \"obdxVersion\": \"22.x\"}").get("id").asString());
        UUID bankB = UUID.fromString(create(admin, "/api/workspaces",
                "{\"name\": \"rb-" + suffix + "\", \"bankName\": \"Bank B\", \"obdxVersion\": \"22.x\"}").get("id").asString());
        UUID outsider = UUID.fromString(create(admin, "/api/admin/users",
                "{\"username\": \"outsider-" + suffix + "\", \"password\": \"Outsider-Password-1\"}").get("id").asString());
        setRole(admin, bankB, outsider, "LEAD");

        String designId = create(admin, "/api/workspaces/" + bankA + "/designs", "{\"name\": \"Transfer\"}").get("id").asString();
        mvc.perform(post("/api/designs/" + designId + "/comments").session(admin).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"text\": \"Internal note for the team\"}")).andExpect(status().isOk());
        String token = json.readTree(mvc.perform(post("/api/designs/" + designId + "/review-link").session(admin).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON).content("{\"days\": 3}")).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString()).get("reviewToken").asString();

        // Without a session: the screen and nothing else
        String review = mvc.perform(get("/api/review/" + token)).andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Transfer")).andExpect(jsonPath("$.comments.length()").value(0))
                .andReturn().getResponse().getContentAsString();
        assertThat(review).doesNotContain(bankA.toString(), designId, "reviewToken", "Internal note", "Administrator", "workspaceId");
        mvc.perform(get("/api/workspaces/" + bankA + "/review-history")).andExpect(status().isUnauthorized());

        // A member of another workspace can do nothing with this one's links
        MockHttpSession other = login("outsider-" + suffix, "Outsider-Password-1");
        mvc.perform(get("/api/workspaces/" + bankA + "/review-history").session(other)).andExpect(status().isForbidden());
        mvc.perform(delete("/api/designs/" + designId + "/review-link").session(other).with(csrf())).andExpect(status().isForbidden());
        mvc.perform(post("/api/designs/" + designId + "/review-link").session(other).with(csrf())).andExpect(status().isForbidden());
        String commentId = json.readTree(mvc.perform(get("/api/designs/" + designId).session(admin)).andReturn().getResponse().getContentAsString())
                .get("comments").get(0).get("id").asString();
        mvc.perform(put("/api/designs/" + designId + "/comments/" + commentId + "/resolved").session(other).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content("{\"resolved\": true}")).andExpect(status().isForbidden());
        mvc.perform(put("/api/designs/" + designId + "/comments/" + commentId + "/resolved").session(admin).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content("{\"resolved\": true}")).andExpect(status().isOk())
                .andExpect(jsonPath("$.comments[0].resolvedBy").isNotEmpty());

        // Revoked: gone at once, and recorded without the address
        mvc.perform(delete("/api/designs/" + designId + "/review-link").session(admin).with(csrf())).andExpect(status().isOk());
        mvc.perform(get("/api/review/" + token)).andExpect(status().isNotFound());
        String history = mvc.perform(get("/api/workspaces/" + bankA + "/review-history").session(admin)).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        assertThat(history).contains("REVIEW_LINK_CREATED", "REVIEW_LINK_CLOSED", "REVIEW_COMMENT_RESOLVED").doesNotContain(token);

        mvc.perform(delete("/api/workspaces/" + bankA).session(admin).with(csrf())).andExpect(status().isNoContent());
        mvc.perform(delete("/api/workspaces/" + bankB).session(admin).with(csrf())).andExpect(status().isNoContent());
    }

    @Test
    void showsEffectiveAccessAndRecordsPrivilegeChangesForAdministratorsOnly() throws Exception {
        String suffix = UUID.randomUUID().toString().substring(0, 8);
        MockHttpSession admin = login("admin", "Admin-Password-1");
        UUID bank = UUID.fromString(create(admin, "/api/workspaces",
                "{\"name\": \"p-" + suffix + "\", \"bankName\": \"Bank P\", \"obdxVersion\": \"22.x\"}").get("id").asString());
        UUID priya = UUID.fromString(create(admin, "/api/admin/users",
                "{\"username\": \"priya-" + suffix + "\", \"password\": \"Priya-Password-1\"}").get("id").asString());
        setRole(admin, bank, priya, "ANALYST");
        setRole(admin, bank, priya, "LEAD");

        // The matrix comes from the role definitions: an analyst may not manage code, a lead may approve
        JsonNode matrix = json.readTree(mvc.perform(get("/api/admin/permissions").session(admin)).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString());
        assertThat(matrix.toString()).contains("\"permission\":\"MANAGE_CODE\"");
        for (JsonNode row : matrix) {
            if (row.get("permission").asString().equals("MANAGE_CODE")) {
                assertThat(row.get("allowed").get("ANALYST").asBoolean()).isFalse();
                assertThat(row.get("allowed").get("ADMIN").asBoolean()).isTrue();
            }
            if (row.get("permission").asString().equals("APPROVE")) {
                assertThat(row.get("allowed").get("LEAD").asBoolean()).isTrue();
            }
        }

        // Effective access per workspace, and the history of the role changes with what they were
        JsonNode access = json.readTree(mvc.perform(get("/api/admin/users/" + priya + "/access").session(admin)).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString());
        assertThat(access.get("workspaces").get(0).get("role").asString()).isEqualTo("LEAD");
        assertThat(access.get("workspaces").get(0).get("denied").size()).isZero();
        assertThat(access.toString()).contains("LEAD (was ANALYST)", "ANALYST (new member)").doesNotContain("passwordHash", "Priya-Password-1");

        mvc.perform(put("/api/admin/users/" + priya).session(admin).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"admin\": true}")).andExpect(status().isOk());
        String history = mvc.perform(get("/api/admin/users/" + priya + "/access").session(admin)).andReturn().getResponse().getContentAsString();
        assertThat(history).contains("ADMIN_GRANTED", "false -> true");

        // Nobody else reads them
        mvc.perform(put("/api/admin/users/" + priya).session(admin).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"admin\": false}")).andExpect(status().isOk());
        MockHttpSession other = login("priya-" + suffix, "Priya-Password-1");
        mvc.perform(get("/api/admin/permissions").session(other)).andExpect(status().isForbidden());
        mvc.perform(get("/api/admin/users/" + priya + "/access").session(other)).andExpect(status().isForbidden());
        mvc.perform(get("/api/admin/security").session(other)).andExpect(status().isForbidden());
        mvc.perform(get("/api/admin/security").session(admin)).andExpect(status().isOk())
                .andExpect(jsonPath("$.maxFailedLogins").value(3)).andExpect(jsonPath("$.minPasswordLength").value(12));

        mvc.perform(delete("/api/workspaces/" + bank).session(admin).with(csrf())).andExpect(status().isNoContent());
    }

    private MockHttpSession login(String username, String password) throws Exception {
        MvcResult result = mvc.perform(post("/api/auth/login").with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\": \"" + username + "\", \"password\": \"" + password + "\"}"))
                .andExpect(status().isOk())
                .andReturn();
        return (MockHttpSession) result.getRequest().getSession();
    }

    private void loginExpect(String username, String password, int status) throws Exception {
        mvc.perform(post("/api/auth/login").with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\": \"" + username + "\", \"password\": \"" + password + "\"}"))
                .andExpect(status().is(status));
    }

    private JsonNode create(MockHttpSession session, String path, String body) throws Exception {
        String response = mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post(path)
                        .session(session).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return json.readTree(response);
    }

    private void setRole(MockHttpSession admin, UUID workspace, UUID user, String role) throws Exception {
        mvc.perform(put("/api/workspaces/" + workspace + "/members/" + user).session(admin).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON).content("{\"role\": \"" + role + "\"}"))
                .andExpect(status().isOk());
    }
}
