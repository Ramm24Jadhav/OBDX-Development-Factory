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
import com.obdx.factory.requirements.RequirementSpec;
import com.obdx.factory.search.CodeSearchService;
import com.obdx.factory.svn.SvnClient;
import com.obdx.factory.target.TargetPacks;
import com.obdx.factory.target.TargetService;
import com.obdx.factory.workspace.WorkspaceRepository;
import com.obdx.factory.workspace.WorkspaceService;
import org.junit.jupiter.api.Test;
import org.springframework.core.task.TaskExecutor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.util.unit.DataSize;
import tools.jackson.databind.json.JsonMapper;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Regression audit after the screen changes (3 Nov 2026): Write again never replaces a passing file with a failing
 * one (A2), a file cut off at the output limit counts as cut off (O3), delivering files that fail their checks is
 * confirmed (A4), a request for changes holds the plan (A5), an edit refreshes the change's message (O4), and a plan
 * that leaves a Must requirement unnamed says so (O1b).
 */
class RegressionAuditFixesTest {

    private final ChangeRequestRepository changes = mock(ChangeRequestRepository.class);
    private final ChangeFileStore files = mock(ChangeFileStore.class);
    private final JdbcTemplate jdbc = mock(JdbcTemplate.class);
    private final PlanReviewStore planReviews = mock(PlanReviewStore.class);
    private final RequirementService requirements = mock(RequirementService.class);
    private final LocalChecks localChecks = mock(LocalChecks.class);
    private final JsonMapper json = JsonMapper.builder().build();
    private final CodeGenerator generator = mock(CodeGenerator.class);
    private final PackService packs = mock(PackService.class);
    private final StorageProperties storage = mock(StorageProperties.class);
    private final com.obdx.factory.importing.WorkingCopyLocks locks = new com.obdx.factory.importing.WorkingCopyLocks();
    private final com.obdx.factory.auth.AuditLog audit = mock(com.obdx.factory.auth.AuditLog.class);
    private final ChangeService service = new ChangeService(changes, files, mock(WorkspaceRepository.class), mock(WorkspaceService.class),
            requirements, mock(ScreenDesignRepository.class), mock(DesignStore.class), mock(ProjectProfileService.class),
            mock(CodeSearchService.class), mock(ImpactAnalyzer.class), generator, mock(SvnClient.class),
            storage, new ChangeProperties(30, 25, DataSize.ofKilobytes(80), 2, "branches/factory", "-"), jdbc, json,
            mock(ChangeBuildStore.class), packs, localChecks, mock(RecipeService.class), mock(TargetService.class),
            mock(TargetPacks.class), mock(TaskExecutor.class), mock(KnowledgeService.class), planReviews,
            locks, audit);

    private final UUID id = UUID.randomUUID();

    private static ChangeFileStore.ChangeFile file(String path, ChangeFileStore.Status status, String generated, FileChecks.Status check,
                                                   String message) {
        return new ChangeFileStore.ChangeFile(0, path, "create", "ui", null, status, null, generated, false, check, message, 1);
    }

    private ChangeRequest change(ChangeRequest.Status status) {
        ChangeRequest change = new ChangeRequest(UUID.randomUUID(), UUID.randomUUID(), "Quick transfer", "Dev");
        change.plan(json.writeValueAsString(new ChangePlan("x", List.of(new ChangePlan.Item("a/b.js", "create", "ui", null, List.of(), null)),
                List.of())), 7L);
        change.status(status, "ready");
        when(changes.findById(id)).thenReturn(Optional.of(change));
        when(changes.save(any())).thenAnswer(call -> call.getArgument(0));
        when(jdbc.queryForList(contains("FOR UPDATE"), eq(UUID.class), eq(id))).thenReturn(List.of(id));
        when(requirements.get(any())).thenReturn(mock(RequirementService.RequirementDetail.class));
        return change;
    }

    // --- A2: Write again ---

