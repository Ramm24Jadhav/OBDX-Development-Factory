package com.obdx.factory.auth;

import com.obdx.factory.workspace.WorkspaceRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Optional;

import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** The Integrations page shows when the directory (LDAP) last let someone sign in: a recorded result, not the settings. */
@WebMvcTest(AdminController.class)
@WithMockUser
class LastSignInTest {

    @Autowired
    private MockMvc mvc;

    @MockitoBean
    private AccessGuard guard;

    @MockitoBean
    private UserDirectory directory;

    @MockitoBean
    private MembershipRepository memberships;

    @MockitoBean
    private WorkspaceRepository workspaces;

    @MockitoBean
    private AuditLog audit;

    @Test
    void returnsTheLastRecordedSignInOfTheSourceForAdministrators() throws Exception {
        OffsetDateTime at = OffsetDateTime.of(2026, 11, 2, 9, 30, 0, 0, ZoneOffset.UTC);
        when(audit.latest("LOGIN", "LDAP")).thenReturn(Optional.of(new AuditLog.Event(3, at, "jdoe", "LOGIN", null, null, "LDAP")));
        when(audit.latest("LOGIN", "SAML")).thenReturn(Optional.empty());

        mvc.perform(get("/api/admin/last-sign-in").param("source", "LDAP"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.source").value("LDAP"))
                .andExpect(jsonPath("$.at").value(org.hamcrest.Matchers.startsWith("2026-11-02T09:30")))
                .andExpect(jsonPath("$.username").doesNotExist());
        mvc.perform(get("/api/admin/last-sign-in").param("source", "SAML"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.at").doesNotExist());
        verify(guard, org.mockito.Mockito.times(2)).requireAdmin();
    }
}
