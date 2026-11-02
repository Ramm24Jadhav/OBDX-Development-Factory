package com.obdx.factory.change;

import com.obdx.factory.common.ConflictException;
import com.obdx.factory.model.ModelLimitReachedException;
import com.obdx.factory.pack.ModelReasoning;
import com.obdx.factory.requirements.RequirementSpec;
import com.obdx.factory.requirements.SpecParser;
import org.junit.jupiter.api.Test;
import org.springframework.util.unit.DataSize;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** QA round 19: what the BRD1 and BRD3 runs showed, fixed (the plans and messages are those of the runs, shortened). */
class QaRound19Test {

    // --- R19-1: a plan stored before the server kept its incomplete record ---

    /** Round 18's BRD1 plan as stored: the server's risk, no record (the model's name and the account left out). */
    private static final String LEGACY_RISK = ImpactAnalyzer.LIMIT_STOPPED + " (The model's server has used up its daily limit (Rate "
            + "limit reached on tokens per day (TPD): Limit 200000, Used 198012, Requested 7097). Try again in about 37 minutes.), so files "
            + "may be missing from this plan. Add them before approving, or analyze again later.";

    private static ChangePlan legacyPlan() {
        return new ChangePlan("Standing instructions", List.of(
                new ChangePlan.Item("backend/src/com/bank/obdx/payments/StandingInstructionResource.java", "create", "service",
                        "REST resource for standing instructions", List.of(), "Defines @Path(\"/payments/standingInstructions\")."),
                new ChangePlan.Item("channel/components/modules/payments/standing-instruction-list/standing-instruction-list.js", "create",
                        "ui", "View model for the list screen", List.of(), "Loads the instructions (FR-004).")),
                List.of(LEGACY_RISK, "The spec has acceptance criteria but the plan writes no test (6 criteria)."));
    }

    @Test
    void aStoredPlanWithTheServersLimitRiskAndNoRecordIsContinuedOnce() {
        ChangePlan stored = legacyPlan();
        // why round 19 started over: no record, so not resumable
        assertThat(stored.incomplete()).isNull();
        assertThat(ChangeService.whyNotResumed(stored, 2L, "print")).isEqualTo("the plan has no record of being incomplete");

        ChangePlan upgraded = ImpactAnalyzer.legacyIncomplete(stored, 2L, "print");

        assertThat(upgraded.incomplete()).isEqualTo(new ChangePlan.Incomplete(ChangePlan.Incomplete.LIMIT, LEGACY_RISK, 2L, "print"));
        assertThat(upgraded.items()).isEqualTo(stored.items());
        assertThat(ChangeService.resumes(upgraded, 2L, "print")).isTrue();
        // the code moved on, or the spec or designs are not known to be the same: afresh, and the log says why
        assertThat(ChangeService.whyNotResumed(upgraded, 3L, "print")).startsWith("the code revision changed (planned at r2, now r3)");
        assertThat(ChangeService.whyNotResumed(ImpactAnalyzer.legacyIncomplete(stored, 2L, null), 2L, "print"))
                .isEqualTo("the spec or the screen designs changed since the plan was made");
        assertThat(ChangeService.whyNotResumed(null, 2L, "print")).isEqualTo("there is no plan to continue");
    }