    @Test
    void writeAgainKeepsAPassingVersionWhenTheNewOneFailsItsChecks() {
        ChangeFileStore.ChangeFile passed = file("a/b.js", ChangeFileStore.Status.GENERATED, "ok();", FileChecks.Status.PASSED, null);
        String reason = ChangeService.worseThanBefore(passed, new FileChecks.Result(FileChecks.Status.FAILED,
                "JavaScript does not parse: the '{' opened on line 3 is not closed\nmore"));
        assertThat(reason).startsWith("the new version fails its checks: JavaScript does not parse").endsWith("it is not used");
        ChangeFileStore.ChangeFile warned = file("a/b.js", ChangeFileStore.Status.GENERATED, "ok();", FileChecks.Status.WARNING, "w");
        assertThat(ChangeService.worseThanBefore(warned, new FileChecks.Result(FileChecks.Status.FAILED, null))).isNotNull();
    }

    @Test
    void writeAgainReplacesAVersionThatFailedOrPassesItsChecks() {
        ChangeFileStore.ChangeFile failed = file("a/b.js", ChangeFileStore.Status.GENERATED, "bad(", FileChecks.Status.FAILED, "x");
        assertThat(ChangeService.worseThanBefore(failed, new FileChecks.Result(FileChecks.Status.FAILED, "y"))).isNull();
        ChangeFileStore.ChangeFile passed = file("a/b.js", ChangeFileStore.Status.GENERATED, "ok();", FileChecks.Status.PASSED, null);
        assertThat(ChangeService.worseThanBefore(passed, new FileChecks.Result(FileChecks.Status.PASSED, null))).isNull();
        assertThat(ChangeService.worseThanBefore(passed, new FileChecks.Result(FileChecks.Status.WARNING, "w"))).isNull();
        assertThat(ChangeService.worseThanBefore(null, new FileChecks.Result(FileChecks.Status.FAILED, "y"))).isNull();
        ChangeFileStore.ChangeFile none = file("a/b.js", ChangeFileStore.Status.PENDING, null, null, null);
        assertThat(ChangeService.worseThanBefore(none, new FileChecks.Result(FileChecks.Status.FAILED, "y"))).isNull();
    }

    @Test
    void writeAgainAndFailedDeliveriesAreInTheChangesHistory() {
        assertThat(ChangeService.historyText(ChangeController.WRITTEN_AGAIN, "a/b.js (with a note): kept the previous version: x"))
                .isEqualTo("Write again of a/b.js (with a note): kept the previous version: x");
        assertThat(ChangeService.historyText(ChangeController.DELIVERY_FAILED, "Quick transfer: pre-commit hook refused"))
                .isEqualTo("Delivery failed: Quick transfer: pre-commit hook refused");
    }

    // --- O3: cut off at the output limit ---

    @Test
    void aFileCutOffAtTheOutputLimitCountsAsCutOffNotAsAProblem() {
        assertThat(ChangeService.cutOff(new FileChecks.Result(FileChecks.Status.FAILED, CodeGenerator.CUT + ", so the file is incomplete")))
                .isTrue();
        assertThat(ChangeService.cutOff(new FileChecks.Result(FileChecks.Status.FAILED, "JavaScript does not parse"))).isFalse();
        assertThat(ChangeService.cutOff(new FileChecks.Result(FileChecks.Status.WARNING, CodeGenerator.CUT))).isFalse();

        ChangeFileStore.ChangeFile cut = file("a/b.js", ChangeFileStore.Status.FAILED, "part", FileChecks.Status.FAILED,
                CodeGenerator.PARTIAL + " " + CodeGenerator.CUT + "...");
        ChangeFileStore.ChangeFile ok = file("a/c.js", ChangeFileStore.Status.GENERATED, "c", FileChecks.Status.PASSED, null);
        assertThat(ChangeService.partial(cut)).isTrue();
        assertThat(ChangeService.continued(List.of(cut, ok))).containsExactly("a/b.js");
        assertThat(ChangeService.summary(List.of(cut, ok))).isEqualTo("1 file(s) written, 0 with problems, 0 with warnings, 1 cut off "
                + "(Continue generation). Review the changes before delivering them.");
    }

    // --- A4: delivering files that fail their checks ---

    @Test
    void deliveringFilesThatFailTheirChecksIsRefusedNamingThem() {
        List<ChangeFileStore.ChangeFile> all = List.of(
                file("a/b.js", ChangeFileStore.Status.GENERATED, "bad(", FileChecks.Status.FAILED, "does not parse"),
                file("a/c.js", ChangeFileStore.Status.GENERATED, "c", FileChecks.Status.PASSED, null),
                file("a/d.js", ChangeFileStore.Status.FAILED, "part", FileChecks.Status.FAILED, CodeGenerator.PARTIAL));
        assertThat(ChangeService.failingChecks(all)).containsExactly("a/b.js");
        assertThatThrownBy(() -> ChangeService.requireChecksPassed(all)).isInstanceOf(ConflictException.class)
                .hasMessage(ChangeService.FAILED_CHECKS + "1 file(s) fail their checks: a/b.js. Fix them first (Write again, or edit them), "
                        + "or submit them as they are.");
    }

