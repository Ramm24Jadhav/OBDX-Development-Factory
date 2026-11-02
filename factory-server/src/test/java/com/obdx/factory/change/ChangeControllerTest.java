package com.obdx.factory.change;

import com.obdx.factory.auth.AccessGuard;
import com.obdx.factory.auth.AppUser;
import com.obdx.factory.auth.AuditLog;
import com.obdx.factory.auth.WorkspaceRole.Permission;
import com.obdx.factory.common.ConflictException;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;
import java.util.UUID;

import static org.hamcrest.Matchers.startsWith;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Approving a plan that may be missing files needs the confirmation and the revision it was given for; editing passes the plan on. */
@WebMvcTest(ChangeController.class)
@WithMockUser
class ChangeControllerTest {

    @Autowired
    private MockMvc mvc;

    @MockitoBean
    private ChangeService service;

    @MockitoBean
    private ChangeBuildService builds;

    @MockitoBean
    private ChangeBranchService branches;

    @MockitoBean
    private AccessGuard guard;

    @MockitoBean
    private AuditLog audit;

    private static final UUID ID = UUID.randomUUID();
    private static final UUID WORKSPACE = UUID.randomUUID();

    private static ChangeService.ChangeDetail detail(ChangePlan plan) {
        return new ChangeService.ChangeDetail(ID, WORKSPACE, null, "Standing instructions", ChangeRequest.Status.GENERATING, null, null, plan,
                "Lead", null, null, null, null, null, null, List.of(), null, null, List.of(), null, null, null, null);
    }

    private void signedIn() {
        when(guard.requireForChange(eq(ID), eq(Permission.APPROVE))).thenReturn(new AppUser("lead", "Lead", null, AppUser.Source.LOCAL));
        when(guard.requireForChange(eq(ID), eq(Permission.MANAGE_CODE))).thenReturn(new AppUser("dev", "Dev", null, AppUser.Source.LOCAL));
    }

    @Test
    void approvingPassesTheConfirmationAndItsRevisionAndRecordsThem() throws Exception {
        signedIn();
        ChangePlan incomplete = new ChangePlan("x", List.of(new ChangePlan.Item("a/B.java", "create", "service", null, List.of(), null)),
                List.of("risk"), new ChangePlan.Incomplete(ChangePlan.Incomplete.LIMIT, "risk", 1L, "p"));
        when(service.approvePlan(ID, "Lead", true, 3)).thenReturn(detail(incomplete));

        mvc.perform(post("/api/changes/" + ID + "/approve-plan?incomplete=true&revision=3").with(csrf())).andExpect(status().isAccepted());

        verify(service).approvePlan(ID, "Lead", true, 3);
        verify(audit).record("CHANGE_PLAN_APPROVED", WORKSPACE, "Standing instructions",
                "1 file(s), revision 3 approved although files may be missing (confirmed)");
    }

    @Test
    void approvingWithoutTheConfirmationPassesNoneAndTheRefusalReachesTheClient() throws Exception {
        signedIn();
        when(service.approvePlan(ID, "Lead", false, null)).thenThrow(new ConflictException(ChangeService.INCOMPLETE_PLAN
                + "revision 2 of the plan may be missing files."));

        mvc.perform(post("/api/changes/" + ID + "/approve-plan").with(csrf())).andExpect(status().isConflict())
                .andExpect(jsonPath("$.detail", startsWith(ChangeService.INCOMPLETE_PLAN + "revision 2 of the plan")));

        verify(service).approvePlan(eq(ID), eq("Lead"), eq(false), isNull());
        verify(audit, never()).record(anyString(), eq(WORKSPACE), anyString(), anyString());
    }

    @Test
    void anEditedPlanGoesToTheServiceAsSent() throws Exception {
        signedIn();
        String body = "{\"items\": [{\"path\": \"a/B.java\"}], \"incomplete\": null, \"risks\": []}";
        when(service.updatePlan(ID, body, "Dev")).thenReturn(detail(new ChangePlan("x", List.of(), List.of())));

        mvc.perform(put("/api/changes/" + ID + "/plan").with(csrf()).contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk());

        // (the service drops what a plan sent in says about being incomplete, and keeps the server's own record)
        verify(service).updatePlan(ID, body, "Dev");
    }

    @Test
    void analyzeAgainCanStartOver() throws Exception {
        signedIn();
        when(service.analyzeAgain(ID, true)).thenReturn(detail(null));

        mvc.perform(post("/api/changes/" + ID + "/analyze?fresh=true").with(csrf())).andExpect(status().isAccepted());
        verify(service).analyzeAgain(ID, true);
    }
}
