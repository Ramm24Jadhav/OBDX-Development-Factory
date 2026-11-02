package com.obdx.factory.change;

import com.obdx.factory.common.ConflictException;
import com.obdx.factory.model.ModelLimitReachedException;
import com.obdx.factory.pack.ModelReasoning;
import com.obdx.factory.requirements.RequirementSpec;
import com.obdx.factory.requirements.SpecParser;
import org.junit.jupiter.api.Test;
import org.springframework.util.unit.DataSize;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * QA round 19 and the review and VAPT of its fixes: what the BRD1 and BRD3 runs and the probes showed, fixed (the plans
 * and messages are those of the runs, shortened, without the model's name or the account).
 */
class QaRound19Test {

    // --- R19-1, V2, V3, R6, R7, R11: plans stored by an earlier version ---

    /** Round 18's BRD1 plan as stored: the server's risk, no record. */
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
    void aStoredLegacyPlanGetsItsRecordOnceFromWhatTheAnalysisStoredButIsNotContinued() {
        // why round 19 started over: no record
        assertThat(ChangeService.whyNotResumed(legacyPlan(), 2L, "print")).isEqualTo("the plan has no record of being incomplete");

        ChangePlan.Incomplete record = ImpactAnalyzer.legacyRecord(legacyPlan(), "ANALYZED");

        assertThat(record).isEqualTo(new ChangePlan.Incomplete(ChangePlan.Incomplete.LIMIT, LEGACY_RISK, null, null));
        ChangePlan upgraded = new ChangePlan("x", legacyPlan().items(), legacyPlan().risks(), record);
        // what it was made from was not recorded: analyzed afresh, and the log says why
        assertThat(ChangeService.resumes(upgraded, 2L, "print")).isFalse();
        assertThat(ChangeService.whyNotResumed(upgraded, 2L, "print")).contains("stored by an earlier version");
        // approving it asks for the confirmation, as for any incomplete plan
        assertThatThrownBy(() -> ChangeService.requireCompletePlan(upgraded, null)).isInstanceOf(ConflictException.class)
                .hasMessageStartingWith(ChangeService.INCOMPLETE_PLAN);
        // an edit keeps it (V3): the stored plan carries the record, so a save without changes does not drop it
        ChangePlan edited = ChangeService.carryIncomplete(upgraded, PlanParser.parse(jsonOf(upgraded), path -> false, 30));
        assertThat(edited.incomplete()).isEqualTo(record);
        assertThat(edited.risks().stream().filter(ImpactAnalyzer::incompleteRisk)).containsExactly(LEGACY_RISK);
    }

    @Test
    void theOtherKindsAreUpgradedTooButOnlyFromTheAnalysissOwnLatestRevision() {
        String cut = ImpactAnalyzer.CUT_OFF + " (its server writes at most 8000 tokens per answer), so files may be missing.";
        String tooMany = ImpactAnalyzer.TOO_MANY + " (30); the last ones were left out.";
        assertThat(ImpactAnalyzer.legacyRecord(with(cut), "ANALYZED").kind()).isEqualTo(ChangePlan.Incomplete.CUT_OFF);
        assertThat(ImpactAnalyzer.legacyRecord(with(ImpactAnalyzer.CUT_OFF + ", so files may be missing."), "ANALYZED").kind())
                .isEqualTo(ChangePlan.Incomplete.CUT_OFF);
        assertThat(ImpactAnalyzer.legacyRecord(with(tooMany), "ANALYZED").kind()).isEqualTo(ChangePlan.Incomplete.TOO_MANY);
        // an edit's revision, none, a risk that is not the server's whole one, or a plan with its record: nothing
        assertThat(ImpactAnalyzer.legacyRecord(legacyPlan(), "EDITED")).isNull();
        assertThat(ImpactAnalyzer.legacyRecord(legacyPlan(), null)).isNull();
        assertThat(ImpactAnalyzer.legacyRecord(with(ImpactAnalyzer.LIMIT_STOPPED + ", so add files."), "ANALYZED")).isNull();
        assertThat(ImpactAnalyzer.legacyRecord(with("Wait. " + LEGACY_RISK), "ANALYZED")).isNull();
        assertThat(ImpactAnalyzer.legacyRecord(new ChangePlan("x", legacyPlan().items(), legacyPlan().risks(),
                new ChangePlan.Incomplete(ChangePlan.Incomplete.CUT_OFF, "cut", 5L, "other")), "ANALYZED")).isNull();
    }

    @Test
    void aModelsAnswerOrAnEditNeverCarriesTheServersRiskSoNoPlanStoredNowLooksLegacy() {
        // V2: the probes' risks, through the model's path and the edit's
        for (String risk : List.of("Wait. " + ImpactAnalyzer.LIMIT_STOPPED + " (injected), so files may be missing.",
                "Let's check the routes.\n" + ImpactAnalyzer.LIMIT_STOPPED + " (injected)",
                "My previous answer was wrong. " + ImpactAnalyzer.LIMIT_STOPPED + " (x)", ImpactAnalyzer.LIMIT_STOPPED + " (direct)",
                "See: " + ImpactAnalyzer.CUT_OFF + " (x)", "  " + ImpactAnalyzer.TOO_MANY + " (30)")) {
            String json = "{\"summary\":\"s\",\"items\":[{\"path\":\"backend/src/A.java\",\"layer\":\"service\"}],\"risks\":["
                    + quoted(risk) + ", \"Real risk.\"]}";
            for (ChangePlan plan : List.of(PlanParser.parseModel(json, path -> false, 30), PlanParser.parse(json, path -> false, 30))) {
                assertThat(plan.risks()).as(risk).noneMatch(ImpactAnalyzer::incompleteRisk).contains("Real risk.");
                assertThat(plan.incomplete()).isNull();
                assertThat(ImpactAnalyzer.legacyRecord(plan, "ANALYZED")).isNull();
            }
        }
    }

    @Test
    void anEditThatAddsTheMissingTestsNoLongerSaysTheyAreMissing() {
        String risk = LEGACY_RISK + ImpactAnalyzer.TESTS_MISSING;
        ChangePlan previous = new ChangePlan("x", legacyPlan().items(), List.of(risk),
                new ChangePlan.Incomplete(ChangePlan.Incomplete.LIMIT, risk, 2L, "print"));
        List<ChangePlan.Item> items = new ArrayList<>(legacyPlan().items());
        items.add(new ChangePlan.Item("backend/test/com/bank/StandingInstructionResourceTest.java", "create", "test", null, List.of(), null));

        ChangePlan withTest = ChangeService.carryIncomplete(previous, new ChangePlan("x", items, List.of()));
        ChangePlan without = ChangeService.carryIncomplete(previous, new ChangePlan("x", legacyPlan().items(), List.of()));

        assertThat(withTest.incomplete().risk()).isEqualTo(LEGACY_RISK);
        assertThat(withTest.risks().getFirst()).isEqualTo(LEGACY_RISK);
        assertThat(without.incomplete().risk()).isEqualTo(risk);
    }

    private static ChangePlan with(String risk) {
        return new ChangePlan("x", legacyPlan().items(), List.of(risk));
    }

    private static String jsonOf(ChangePlan plan) {
        StringBuilder json = new StringBuilder("{\"summary\": " + quoted(plan.summary()) + ", \"items\": [");
        for (int i = 0; i < plan.items().size(); i++) {
            ChangePlan.Item item = plan.items().get(i);
            json.append(i == 0 ? "" : ",").append("{\"path\": ").append(quoted(item.path())).append(", \"layer\": ").append(quoted(item.layer()))
                    .append(", \"purpose\": ").append(quoted(item.purpose())).append(", \"details\": ").append(quoted(item.details())).append('}');
        }
        json.append("], \"risks\": [");
        for (int i = 0; i < plan.risks().size(); i++) {
            json.append(i == 0 ? "" : ",").append(quoted(plan.risks().get(i)));
        }
        return json.append("]}").toString();
    }

    private static String quoted(String s) {
        return "\"" + s.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n") + "\"";
    }

    // --- R19-2, R4, V4: an API is served by a resource whose name or declared paths say so ---

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
        ChangePlan plan = new ChangePlan("x", List.of(resource("backend/src/com/bank/obdx/payments/StandInstructionResource.java",
                "Define @Path('/payments/standingInstructions') with POST (create), GET (list), GET/{instructionId} (details), and "
                        + "DELETE/{instructionId} (cancel) (FR-008).")), List.of());

        assertThat(PlanReview.review(plan, BRD1, Map.of()).risks()).noneMatch(r -> r.startsWith(PlanReview.UNSERVED_API));
    }

    @Test
    void aResourceServesByTheWordsOfItsNameOrThePathsItDeclares() {
        String path = "/payments/standingInstructions/{instructionId}";
        assertThat(PlanReview.serves(resource("backend/SiResource.java", "GET /payments/standingInstructions/{id}"), path)).isTrue();
        // a base path serves the paths under it; OBDX's /digx/v1 base and a version are left out
        assertThat(PlanReview.serves(resource("backend/SiResource.java", "@Path(\"/digx/v1/payments/standingInstructions\")"), path)).isTrue();
        assertThat(PlanReview.serves(resource("backend/FooResource.java", "GET /payments/v2"), "/payments/v2")).isTrue();
        assertThat(PlanReview.serves(resource("backend/StandInstructionResource.java", null), path)).isTrue();
        assertThat(PlanReview.serves(resource("backend/StandInstrResource.java", null), path)).isTrue();
        assertThat(PlanReview.serves(resource("x/StandingInstructionResource.java", null), "/payments/standing-instructions")).isTrue();
        assertThat(PlanReview.serves(resource("x/AccountLimitResource.java", null), "/accounts/{id}/limits")).isTrue();
        assertThat(PlanReview.words("StandInstructionDTOResponse")).containsExactly("stand", "instruction", "dto", "response");
    }

    @Test
    void aGenuinelyMissingResourceIsStillFlagged() {
        String si = "/payments/standingInstructions";
        // R4's probes: a parent path, a mention in prose, the same segment under another parent, a word that only starts alike
        assertThat(PlanReview.serves(resource("x/StandingInstructionResource.java", "POST /payments/standingInstructions"), "/payments"))
                .isFalse();
        assertThat(PlanReview.serves(resource("x/BillResource.java", "Unlike /payments/standingInstructions, this one serves bills only."),
                si)).isFalse();
        assertThat(PlanReview.serves(resource("x/CardLimitResource.java", "GET /cards/{id}/limits"), "/accounts/{id}/limits")).isFalse();
        assertThat(PlanReview.serves(resource("x/BillResource.java", "Bill payments"), "/payments/billers")).isFalse();
        assertThat(PlanReview.serves(resource("x/ScheduledPaymentResource.java", "Scheduled payments"), "/loans/{id}/schedule")).isFalse();
        assertThat(PlanReview.serves(resource("x/ChargebackResource.java", "Disputes"), "/accounts/{id}/charges")).isFalse();
        assertThat(PlanReview.serves(resource("x/PayResource.java", ""), "/payments/payees")).isFalse();
        assertThat(PlanReview.serves(resource("x/SiResource.java", ""), si)).isFalse();
        assertThat(PlanReview.serves(resource("x/ApiResource.java", ""), si)).isFalse();
        assertThat(PlanReview.serves(resource("x/FooResource.java", "handles standingInstructions"), si)).isFalse();
        assertThat(PlanReview.serves(resource("x/FooResource.java", "POST /payments/transfers"), "/payments/transferLimits")).isFalse();
        assertThat(PlanReview.serves(resource("x/PayeeResource.java", "See GET /payments/standingInstructionsArchive."), si)).isFalse();
        assertThat(PlanReview.abbreviates("bill", "biller")).isFalse();
        assertThat(PlanReview.abbreviates("instr", "instruction")).isTrue();

        ChangePlan plan = new ChangePlan("x", List.of(resource("backend/src/com/bank/obdx/payments/PayeeResource.java", "Serves payees."),
                new ChangePlan.Item("backend/src/com/bank/obdx/payments/service/StandInstructionService.java", "create", "service", null,
                        List.of(), "POST /payments/standingInstructions.")), List.of());
        // a service that names the path serves nothing: a resource does
        assertThat(PlanReview.review(plan, BRD1, Map.of()).risks().stream().filter(r -> r.startsWith(PlanReview.UNSERVED_API))).hasSize(4);
    }

    @Test
    void thePlannerIsAskedToNameEachResourcesPathsAndTestsPerResourceAndViewModel() {
        assertThat(ImpactAnalyzer.SYSTEM).contains("For each REST resource, name in its details the API paths it serves",
                "at least one test file", "for each REST resource or service", "one for each view model");
    }

    // --- R19-3, R1: the model's reasoning in a plan's text, and only there ---

    @Test
    void round19sReasoningRiskIsDroppedFromTheModelsPlanAndRealRisksKept() {
        String reasoning = "The JSON provided was truncated, so some screen designs and code were missing, but the path structure "
                + "matched the previous files. The previous answer likely created the model.js files using paths like "
                + "'channel/components/modules/payments/stand-instr-list/model.js' which might be read as part of the UI.";
        String json = "{\"items\": [{\"path\": \"backend/A.java\", \"layer\": \"service\", \"purpose\": \"Let's check the host first. Create the "
                + "DTO.\", \"details\": \"Fields as on the screen. Wait, I already planned this. Add amount.\"}], \"risks\": [" + quoted(reasoning)
                + ", \"Host error codes are not given in the spec.\", \"The last response of the host may be stale.\"]}";

        ChangePlan plan = PlanParser.parseModel(json, path -> false, 30);

        assertThat(plan.risks()).containsExactly("Host error codes are not given in the spec.", "The last response of the host may be stale.");
        assertThat(plan.items().getFirst().purpose()).isEqualTo("Create the DTO.");
        assertThat(plan.items().getFirst().details()).isEqualTo("Fields as on the screen. Add amount.");
        // a reviewer's edit keeps its words
        ChangePlan edited = PlanParser.parse(json, path -> false, 30);
        assertThat(edited.risks()).first().isEqualTo(reasoning);
        assertThat(edited.items().getFirst().details()).contains("Wait, I already planned this.");
    }

    @Test
    void aDevelopersWordsAboutTheHostOrTheUserAreKept() {
        // R1's probes: each kept as it is
        for (String text : List.of("Shows a confirmation dialog when the user asks to delete an instruction.",
                "Adds the frequency field. The user wants weekly and monthly only (FR-003).",
                "Wait times for the host can exceed 30 seconds; add a timeout.", "OK wait for the batch to finish before reading the file.",
                "Add field X.\nWait: the host returns Y.", "The previous output file of the batch job is overwritten each night.",
                "The previous answer from the host is cached; refresh it.", "Our previous attempt to reconcile with the host failed silently.",
                "The input given was truncated by the host at 35 characters, so names may be cut.",
                "The text provided is cut to 35 characters by the host. Validate length.",
                "In this response the host returns 200 with an error body.", "The prompt does not specify the currency; assume INR.",
                "Amount must be > 0. The prompt says nothing about currency. Use the account currency.",
                "Let's assume the host returns ISO dates.", "Your last response time budget is 2s.",
                "The previous version of the host API returned XML.", "I/O errors from the file store are not handled.",
                "Validate the amount, e.g. the user wants to pay 0.", "Use Mr. Smith's format? No.",
                "The spec provided is incomplete about the host's error codes.")) {
            assertThat(ModelReasoning.withoutReasoningSentences(text)).as(text).isEqualTo(text);
        }
    }

    @Test
    void whatIsKeptStaysAsWritten() {
        assertThat(ModelReasoning.withoutReasoningSentences("    indented details\n  - keep  this   bullet\n  - and this"))
                .isEqualTo("    indented details\n  - keep  this   bullet\n  - and this");
        assertThat(ModelReasoning.withoutReasoningSentences("Wait, recheck the DTO.\n    if (x) {\n        y();\n    }"))
                .isEqualTo("    if (x) {\n        y();\n    }");
        assertThat(ModelReasoning.withoutReasoningSentences("The prompt says to use v2. Use model.js for calls.")).isEqualTo("Use model.js for calls.");
        assertThat(ModelReasoning.withoutReasoningSentences("Version 1.2.3 of the SDK. Wait, it may be 1.3.")).isEqualTo("Version 1.2.3 of the SDK.");
        assertThat(ModelReasoning.withoutReasoningSentences("As an AI I cannot see the code.")).isEmpty();
        assertThat(ModelReasoning.withoutReasoningSentences(null)).isNull();
    }

    // --- R19-4, R9: the stage and layer by the path first ---

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
        assertThat(plan.items()).filteredOn(i -> i.path().startsWith("channel/")).extracting(ChangePlan.Item::layer).containsOnly("ui");
        assertThat(plan.items()).filteredOn(i -> i.path().endsWith("Service.java")).extracting(ChangePlan.Item::layer).containsOnly("service");
        assertThat(PlanParser.uiPath("app/src/components/si/list.tsx")).isTrue();
        assertThat(PlanParser.uiPath("channel/resources/nls/messages.properties")).isTrue();
    }

    @Test
    void serverFilesBuildFilesAndDocsAreNotTheUisAndTestsComeLast() {
        // R9's probes
        for (String path : List.of("backend/src/com/bank/channel/components/x.java", "backend/src/config/app.json", "channel/server/js/app.js",
                "channel/server/config/server.json", "backend/components/payments/config.json", "channel/components/payments/payments.json",
                "server/src/main/resources/templates/mail.html", "src/main/resources/nls/messages.properties", "docs/api/index.html",
                "backend/src/main/resources/static/components/x.css", "channel/build/gruntfile.js", "channel/package.json")) {
            assertThat(PlanParser.uiPath(path)).as(path).isFalse();
        }
        // a test the model put under the UI's folders is written after everything, whatever its path
        assertThat(PlanParser.stage("test", "channel/qunit/payments/si.js")).isGreaterThanOrEqualTo(20);
        assertThat(PlanParser.stage("service", "channel/components/payments/model.js")).isBetween(10, 19);
    }

    // --- R19-5, R8: Write again fixes the file it wrote ---

    @Test
    void writeAgainFixesTheFileItWroteOnceButNotAFailedOneOrAnEdit() {
        String define = JsModuleChecks.WRONG_BINDING + ": oj receives 'ojs/ojknockout' (module 4), not 'ojs/ojcore'.";
        String path = "channel/components/modules/dashboard/quick-transfer/quick-transfer.js";
        Map<String, String> unfit = new LinkedHashMap<>(Map.of(path, define, "other.js", define));
        List<ChangeFileStore.ChangeFile> all = List.of(written(path, false, define), written("other.js", false, define));
        Set<String> writtenNow = new LinkedHashSet<>(List.of(path));

        assertThat(ChangeService.toFit(unfit, ChangeService.fitNow(path, null, writtenNow), all, false)).containsExactly(path);
        assertThat(ChangeService.toFit(unfit, ChangeService.fitNow(path, "the pieces did not join", writtenNow), all, false)).isEmpty();
        assertThat(ChangeService.toFit(unfit, ChangeService.fitNow(path, null, writtenNow), List.of(written(path, true, define)), false))
                .isEmpty();
        assertThat(ChangeService.fitNow(null, null, Set.of("a.js", "b.js"))).containsExactlyInAnyOrder("a.js", "b.js");
    }

    @Test
    void theFixAfterWriteAgainKeepsWhatTheReviewerAskedFor() {
        String define = JsModuleChecks.WRONG_BINDING + ": oj receives 'ojs/ojknockout'.";
        assertThat(ChangeService.fitNote(define, "a.js", "Use the payees service.")).startsWith(ChangeService.crossFileFixes(define))
                .endsWith("Keep what the reviewer asked for when this file was written again: Use the payees service.");
        assertThat(ChangeService.fitNote(define, "a.js", " ")).isEqualTo(ChangeService.crossFileFixes(define));
        assertThat(ChangeService.fitNote(define, null, "Use the payees service.")).isEqualTo(ChangeService.crossFileFixes(define));
        assertThat(ChangeService.fitNote(null, "a.js", "Use the payees service.")).isEmpty();
    }

    private static ChangeFileStore.ChangeFile written(String path, boolean edited, String finding) {
        return new ChangeFileStore.ChangeFile(0, path, "create", "ui", null, ChangeFileStore.Status.GENERATED, null, "x", edited,
                FileChecks.Status.FAILED, finding, 1, null, false, false);
    }

    // --- V5: no secrets in the messages people read ---

    @Test
    void secretsInAServersErrorAndAddressAreHidden() {
        assertThat(com.obdx.factory.common.Messages.redacted("401: Authorization: Bearer abc.def-123 was refused"))
                .isEqualTo("401: Authorization: Bearer [hidden] was refused");
        assertThat(com.obdx.factory.common.Messages.redacted("Incorrect API key provided: sk-proj-abcdefghij1234. Check it."))
                .isEqualTo("Incorrect API key provided: [hidden]. Check it.");
        assertThat(com.obdx.factory.common.Messages.redacted("{\"api_key\": \"abc123\", \"password\":\"p4ss\"} at https://h/v1?api-key=xyz&x=1"))
                .isEqualTo("{\"api_key\": \"[hidden]\", \"password\":\"[hidden]\"} at https://h/v1?api-key=[hidden]&x=1");
        // ordinary words stay
        assertThat(com.obdx.factory.common.Messages.redacted("Duplicate key: DIGX_SI_001; the token bucket is full; skip-list"))
                .isEqualTo("Duplicate key: DIGX_SI_001; the token bucket is full; skip-list");
        assertThat(com.obdx.factory.common.Messages.reason(new RuntimeException("failed: Bearer abc"))).isEqualTo("failed: Bearer [hidden]");
        assertThat(com.obdx.factory.model.ModelSettings.shown("https://user:secret@api.example.com:8443/openai/v1?api-key=x#f"))
                .isEqualTo("https://api.example.com:8443/openai/v1");
        assertThat(com.obdx.factory.model.ModelSettings.shown("http://localhost:11434/v1")).isEqualTo("http://localhost:11434/v1");
    }

    // --- R19-6: tests in an incomplete plan ---

    @Test
    void aPlanStoppedBeforeItsTestsSaysSo() {
        PlanAndViewFixesTest.Planner model = new PlanAndViewFixesTest.Planner();
        model.replies.add(new ModelLimitReachedException("daily limit reached", true, null));
        ChangeContext withCriteria = new ChangeContext("Standing instructions",
                "{\"acceptanceCriteria\":[{\"id\":\"AC-001\",\"description\":\"Given ... then ...\"}]}", null, "", "backend/: 3");
        ChangePlan incomplete = new ChangePlan("x", legacyPlan().items(), legacyPlan().risks(),
                new ChangePlan.Incomplete(ChangePlan.Incomplete.LIMIT, LEGACY_RISK, 2L, "print"));

        ChangePlan plan = new ImpactAnalyzer(model, new ChangeProperties(30, 25, DataSize.ofKilobytes(80), 2, "branches/factory", "-"))
                .resume(withCriteria, List.of(), path -> false, incomplete);

        assertThat(plan.incomplete().risk()).endsWith(ImpactAnalyzer.TESTS_MISSING);
        assertThat(plan.risks().getFirst()).isEqualTo(plan.incomplete().risk());
        assertThat(ImpactAnalyzer.testsMissing(new ChangeContext("x", "{}", null, "", ""), legacyPlan())).isEmpty();
        List<ChangePlan.Item> withTest = new ArrayList<>(legacyPlan().items());
        withTest.add(new ChangePlan.Item("backend/test/SiResourceTest.java", "create", "test", null, List.of(), null));
        assertThat(ImpactAnalyzer.testsMissing(withCriteria, new ChangePlan("x", withTest, List.of()))).isEmpty();
    }
}