    @Test
    void deliveryAsksFirstAndGoesOnOnceConfirmed() {
        change(ChangeRequest.Status.GENERATED);
        when(files.files(id)).thenReturn(List.of(file("a/b.js", ChangeFileStore.Status.GENERATED, "bad(", FileChecks.Status.FAILED, "x")));

        assertThatThrownBy(() -> service.deliverToBranch(id, false)).isInstanceOf(ConflictException.class)
                .hasMessageStartingWith(ChangeService.FAILED_CHECKS);
        // confirmed: past the checks, to the workspace (not found in this test)
        assertThatThrownBy(() -> service.deliverToBranch(id, false, true)).isInstanceOf(NotFoundException.class);
    }

    @Test
    void passingFilesAreDeliveredWithoutAQuestion() {
        change(ChangeRequest.Status.GENERATED);
        when(files.files(id)).thenReturn(List.of(file("a/b.js", ChangeFileStore.Status.GENERATED, "ok();", FileChecks.Status.WARNING, "w")));
        assertThatThrownBy(() -> service.deliverToBranch(id, false)).isInstanceOf(NotFoundException.class);
    }

    // --- A5: a request for changes holds the plan ---

    @Test
    void aPlanWithChangesRequestedOnItsRevisionIsNotApproved() {
        change(ChangeRequest.Status.PLAN_READY);
        when(planReviews.latest(id)).thenReturn(3);
        when(planReviews.changesRequested(id, 3)).thenReturn(true);

        assertThatThrownBy(() -> service.approvePlan(id, "Lead")).isInstanceOf(ConflictException.class)
                .hasMessage("Changes were requested on this revision of the plan: edit it or analyze again first.");
        // also not when an incomplete plan is confirmed
        assertThatThrownBy(() -> service.approvePlan(id, "Lead", true, 3)).isInstanceOf(ConflictException.class)
                .hasMessageStartingWith("Changes were requested");
        verify(files, never()).replaceAll(any(), any());
    }

    @Test
    void aNewRevisionAfterTheRequestIsApproved() {
        change(ChangeRequest.Status.PLAN_READY);
        when(planReviews.latest(id)).thenReturn(4);
        when(planReviews.changesRequested(id, 4)).thenReturn(false);
        when(planReviews.record(any(), anyString(), any(), anyString())).thenReturn(4);

        service.approvePlan(id, "Lead");

        verify(files).replaceAll(eq(id), any());
    }

    // --- O4: an edit refreshes the message ---

    @Test
    void anEditSaysHowTheFilesStandNow() {
        ChangeRequest change = change(ChangeRequest.Status.GENERATED);
        change.status(ChangeRequest.Status.GENERATED, "1 file(s) written, 1 with problems, 0 with warnings. Review the changes before "
                + "delivering them. The code was updated since the analysis (r7 to r8).");
        ChangeFileStore.ChangeFile before = file("a/b.js", ChangeFileStore.Status.GENERATED, "bad(", FileChecks.Status.FAILED, "x");
        when(files.file(id, "a/b.js")).thenReturn(Optional.of(before));
        when(localChecks.check(any(), anyString(), any(), anyString())).thenReturn(new FileChecks.Result(FileChecks.Status.PASSED, null));
        when(files.files(id)).thenReturn(List.of(file("a/b.js", ChangeFileStore.Status.GENERATED, "ok();\n", FileChecks.Status.PASSED, null)));

        service.editFile(id, "a/b.js", "ok();");

        // the counts are the new ones, the earlier note stays
        assertThat(change.getMessage()).isEqualTo("a/b.js edited. 1 file(s) written, 0 with problems, 0 with warnings. Review the changes "
                + "before delivering them. The code was updated since the analysis (r7 to r8).");
        // edited again: named once
        service.editFile(id, "a/b.js", "ok();");
        assertThat(change.getMessage()).startsWith("a/b.js edited. 1 file(s)").doesNotContain("edited. a/b.js edited");
    }

