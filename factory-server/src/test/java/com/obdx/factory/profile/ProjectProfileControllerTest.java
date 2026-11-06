package com.obdx.factory.profile;

import com.obdx.factory.auth.AccessGuard;
import com.obdx.factory.auth.AuditLog;
import com.obdx.factory.auth.WorkspaceRole.Permission;
import com.obdx.factory.common.BadRequestException;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(ProjectProfileController.class)
@WithMockUser
class ProjectProfileControllerTest {

    @Autowired
    private MockMvc mvc;

    @MockitoBean
    private ProjectProfileService service;

    @MockitoBean
    private AccessGuard guard;

    @MockitoBean
    private AuditLog audit;

    @Test
    void listsTheProfileEntriesOfTheAuditLog() throws Exception {
        UUID id = UUID.randomUUID();
        OffsetDateTime at = OffsetDateTime.parse("2026-11-02T09:30:00Z");
        when(audit.recent(eq(id), eq(List.of("PROFILE_FACT_SET", "PROFILE_FACT_RESET")), anyInt())).thenReturn(List.of(
                new AuditLog.Event(2, at, "alice", "PROFILE_FACT_RESET", id, "ui.jetVersion", null),
                new AuditLog.Event(1, at.minusHours(1), "alice", "PROFILE_FACT_SET", id, "ui.jetVersion", "JET 11.1.0")));

        mvc.perform(get("/api/workspaces/" + id + "/profile/history"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].key").value("ui.jetVersion"))
                .andExpect(jsonPath("$[0].action").value("reset"))
                .andExpect(jsonPath("$[0].username").value("alice"))
                .andExpect(jsonPath("$[1].action").value("set"))
                .andExpect(jsonPath("$[1].value").value("JET 11.1.0"));
        verify(guard).require(id, Permission.VIEW);
    }

    @Test
    void auditsACorrectionOnlyOnceItIsSaved() throws Exception {
        UUID id = UUID.randomUUID();
        when(service.setValue(id, "backend.javaVersion", " Java 8 "))
                .thenReturn(new ProjectProfileService.ProfileResponse(1L, OffsetDateTime.now(), "22.x", List.of(), List.of()));
        when(service.setValue(id, "backend.javaVersion", " "))
                .thenThrow(new BadRequestException("Enter a value, or reset the fact to use the detected value"));

        mvc.perform(put("/api/workspaces/" + id + "/profile/facts/backend.javaVersion").with(csrf())
                        .contentType(MediaType.APPLICATION_JSON).content("{\"value\": \" \"}"))
                .andExpect(status().isBadRequest());
        verify(audit, never()).record(anyString(), any(), anyString(), any());

        mvc.perform(put("/api/workspaces/" + id + "/profile/facts/backend.javaVersion").with(csrf())
                        .contentType(MediaType.APPLICATION_JSON).content("{\"value\": \" Java 8 \"}"))
                .andExpect(status().isOk());
        verify(audit).record("PROFILE_FACT_SET", id, "backend.javaVersion", "Java 8");
        verify(guard, times(2)).require(id, Permission.MANAGE_CODE);
    }
}