    @Test
    void onlyTheServersOwnRiskUpgradesAPlanAndARecordIsNeverReplaced() {
        // a risk that only starts like it (the model's words, without the server's limit message) does not
        ChangePlan modelWords = new ChangePlan("x", legacyPlan().items(), List.of(ImpactAnalyzer.LIMIT_STOPPED + ", so add files."));
        assertThat(ImpactAnalyzer.legacyIncomplete(modelWords, 2L, "print")).isSameAs(modelWords);
        // nor a cut-off risk, nor a plan without risks
        ChangePlan cut = new ChangePlan("x", legacyPlan().items(), List.of(ImpactAnalyzer.CUT_OFF + " (x), so files may be missing."));
        assertThat(ImpactAnalyzer.legacyIncomplete(cut, 2L, "print").incomplete()).isNull();
        assertThat(ImpactAnalyzer.legacyIncomplete(new ChangePlan("x", legacyPlan().items(), null), 2L, "print").incomplete()).isNull();
        // a plan with its record keeps it
        ChangePlan recorded = new ChangePlan("x", legacyPlan().items(), legacyPlan().risks(),
                new ChangePlan.Incomplete(ChangePlan.Incomplete.CUT_OFF, "cut", 5L, "other"));
        assertThat(ImpactAnalyzer.legacyIncomplete(recorded, 2L, "print")).isSameAs(recorded);
        // a plan sent in (an edit, a model's answer) loses the risk, so it can never be upgraded
        assertThat(PlanParser.normalize(legacyPlan(), path -> false, 30).risks()).noneMatch(ImpactAnalyzer::incompleteRisk);
    }

    @Test
    void anUpgradedLegacyPlanIsApprovedOnlyWhenConfirmed() {
        ChangePlan upgraded = ImpactAnalyzer.legacyIncomplete(legacyPlan(), 2L, null);
        assertThatThrownBy(() -> ChangeService.requireCompletePlan(upgraded, null)).isInstanceOf(ConflictException.class)
                .hasMessageStartingWith(ChangeService.INCOMPLETE_PLAN);
    }

    @Test
    void theSpecAndDesignsCountAsUnchangedOnlyWhenApprovedBeforeThePlanWasStored() {
        OffsetDateTime stored = OffsetDateTime.parse("2026-11-02T10:53:43Z");
        assertThat(ChangeService.madeAfter(stored, List.of(stored.minusDays(1), stored.minusHours(2)))).isTrue();
        assertThat(ChangeService.madeAfter(stored, List.of(stored.minusDays(1), stored.plusMinutes(1)))).isFalse();
        // a design reopened (no approval) or no plan revision recorded: not known
        assertThat(ChangeService.madeAfter(stored, Arrays.asList(stored.minusDays(1), null))).isFalse();
        assertThat(ChangeService.madeAfter(null, List.of(stored))).isFalse();
    }

    @Test
    void aLegacyPlanIsContinuedWithItsFilesKept() {
        PlanAndViewFixesTest.Planner model = new PlanAndViewFixesTest.Planner();
        model.replies.add("{\"items\": [{\"path\": \"backend/test/com/bank/obdx/payments/StandingInstructionResourceTest.java\", "
                + "\"layer\": \"test\"}], \"risks\": []}");

        ChangePlan plan = analyzer().resumeWith(model, ImpactAnalyzer.legacyIncomplete(legacyPlan(), 2L, "print"));

        assertThat(model.prompts).singleElement().asString().contains(ImpactAnalyzer.RESUMED.strip());
        assertThat(plan.items()).hasSize(3);
        assertThat(plan.incomplete()).isNull();
        assertThat(plan.risks()).noneMatch(ImpactAnalyzer::incompleteRisk);
    }

    // --- R19-2: an API is served by a resource whose name or details say so ---

    private static final RequirementSpec BRD1 = SpecParser.parse("""
            {"title": "Standing instructions",
             "apis": [{"name": "POST /payments/standingInstructions", "method": "POST"},
                      {"name": "GET /payments/standingInstructions", "method": "GET"},
                      {"name": "GET /payments/standingInstructions/{instructionId}", "method": "GET"},
                      {"name": "DELETE /payments/standingInstructions/{instructionId}", "method": "DELETE"}]}
            """, "x");

    private static ChangePlan.Item resource(String path, String details) {
        return new ChangePlan.Item(path, "create", "service", "Expose REST endpoints.", List.of(), details);
    }