    @Test
    void earlierNotesWithoutCountsAreKept() {
        assertThat(ChangeService.edited("Writing a/b.js again failed (x); the previous version is kept. 2 file(s) written, 1 with problems, "
                + "0 with warnings. Review the changes before delivering them.", "a/c.js", "2 file(s) written, 0 with problems, 0 with warnings. "
                + "Review the changes before delivering them."))
                .isEqualTo("a/c.js edited. Writing a/b.js again failed (x); the previous version is kept. 2 file(s) written, 0 with problems, "
                        + "0 with warnings. Review the changes before delivering them.");
        assertThat(ChangeService.edited("Plan approved.", "a/c.js", "S.")).isEqualTo("a/c.js edited. S. Plan approved.");
        assertThat(ChangeService.edited(null, "a/c.js", "S.")).isEqualTo("a/c.js edited. S.");
    }

    // --- review of 57735c6: Continue never replaces a passing version, through generateFile ---

    @Test
    void continuingARewriteThatFailsItsChecksKeepsThePassingVersionAndDropsTheRewrite(@org.junit.jupiter.api.io.TempDir java.nio.file.Path wc) {
        ChangeFileStore.ChangeFile passed = new ChangeFileStore.ChangeFile(0, "a/b.js", "create", "ui", null, ChangeFileStore.Status.GENERATED,
                null, "ok();\n", false, FileChecks.Status.PASSED, null, 1, "part of a rewrite", false);
        when(files.file(id, "a/b.js")).thenReturn(Optional.of(passed));
        ChangeContext context = mock(ChangeContext.class);
        when(context.checks()).thenReturn(mock(com.obdx.factory.pack.CheckScope.class));
        when(generator.generate(any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), org.mockito.ArgumentMatchers.anyBoolean()))
                .thenReturn(new CodeGenerator.Result("broken(", new FileChecks.Result(FileChecks.Status.FAILED, "JavaScript does not parse"), 1));
        ChangePlan.Item item = new ChangePlan.Item("a/b.js", "create", "ui", null, List.of(), null);

        // as Continue calls it (not Write again), going on from the kept rewrite
        String reason = service.generateFile(id, UUID.randomUUID(), context, new ChangePlan("x", List.of(item), List.of()), item, wc,
                new java.util.LinkedHashMap<>(), null, new ChangeService.Kept("part of a rewrite", false), false);

