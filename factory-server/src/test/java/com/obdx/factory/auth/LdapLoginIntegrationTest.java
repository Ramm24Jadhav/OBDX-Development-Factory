package com.obdx.factory.auth;

import com.unboundid.ldap.listener.InMemoryDirectoryServer;
import com.unboundid.ldap.listener.InMemoryDirectoryServerConfig;
import com.unboundid.ldap.listener.InMemoryListenerConfig;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import java.nio.file.Path;
import java.util.Base64;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Sign-in against an LDAP directory (an in-memory server standing in for the bank's Active Directory).
 * Runs when FACTORY_TEST_DB_URL is set.
 */
@SpringBootTest(properties = {"factory.auth.mode=ldap", "factory.auth.admin-users=priya",
        "factory.auth.ldap.user-search-base=ou=people,dc=bank,dc=local", "factory.auth.ldap.user-search-filter=(uid={0})",
        "factory.auth.ldap.manager-dn=cn=reader,dc=bank,dc=local", "factory.auth.ldap.manager-password=reader-pass"})
@AutoConfigureMockMvc
@EnabledIfEnvironmentVariable(named = "FACTORY_TEST_DB_URL", matches = ".+")
class LdapLoginIntegrationTest {

    @TempDir
    static Path temp;

    static InMemoryDirectoryServer ldap;

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) throws Exception {
        InMemoryDirectoryServerConfig config = new InMemoryDirectoryServerConfig("dc=bank,dc=local");
        config.setListenerConfigs(InMemoryListenerConfig.createLDAPConfig("default", 0));
        config.addAdditionalBindCredentials("cn=reader,dc=bank,dc=local", "reader-pass");
        ldap = new InMemoryDirectoryServer(config);
        ldap.add("dn: dc=bank,dc=local", "objectClass: top", "objectClass: domain", "dc: bank");
        ldap.add("dn: ou=people,dc=bank,dc=local", "objectClass: top", "objectClass: organizationalUnit", "ou: people");
        ldap.add("dn: uid=priya,ou=people,dc=bank,dc=local", "objectClass: top", "objectClass: inetOrgPerson",
                "uid: priya", "cn: Priya Sharma", "sn: Sharma", "displayName: Priya Sharma", "mail: priya@bank.local",
                "userPassword: Directory-Pass-1");
        ldap.add("dn: uid=ravi,ou=people,dc=bank,dc=local", "objectClass: top", "objectClass: inetOrgPerson",
                "uid: ravi", "cn: Ravi Kumar", "sn: Kumar", "displayName: Ravi Kumar", "userPassword: Directory-Pass-2");
        ldap.startListening();

        registry.add("factory.auth.ldap.url", () -> "ldap://localhost:" + ldap.getListenPort());
        registry.add("spring.datasource.url", () -> System.getenv("FACTORY_TEST_DB_URL"));
        registry.add("spring.datasource.username", () -> System.getenv().getOrDefault("FACTORY_TEST_DB_USER", "factory"));
        registry.add("spring.datasource.password", () -> System.getenv().getOrDefault("FACTORY_TEST_DB_PASSWORD", "factory"));
        registry.add("factory.storage.root", () -> temp.resolve("data").toString());
        registry.add("factory.security.secret-key", () -> Base64.getEncoder().encodeToString(new byte[32]));
    }

    @AfterAll
    static void stop() {
        ldap.shutDown(true);
    }

    @Autowired
    private MockMvc mvc;

    @Autowired
    private AppUserRepository users;

    @Test
    void signsInWithDirectoryCredentials() throws Exception {
        login("Priya", "Directory-Pass-1")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.username").value("priya"))
                .andExpect(jsonPath("$.displayName").value("Priya Sharma"))
                .andExpect(jsonPath("$.email").value("priya@bank.local"))
                .andExpect(jsonPath("$.admin").value(true))
                .andExpect(jsonPath("$.source").value("LDAP"))
                .andExpect(jsonPath("$.canChangePassword").value(false));

        login("ravi", "Directory-Pass-2").andExpect(jsonPath("$.admin").value(false));
        login("ravi", "wrong").andExpect(status().isUnauthorized());
        login("nobody", "Directory-Pass-2").andExpect(status().isUnauthorized());

        assertThat(users.findByUsername("ravi")).hasValueSatisfying(user -> {
            assertThat(user.getSource()).isEqualTo(AppUser.Source.LDAP);
            assertThat(user.getPasswordHash()).isNull();
        });
    }

    private org.springframework.test.web.servlet.ResultActions login(String username, String password) throws Exception {
        return mvc.perform(post("/api/auth/login").with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"username\": \"" + username + "\", \"password\": \"" + password + "\"}"));
    }
}