    @Test
    void round19sStandInstructionResourceServesTheStandingInstructionsApis() {
        // the round 19 plan: StandInstructionResource.java with @Path('/payments/standingInstructions') in its details
        ChangePlan plan = new ChangePlan("x", List.of(resource("backend/src/com/bank/obdx/payments/StandInstructionResource.java",
                "Define @Path('/payments/standingInstructions') with POST (create), GET (list), GET/{instructionId} (details), and "
                        + "DELETE/{instructionId} (cancel) (FR-008).")), List.of());

        assertThat(PlanReview.review(plan, BRD1, Map.of()).risks()).noneMatch(r -> r.startsWith(PlanReview.UNSERVED_API));
    }

    @Test
    void aResourceServesByItsDetailsOrByTheWordsOfItsName() {
        String path = "/payments/standingInstructions/{instructionId}";
        // details that name the path or its compound last segment
        assertThat(PlanReview.serves(resource("backend/SiResource.java", "Serves /payments/standingInstructions."), path)).isTrue();
        assertThat(PlanReview.serves(resource("backend/SiResource.java", "GET standingInstructions by id."), path)).isTrue();
        // words of the name, shortened ones too
        assertThat(PlanReview.serves(resource("backend/StandInstructionResource.java", null), path)).isTrue();
        assertThat(PlanReview.serves(resource("backend/StandInstrResource.java", null), path)).isTrue();
        assertThat(PlanReview.serves(resource("backend/standing-instruction-api.java", null), path)).isTrue();
        assertThat(PlanReview.words("StandInstructionDTOResponse")).containsExactly("stand", "instruction", "dto", "response");
        assertThat(PlanReview.words("standing-instructions")).containsExactly("standing", "instruction");
    }

    @Test
    void aGenuinelyMissingResourceIsStillFlagged() {
        String path = "/payments/standingInstructions";
        // another resource, a shortening too short, a word the path lacks, the segment only inside a longer word
        assertThat(PlanReview.serves(resource("backend/PayeeResource.java", "Serves /payments/payees."), path)).isFalse();
        assertThat(PlanReview.serves(resource("backend/SiResource.java", null), path)).isFalse();
        assertThat(PlanReview.serves(resource("backend/StandingOrderResource.java", null), path)).isFalse();
        assertThat(PlanReview.serves(resource("backend/InstructionResource.java", "Lists instructions."), path)).isFalse();
        assertThat(PlanReview.serves(resource("backend/PayeeResource.java", "See /payments/standingInstructionsArchive."), path)).isFalse();
        // a one-word segment is named only with its slash
        assertThat(PlanReview.serves(resource("backend/BeneficiaryResource.java", "Runs the validation."), "/payments/beneficiaries/validation"))
                .isFalse();
        assertThat(PlanReview.serves(resource("backend/BeneficiaryResource.java", "POST /payments/beneficiaries/validation."),
                "/payments/beneficiaries/validation")).isTrue();

        ChangePlan plan = new ChangePlan("x", List.of(resource("backend/src/com/bank/obdx/payments/PayeeResource.java", "Serves payees."),
                new ChangePlan.Item("backend/src/com/bank/obdx/payments/service/StandInstructionService.java", "create", "service", null,
                        List.of(), "Serves /payments/standingInstructions.")), List.of());
        // a service that names the path serves nothing: a resource does
        assertThat(PlanReview.review(plan, BRD1, Map.of()).risks().stream().filter(r -> r.startsWith(PlanReview.UNSERVED_API))).hasSize(4);
    }

    @Test
    void thePlannerIsAskedToNameEachResourcesPathsAndTestsPerResourceAndViewModel() {
        assertThat(ImpactAnalyzer.SYSTEM).contains("For each REST resource, name in its details the API paths it serves",
                "at least one test file", "for each REST resource or service", "one for each view model");
    }

    // --- R19-3: the model's reasoning in a plan's text ---