        assertThat(reason).startsWith("the new version fails its checks");
        verify(files, never()).saveResult(any(), anyString(), any(), any(), anyString(), org.mockito.ArgumentMatchers.anyBoolean(), any(),
                org.mockito.ArgumentMatchers.anyInt());
        verify(files).saveRewrite(id, "a/b.js", null);
    }

    @Test
    void aFirstWriteThatFailsItsChecksIsSaved(@org.junit.jupiter.api.io.TempDir java.nio.file.Path wc) {
        when(files.file(id, "a/b.js")).thenReturn(Optional.of(file("a/b.js", ChangeFileStore.Status.PENDING, null, null, null)));
        ChangeContext context = mock(ChangeContext.class);
        when(context.checks()).thenReturn(mock(com.obdx.factory.pack.CheckScope.class));
        FileChecks.Result failed = new FileChecks.Result(FileChecks.Status.FAILED, "JavaScript does not parse");
        when(generator.generate(any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), org.mockito.ArgumentMatchers.anyBoolean()))
                .thenReturn(new CodeGenerator.Result("broken(", failed, 1));
        ChangePlan.Item item = new ChangePlan.Item("a/b.js", "create", "ui", null, List.of(), null);

        assertThat(service.generateFile(id, UUID.randomUUID(), context, new ChangePlan("x", List.of(item), List.of()), item, wc,
                new java.util.LinkedHashMap<>(), null, null, false)).isNull();
        verify(files).saveResult(id, "a/b.js", ChangeFileStore.Status.GENERATED, null, "broken(", false, failed, 1);
    }

    // --- review of 57735c6: an answered request for changes no longer holds the plan ---

    @Test
    void savingThePlanAsksTheStoreToAnswerOnlyRequestsMadeOnAnotherPlan() {
        ChangeRequest change = change(ChangeRequest.Status.PLAN_READY);
        when(planReviews.latest(id)).thenReturn(3);
        when(planReviews.record(any(), anyString(), any(), any())).thenReturn(3);
        when(requirements.get(any())).thenReturn(mock(RequirementService.RequirementDetail.class));

        when(packs.scope(any())).thenReturn(mock(com.obdx.factory.pack.CheckScope.class));
        when(storage.workingCopy(any())).thenReturn(java.nio.file.Path.of("target", "no-working-copy"));
        service.updatePlan(id, change.getPlan(), "Lead");

        verify(planReviews).answerRequestsByEdit(eq(id), anyString(), eq(3), eq("Lead"));
        verify(planReviews, never()).answerRequestsByAnalysis(any(), org.mockito.ArgumentMatchers.anyInt(), any());
    }

    // --- review of 57735c6: nothing reads the working copy while it is checked out again ---

    @Test
    void deliveryWaitsWhileTheWorkingCopyIsCheckedOutAgain() {
        ChangeRequest change = change(ChangeRequest.Status.GENERATED);
        when(files.files(id)).thenReturn(List.of(file("a/b.js", ChangeFileStore.Status.GENERATED, "ok();", FileChecks.Status.PASSED, null)));
        assertThat(locks.hold(change.getWorkspaceId(), "checked out again")).isTrue();
        try {
            assertThatThrownBy(() -> service.deliverToBranch(id, false)).isInstanceOf(ConflictException.class)
                    .hasMessageContaining("being checked out again");
            assertThatThrownBy(() -> service.regenerate(id, "a/b.js", null)).isInstanceOf(ConflictException.class);
        } finally {
            locks.release(change.getWorkspaceId());
        }
        // free again: on to the workspace (not found in this test), and the lock is given back
        assertThatThrownBy(() -> service.deliverToBranch(id, false)).isInstanceOf(NotFoundException.class);
        assertThat(locks.holder(change.getWorkspaceId())).isNull();
    }

    // --- O1b: a Must requirement no planned file names ---

    private static RequirementSpec spec(List<RequirementSpec.FunctionalRequirement> requirements) {
        return new RequirementSpec("t", "s", List.of(), List.of(), List.of(), List.of(), List.of(), List.of(), List.of(), List.of(),
                List.of(), List.of(), List.of(), requirements, List.of(), List.of());
    }

    @Test
    void aPlanLeavingAMustRequirementUnnamedSaysSo() {
        RequirementSpec spec = spec(List.of(new RequirementSpec.FunctionalRequirement("FR-001", "Chips", null, "Must", List.of()),
                new RequirementSpec.FunctionalRequirement("FR-002", "Balance", null, "Must", List.of()),
                new RequirementSpec.FunctionalRequirement("FR-003", "Colours", null, "Could", List.of())));
        ChangePlan plan = new ChangePlan("x", List.of(new ChangePlan.Item("a/b.html", "create", "ui", "Chips (FR-001)", List.of(), null)),
                List.of());
        assertThat(PlanReview.uncoveredMust(plan, spec)).containsExactly("FR-002");
        ChangePlan reviewed = PlanReview.review(plan, spec, Map.of());
        assertThat(reviewed.risks()).anyMatch(r -> r.startsWith(PlanReview.UNCOVERED_MUST + "FR-002."));
        // reviewed again: the risk is replaced, not repeated
        assertThat(PlanReview.review(reviewed, spec, Map.of()).risks().stream().filter(r -> r.startsWith(PlanReview.UNCOVERED_MUST)))
                .hasSize(1);
    }

    @Test
    void noMustRiskWhenAllAreNamedOrThePlanNamesNone() {
        RequirementSpec spec = spec(List.of(new RequirementSpec.FunctionalRequirement("FR-001", "Chips", null, "Must have", List.of()),
                new RequirementSpec.FunctionalRequirement("FR-002", "Balance", null, "Should", List.of())));
        ChangePlan named = new ChangePlan("x", List.of(new ChangePlan.Item("a/b.html", "create", "ui", "Chips", List.of(), "FR-001")), List.of());
        assertThat(PlanReview.uncoveredMust(named, spec)).isEmpty();
        ChangePlan none = new ChangePlan("x", List.of(new ChangePlan.Item("a/b.html", "create", "ui", "Chips", List.of(), null)), List.of());
        assertThat(PlanReview.uncoveredMust(none, spec)).isEmpty();
        assertThat(PlanReview.uncoveredMust(named, null)).isEmpty();
    }
}
