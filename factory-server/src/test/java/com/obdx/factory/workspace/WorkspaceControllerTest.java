package com.obdx.factory.workspace;

import com.obdx.factory.auth.AccessGuard;
import com.obdx.factory.auth.AuditLog;
import com.obdx.factory.common.ConflictException;
import com.obdx.factory.common.NotFoundException;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.time.OffsetDateTime;
import java.util.UUID;

import static org.hamcrest.Matchers.containsString;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(WorkspaceController.class)
@WithMockUser
class WorkspaceControllerTest {

    @Autowired
    private MockMvc mvc;

    @MockitoBean
    private WorkspaceService service;

    @MockitoBean
    private AccessGuard guard;

    @MockitoBean
    private AuditLog audit;

    @Test
    void createsWorkspace() throws Exception {
        UUID id = UUID.randomUUID();
        when(service.create(any())).thenReturn(new WorkspaceResponse(
                id, "bank-a-22", "Bank A", "22.x", "https://svn.bank-a.local/obdx/trunk", null, false, null, OffsetDateTime.now()));

        mvc.perform(post("/api/workspaces").with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name": "bank-a-22", "bankName": "Bank A", "obdxVersion": "22.x",
                                 "svnUrl": "https://svn.bank-a.local/obdx/trunk"}
                                """))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value(id.toString()))
                .andExpect(jsonPath("$.obdxVersion").value("22.x"));
    }

    @Test
    void rejectsUnsupportedVersionAndBadSvnUrl() throws Exception {
        mvc.perform(post("/api/workspaces").with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name": "bank-a", "bankName": "Bank A", "obdxVersion": "19.x", "svnUrl": "c:\\\\code"}
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail", containsString("obdxVersion must be 22.x or 25.x")))
                .andExpect(jsonPath("$.detail", containsString("svnUrl must be")));

        verifyNoInteractions(service);
    }

    @Test
    void reportsDuplicateNameAsConflict() throws Exception {
        when(service.create(any())).thenThrow(new ConflictException("A workspace named 'bank-a' already exists"));

        mvc.perform(post("/api/workspaces").with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name": "bank-a", "bankName": "Bank A", "obdxVersion": "25.x"}
                                """))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.detail").value("A workspace named 'bank-a' already exists"));
    }

    @Test
    void reportsMissingWorkspaceAsNotFound() throws Exception {
        UUID id = UUID.randomUUID();
        when(service.get(id)).thenThrow(new NotFoundException("Workspace not found: " + id));

        mvc.perform(get("/api/workspaces/" + id))
                .andExpect(status().isNotFound());
    }
}