    @Test
    void round19sReasoningRiskIsDroppedAndRealRisksKept() {
        String reasoning = "The JSON provided was truncated, so some screen designs and code were missing, but the path structure "
                + "matched the previous files. The previous answer likely created the model.js files using paths like "
                + "'channel/components/modules/payments/stand-instr-list/model.js' which might be read as part of the UI.";
        ChangePlan plan = PlanParser.normalize(new ChangePlan("x", List.of(new ChangePlan.Item("backend/A.java", "create", "service",
                "Let's assume the host is up. Create the DTO.", List.of(), "Fields as on the screen. Wait, I already planned this. Add amount.")),
                List.of(reasoning, "Host error codes are not given in the spec.", "The last response of the host may be stale.")),
                path -> false, 30);

        assertThat(plan.risks()).containsExactly("Host error codes are not given in the spec.", "The last response of the host may be stale.");
        assertThat(plan.items().getFirst().purpose()).isEqualTo("Create the DTO.");
        assertThat(plan.items().getFirst().details()).isEqualTo("Fields as on the screen. Add amount.");
    }

    @Test
    void reasoningSentencesAreFoundOnlyWhereTheModelTalksAboutItself() {
        assertThat(ModelReasoning.withoutReasoningSentences("The spec provided is incomplete about the host's error codes."))
                .isEqualTo("The spec provided is incomplete about the host's error codes.");
        assertThat(ModelReasoning.withoutReasoningSentences("Retention is unknown; ask Compliance.")).isEqualTo("Retention is unknown; ask Compliance.");
        assertThat(ModelReasoning.withoutReasoningSentences("The prompt says to use v2. Use model.js for calls."))
                .isEqualTo("Use model.js for calls.");
        assertThat(ModelReasoning.withoutReasoningSentences("As an AI I cannot see the code.")).isEmpty();
        assertThat(ModelReasoning.withoutReasoningSentences(null)).isNull();
    }

    // --- R19-4: the stage by the path first ---

    @Test
    void uiFilesTheModelCalledServiceAreWrittenWithTheUiAndShownSo() {
        ChangePlan plan = PlanParser.parse("""
                {"items": [
                  {"path": "channel/components/modules/payments/stand-instr-details/model.js", "layer": "service"},
                  {"path": "channel/resources/nls/stand-instr-details.js", "layer": "service"},
                  {"path": "backend/src/com/bank/obdx/payments/StandInstructionResource.java", "layer": "service"},
                  {"path": "backend/src/com/bank/obdx/payments/service/StandInstructionService.java", "layer": "service"},
                  {"path": "channel/components/modules/payments/stand-instr-details/stand-instr-details.html", "layer": "service"},
                  {"path": "backend/test/com/bank/obdx/payments/StandInstructionResourceTest.java", "layer": "service"},
                  {"path": "db/stand-instr/01_create_table.sql", "layer": "ui"}]}
                """, path -> false, 30);

        assertThat(plan.items()).extracting(ChangePlan.Item::path).containsExactly("db/stand-instr/01_create_table.sql",
                "backend/src/com/bank/obdx/payments/service/StandInstructionService.java",
                "backend/src/com/bank/obdx/payments/StandInstructionResource.java",
                "channel/resources/nls/stand-instr-details.js",
                "channel/components/modules/payments/stand-instr-details/model.js",
                "channel/components/modules/payments/stand-instr-details/stand-instr-details.html",
                "backend/test/com/bank/obdx/payments/StandInstructionResourceTest.java");
        // the UI files' layer is the UI's; a back-end file's is left as given
        assertThat(plan.items()).filteredOn(i -> i.path().startsWith("channel/")).extracting(ChangePlan.Item::layer).containsOnly("ui");
        assertThat(plan.items()).filteredOn(i -> i.path().endsWith("Service.java")).extracting(ChangePlan.Item::layer).containsOnly("service");
        assertThat(PlanParser.uiPath("backend/src/com/bank/channel/components/x.java")).isFalse();
        assertThat(PlanParser.uiPath("app/src/components/si/list.tsx")).isTrue();
        assertThat(PlanParser.uiPath("backend/src/config/app.json")).isFalse();
    }

    // --- R19-5: Write again fixes the file it wrote ---

