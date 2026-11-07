package com.obdx.factory.change;

import com.obdx.factory.common.ConflictException;
import com.obdx.factory.common.NotFoundException;
import com.obdx.factory.design.DesignStore;
import com.obdx.factory.design.ScreenDesignRepository;
import com.obdx.factory.importing.StorageProperties;
import com.obdx.factory.knowledge.KnowledgeService;
import com.obdx.factory.pack.LocalChecks;
import com.obdx.factory.pack.PackService;
import com.obdx.factory.pack.RecipeService;
import com.obdx.factory.profile.ProjectProfileService;
import com.obdx.factory.requirements.RequirementService;
import com.obdx.factory.search.CodeSearchService;
import com.obdx.factory.svn.SvnClient;
import com.obdx.factory.target.TargetPacks;
import com.obdx.factory.target.TargetService;
import com.obdx.factory.workspace.WorkspaceRepository;
import com.obdx.factory.workspace.WorkspaceService;
import org.junit.jupiter.api.Test;
import org.mockito.InOrder;
import org.springframework.core.task.TaskExecutor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.util.unit.DataSize;
import tools.jackson.databind.json.JsonMapper;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * An approval and an edit of the same plan run one after the other: each holds the change's row before it reads the
 * change and its latest revision, so an approval never approves a plan edited after it read the revision.
 */
class PlanLockTest {

    private final ChangeRequestRepository changes = mock(ChangeRequestRepository.class);
    private final ChangeFileStore files = mock(ChangeFileStore.class);
    private final JdbcTemplate jdbc = mock(JdbcTemplate.class);
    private final PlanReviewStore planReviews = mock(PlanReviewStore.class);
    private final RequirementService requirements = mock(RequirementService.class);
    private final JsonMapper json = JsonMapper.builder().build();
    private final ChangeService service = new ChangeService(changes, files, mock(WorkspaceRepository.class), mock(WorkspaceService.class),
            requirements, mock(ScreenDesignRepository.class), mock(DesignStore.class), mock(ProjectProfileService.class),
            mock(CodeSearchService.class), mock(ImpactAnalyzer.class), mock(CodeGenerator.class), mock(SvnClient.class),
            mock(StorageProperties.class), new ChangeProperties(30, 25, DataSize.ofKilobytes(80), 2, "branches/factory", "-"), jdbc, json,
            mock(ChangeBuildStore.class), mock(PackService.class), mock(LocalChecks.class), mock(RecipeService.class), mock(TargetService.class),
            mock(TargetPacks.class), mock(TaskExecutor.class), mock(KnowledgeService.class), planReviews,
            new com.obdx.factory.importing.WorkingCopyLocks(), mock(com.obdx.factory.auth.AuditLog.class));

    private final UUID id = UUID.randomUUID();

    private ChangeRequest planReady(ChangePlan plan) {
        ChangeRequest change = new ChangeRequest(UUID.randomUUID(), UUID.randomUUID(), "Standing instructions", "Dev");
        change.plan(json.writeValueAsString(plan), 7L);
        change.status(ChangeRequest.Status.PLAN_READY, "Plan ready");
        when(changes.findById(id)).thenReturn(Optional.of(change));
        when(changes.save(any())).thenAnswer(call -> call.getArgument(0));
        when(jdbc.queryForList(contains("FOR UPDATE"), eq(UUID.class), eq(id))).thenReturn(List.of(id));
        when(requirements.get(any())).thenReturn(mock(RequirementService.RequirementDetail.class));
        return change;
    }

    private static final ChangePlan PLAN = new ChangePlan("x", List.of(new ChangePlan.Item("a/B.java", "create", "service", null, List.of(),
            null)), List.of());

    @Test
    void anApprovalHoldsTheChangeBeforeItReadsTheChangeAndItsRevision() {
        planReady(PLAN);
        when(planReviews.latest(id)).thenReturn(2);

        service.approvePlan(id, "Lead", false, null);

        InOrder order = inOrder(jdbc, changes, planReviews);
        order.verify(jdbc).queryForList(contains("FOR UPDATE"), eq(UUID.class), eq(id));
        order.verify(changes).findById(id);
        order.verify(planReviews).latest(id);
    }

    @Test
    void aConfirmationForAnOlderRevisionIsRefusedAfterTheLock() {
        planReady(new ChangePlan("x", PLAN.items(), List.of("risk"), new ChangePlan.Incomplete(ChangePlan.Incomplete.LIMIT, "risk", 7L, "p")));
        when(planReviews.latest(id)).thenReturn(3);

        assertThatThrownBy(() -> service.approvePlan(id, "Lead", true, 2)).isInstanceOf(ConflictException.class)
                .hasMessageContaining("the plan changed since you confirmed it").hasMessageContaining("revision 3 of the plan");
        verify(files, never()).replaceAll(any(), any());
    }

    @Test
    void aChangeThatIsGoneIsNotFound() {
        when(jdbc.queryForList(anyString(), eq(UUID.class), eq(id))).thenReturn(List.of());

        assertThatThrownBy(() -> service.approvePlan(id, "Lead", false, null)).isInstanceOf(NotFoundException.class);
        assertThatThrownBy(() -> service.updatePlan(id, "{}", "Dev")).isInstanceOf(NotFoundException.class);
        verify(changes, never()).findById(any());
    }
}
