package com.obdx.factory.workspace;

import com.obdx.factory.auth.AccessGuard;
import com.obdx.factory.auth.AuditLog;
import com.obdx.factory.common.JsonConfig;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import static org.mockito.Mockito.verifyNoInteractions;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** A NUL character in any text of a JSON body is a 400 when the body is read, before it can reach the database. */
@WebMvcTest(WorkspaceController.class)
@Import(JsonConfig.class)
@WithMockUser
class NulInJsonTest {

    @Autowired
    private MockMvc mvc;

    @MockitoBean
    private WorkspaceService service;

    @MockitoBean
    private AccessGuard guard;

    @MockitoBean
    private AuditLog audit;

    @Test
    void aNulInAJsonTextIsRefused() throws Exception {
        mvc.perform(post("/api/workspaces").with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\": \"x\\u0000y\", \"bankName\": \"Bank A\", \"obdxVersion\": \"22.x\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value(JsonConfig.NUL_MESSAGE));

        verifyNoInteractions(service);
    }

    @Test
    void brokenJsonSaysSoWithoutTheParsersInternals() throws Exception {
        mvc.perform(post("/api/workspaces").with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{\"name\": "))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail", org.hamcrest.Matchers.startsWith("The request could not be read")))
                .andExpect(jsonPath("$.detail", org.hamcrest.Matchers.endsWith("Check the data sent.")))
                .andExpect(jsonPath("$.detail", org.hamcrest.Matchers.not(org.hamcrest.Matchers.containsString("Feature"))))
                .andExpect(jsonPath("$.detail", org.hamcrest.Matchers.not(org.hamcrest.Matchers.containsString("$"))));
        // a wrong type names the field, not the class it was read into
        mvc.perform(post("/api/workspaces").with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\": {\"x\": 1}, \"bankName\": \"Bank A\", \"obdxVersion\": \"22.x\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail", org.hamcrest.Matchers.startsWith("The request could not be read (field \"name\"")))
                .andExpect(jsonPath("$.detail", org.hamcrest.Matchers.not(org.hamcrest.Matchers.containsString("WorkspaceRequest"))));
    }
}