    @Test
    void writeAgainFixesTheFileItWroteOnceButNotAFailedOneOrAnEdit() {
        String define = JsModuleChecks.WRONG_BINDING + ": oj receives 'ojs/ojknockout' (module 4), not 'ojs/ojcore'.";
        String path = "channel/components/modules/dashboard/quick-transfer/quick-transfer.js";
        Map<String, String> unfit = new LinkedHashMap<>(Map.of(path, define, "other.js", define));
        List<ChangeFileStore.ChangeFile> all = List.of(written(path, false, define), written("other.js", false, define));
        Set<String> writtenNow = new LinkedHashSet<>(List.of(path));

        assertThat(ChangeService.toFit(unfit, ChangeService.fitNow(path, null, writtenNow), all, false)).containsExactly(path);
        // writing it again failed: the earlier version stays as it was
        assertThat(ChangeService.toFit(unfit, ChangeService.fitNow(path, "the pieces did not join", writtenNow), all, false)).isEmpty();
        // a reviewer's edit is never rewritten
        assertThat(ChangeService.toFit(unfit, ChangeService.fitNow(path, null, writtenNow), List.of(written(path, true, define)), false))
                .isEmpty();
        // a whole generation: the files it wrote, as before
        assertThat(ChangeService.fitNow(null, null, Set.of("a.js", "b.js"))).containsExactlyInAnyOrder("a.js", "b.js");
    }

    private static ChangeFileStore.ChangeFile written(String path, boolean edited, String finding) {
        return new ChangeFileStore.ChangeFile(0, path, "create", "ui", null, ChangeFileStore.Status.GENERATED, null, "x", edited,
                FileChecks.Status.FAILED, finding, 1, null, false, false);
    }

    // --- R19-6: tests in an incomplete plan ---

    @Test
    void aPlanStoppedBeforeItsTestsSaysSo() {
        PlanAndViewFixesTest.Planner model = new PlanAndViewFixesTest.Planner();
        model.replies.add(new ModelLimitReachedException("daily limit reached", true, null));
        ChangeContext withCriteria = new ChangeContext("Standing instructions",
                "{\"acceptanceCriteria\":[{\"id\":\"AC-001\",\"description\":\"Given ... then ...\"}]}", null, "", "backend/: 3");

        ChangePlan plan = analyzer().resumeWith(model, withCriteria, ImpactAnalyzer.legacyIncomplete(legacyPlan(), 2L, "print"));

        assertThat(plan.incomplete().risk()).endsWith(ImpactAnalyzer.TESTS_MISSING);
        assertThat(plan.risks().getFirst()).isEqualTo(plan.incomplete().risk());
        // no criteria, or a test planned: nothing added
        assertThat(ImpactAnalyzer.testsMissing(new ChangeContext("x", "{}", null, "", ""), legacyPlan())).isEmpty();
        List<ChangePlan.Item> withTest = new ArrayList<>(legacyPlan().items());
        withTest.add(new ChangePlan.Item("backend/test/SiResourceTest.java", "create", "test", null, List.of(), null));
        assertThat(ImpactAnalyzer.testsMissing(withCriteria, new ChangePlan("x", withTest, List.of()))).isEmpty();
    }

    private static Analyzer analyzer() {
        return new Analyzer();
    }

    /** Resumes a plan with a scripted model. */
    private static final class Analyzer {
        ChangePlan resumeWith(PlanAndViewFixesTest.Planner model, ChangePlan incomplete) {
            return resumeWith(model, new ChangeContext("Standing instructions", "{\"apis\": []}", null, "", "backend/: 3"), incomplete);
        }

        ChangePlan resumeWith(PlanAndViewFixesTest.Planner model, ChangeContext context, ChangePlan incomplete) {
            return new ImpactAnalyzer(model, new ChangeProperties(30, 25, DataSize.ofKilobytes(80), 2, "branches/factory", "-"))
                    .resume(context, List.of(), path -> false, incomplete);
        }
    }
}
