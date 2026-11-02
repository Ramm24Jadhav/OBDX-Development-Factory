package com.obdx.factory.change;

import com.obdx.factory.common.ConflictException;
import com.obdx.factory.model.ModelGateway;
import com.obdx.factory.model.ModelLimitReachedException;
import com.obdx.factory.pack.CheckScope;
import com.obdx.factory.pack.LocalChecks;
import com.obdx.factory.pack.VersionPacks;
import com.obdx.factory.requirements.RequirementSpec;
import com.obdx.factory.requirements.SpecParser;
import org.junit.jupiter.api.Test;
import org.springframework.util.unit.DataSize;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * QA round 18: a view written against the view model of its change, the lean fix of JavaScript and views after
 * Continue, an incomplete plan continued by Analyze again and approved only when confirmed, glue files the code
 * already has, and the order of the back end's files.
 */
class PlanAndViewFixesTest {

    private static final String FOLDER = "channel/components/modules/dashboard/quick-transfer/";

    /** The view model as the model wrote it for BRD3's Quick Transfer widget (shortened). */
    private static final String VIEW_MODEL = """
            define(['knockout', 'ojL10n!nls/quick-transfer', 'ojs/ojarraydataprovider', './model'], function (ko, nls, ArrayDataProvider, Model) {
              'use strict';
              return function QuickTransferViewModel(params) {
                const self = this;
                self.nls = nls;
                self.payees = ko.observableArray([]);
                self.selectedPayee = ko.observable(null);
                self.fromAccout = ko.observable('');
                self.amount = ko.observable('');
                self.hasActivePayees = ko.pureComputed(function () { return self.payees().length > 0; });
                self.accountsProvider = new ArrayDataProvider(self.payees, { keyAttributes: 'value' });
                self.loadPayees = function () { return Model.fetchPayees(); };
                self.choose = (payee) => self.selectedPayee(payee);
              };
            });
            """;

    /** Its view, written against names the view model never got (as in the round's quick-transfer.html). */
    private static final String VIEW = """
            <oj-bind-if test="[[hasActivePayees]]">
              <oj-bind-for-each data="[[payees]]" as="payee">
                <div on-click="[[selectPayee]]">[[getInitials(payee.data)]]</div>
              </oj-bind-for-each>
            </oj-bind-if>
            <oj-select-single data="[[accountDataProvider]]" value="{{fromAccountId}}"></oj-select-single>
            <oj-input-number value="{{amount}}"></oj-input-number>
            """;

    // --- R18-1: the view and its view model ---

    @Test
    void aViewsPromptGetsThePublicNamesOfItsViewModel() {
        ChangePlan.Item view = new ChangePlan.Item(FOLDER + "quick-transfer.html", "create", "ui", "Widget view", List.of(), null);
        Map<String, String> earlier = new LinkedHashMap<>();
        earlier.put("channel/resources/nls/quick-transfer.js", "define({root: {amount: 'Amount'}});");
        earlier.put(FOLDER + "quick-transfer.js", VIEW_MODEL);

        String outline = CodeGenerator.related(view, earlier, 1).get(FOLDER + "quick-transfer.js");

        assertThat(outline).startsWith("The view model's public names").contains("Observables: payees, selectedPayee, fromAccout, amount",
                "Computed: hasActivePayees", "Data providers: accountsProvider", "Functions: loadPayees, choose", "Other values: nls");
        // the view model, not its first lines: a view model longer than them still shows every name
        assertThat(outline).doesNotContain("define(");
    }

    @Test
    void aViewModelWrittenAfterItsViewGetsTheNamesTheViewBinds() {
        ChangePlan.Item viewModel = new ChangePlan.Item(FOLDER + "quick-transfer.js", "create", "ui", "Widget logic", List.of(), null);

        String outline = CodeGenerator.related(viewModel, Map.of(FOLDER + "quick-transfer.html", VIEW), 1).get(FOLDER + "quick-transfer.html");

        assertThat(outline).startsWith("Its view binds these names").contains("hasActivePayees, payees, selectPayee, getInitials",
                "accountDataProvider, fromAccountId, amount").doesNotContain("payee,");
    }

    @Test
    void aViewWhoseViewModelIsPlannedButNotWrittenSaysSo() {
        ChangePlan.Item view = new ChangePlan.Item(FOLDER + "quick-transfer.html", "create", "ui", null, List.of(), null);
        ChangePlan.Item viewModel = new ChangePlan.Item(FOLDER + "quick-transfer.js", "create", "ui", null, List.of(), null);
        ChangePlan plan = new ChangePlan("x", List.of(view, viewModel), List.of());

        assertThat(CodeGenerator.plannedViewModel(plan, view, Map.of())).isEqualTo(FOLDER + "quick-transfer.js");
        assertThat(CodeGenerator.plannedViewModel(plan, view, Map.of(FOLDER + "quick-transfer.js", VIEW_MODEL))).isNull();
        assertThat(CodeGenerator.plannedViewModel(plan, viewModel, Map.of())).isNull();
    }

    @Test
    void aViewBindingNamesTheViewModelOfItsChangeLacksIsAnError() {
        List<String> inChange = ViewBindings.problems(VIEW, VIEW_MODEL, true);

        assertThat(inChange).singleElement().asString().startsWith(ViewBindings.UNDEFINED_IN_CHANGE)
                .contains("define: selectPayee, getInitials, accountDataProvider, fromAccountId. ").doesNotContain("define: hasActivePayees")
                // the fix gets the names to use
                .contains("Data providers: accountsProvider");
        assertThat(inChange.getFirst().lines()).hasSize(1);
        assertThat(ChangeService.crossError(inChange.getFirst())).isTrue();
        assertThat(ChangeService.withCrossChecks(FileChecks.Status.PASSED, null, inChange).status()).isEqualTo(FileChecks.Status.FAILED);
        // its findings are replaced by the next cross-check and given to the fix
        assertThat(ChangeService.crossFileFixes(inChange.getFirst())).contains("selectPayee");

        // a view model of the codebase may take names from elsewhere: a warning
        List<String> existing = ViewBindings.problems(VIEW, VIEW_MODEL, false);
        assertThat(existing).singleElement().asString().startsWith(ViewBindings.UNDEFINED);
        assertThat(ChangeService.crossError(existing.getFirst())).isFalse();
        assertThat(ChangeService.withCrossChecks(FileChecks.Status.PASSED, null, existing).status()).isEqualTo(FileChecks.Status.WARNING);
    }

    @Test
    void onlyTheViewModelOfTheViewsNameWrittenInTheChangeMakesItAnError() {
        Map<String, String> written = Map.of(FOLDER + "quick-transfer.js", VIEW_MODEL);

        assertThat(ChangeService.viewModel(FOLDER + "quick-transfer.html", written, null).inChange()).isTrue();
        // a model.js with observables beside the view is a guess: a warning
        ChangeService.ViewModel model = ChangeService.viewModel(FOLDER + "quick-transfer.html", Map.of(FOLDER + "model.js", "self.x = ko.observable();"),
                null);
        assertThat(model.inChange()).isFalse();
        assertThat(ChangeService.viewModel(FOLDER + "quick-transfer.html", Map.of(), null)).isNull();
    }

    @Test
    void theOutlineOfAViewModelIsReadInLinearTime() {
        String long1 = "self.a" + "x".repeat(200_000) + " = " + "ko.observable(".repeat(20_000);
        String long2 = "self.b = (" + "a, ".repeat(100_000);
        long start = System.nanoTime();
        ViewBindings.outline(long1);
        ViewBindings.outline(long2 + "\n" + long1);
        ViewBindings.problems(VIEW, long2, true);
        assertThat((System.nanoTime() - start) / 1_000_000).isLessThan(5_000);
    }

    // --- R18-1 (c): the lean fix after Continue, and of JavaScript and views ---

    private static ChangeFileStore.ChangeFile written(String path, boolean edited) {
        return new ChangeFileStore.ChangeFile(0, path, "create", "ui", null, ChangeFileStore.Status.GENERATED, null, "x", edited,
                FileChecks.Status.FAILED, ViewBindings.UNDEFINED_IN_CHANGE + ": a.", 1);
    }

    @Test
    void continueAlsoFixesTheFilesTheStoppedRunWroteAfterThoseItWroteItself() {
        Map<String, String> unfit = new LinkedHashMap<>();
        List<ChangeFileStore.ChangeFile> all = new ArrayList<>();
        for (String name : List.of("a.js", "b.js", "c.html", "d.js", "e.html", "f.js", "g.js")) {
            unfit.put(name, "x");
            all.add(written(name, name.equals("b.js")));
        }
        Set<String> writtenNow = Set.of("e.html", "f.js");

        // written now first, then those the stopped run wrote; never a reviewer's edit (b.js); at most five
        assertThat(ChangeService.toFit(unfit, writtenNow, all, true)).containsExactly("e.html", "f.js", "a.js", "c.html", "d.js");
        // a run that was not continued fixes only its own files
        assertThat(ChangeService.toFit(unfit, writtenNow, all, false)).containsExactly("e.html", "f.js");
    }

    /** A server with a small per-minute limit: the fix is the lean one (only the file, its rules and the findings). */
    static final class SmallServer implements ModelGateway {
        final Deque<String> replies = new ArrayDeque<>();
        final List<String> prompts = new ArrayList<>();

        @Override
        public int tokensPerMinute() {
            return 6000;
        }

        @Override
        public ChatResult chat(String systemPrompt, String userPrompt) {
            prompts.add(userPrompt);
            return new ChatResult(replies.removeFirst(), "scripted", 1);
        }

        @Override
        public ChatResult chatJson(String systemPrompt, String userPrompt) {
            throw new UnsupportedOperationException();
        }

        @Override
        public float[] embed(String text) {
            throw new UnsupportedOperationException();
        }

        @Override
        public List<float[]> embedAll(List<String> texts) {
            throw new UnsupportedOperationException();
        }
    }

    @Test
    void aViewIsFixedByTheLeanFixWithTheViewModelsNames() {
        SmallServer model = new SmallServer();
        LocalChecks checks = new LocalChecks(VersionPacks.builtIn());
        CodeGenerator generator = new CodeGenerator(model, new ChangeProperties(30, 25, DataSize.ofKilobytes(80), 2, "branches/factory", "-"),
                checks);
        UUID change = UUID.randomUUID();
        String path = FOLDER + "quick-transfer.html";
        ChangePlan.Item item = new ChangePlan.Item(path, "create", "ui", "Widget view", List.of(), null);
        ChangePlan plan = new ChangePlan("x", List.of(item), List.of());
        String finding = ViewBindings.problems(VIEW, VIEW_MODEL, true).getFirst();
        ChangeFileStore.ChangeFile file = new ChangeFileStore.ChangeFile(0, path, "create", "ui", null, ChangeFileStore.Status.GENERATED, null,
                VIEW, false, FileChecks.Status.FAILED, finding, 1);
        ChangeFileStore files = mock(ChangeFileStore.class);
        when(files.file(change, path)).thenReturn(Optional.of(file));
        when(files.files(change)).thenReturn(List.of(file));
        String fixed = VIEW.replace("selectPayee", "choose").replace("accountDataProvider", "accountsProvider");
        model.replies.add(fixed);

        assertThat(ChangeService.fitToOthers(files, generator, checks, CheckScope.none(), change,
                new ChangeContext("x", "{\"screens\": []}", "[]", "", "channel/: 3"), plan, item, ChangeService.crossFileFixes(finding), null)).isTrue();

        verify(files).saveResult(eq(change), eq(path), eq(ChangeFileStore.Status.GENERATED), any(), eq(fixed), eq(false), any(), anyInt());
        assertThat(model.prompts).singleElement().asString().contains("Functions: loadPayees, choose", "You wrote this content");
    }

    // --- R18-2: an incomplete plan ---

    private static final RequirementSpec SPEC = SpecParser.parse("""
            {"title": "Standing instructions",
             "requirements": [{"id": "FR-001", "title": "Create an instruction"},
                              {"id": "FR-007", "title": "Audit", "description": "Store each instruction in a new table DIGX_PY_STANDING_INSTR."},
                              {"id": "FR-009", "title": "Notify the customer"}],
             "acceptanceCriteria": [{"id": "AC-001", "description": "Given ... then ..."}]}
            """, "x");

    private static final String LIMIT_RISK = ImpactAnalyzer.LIMIT_STOPPED + " (daily limit reached), so files may be missing from this plan.";

    private static ChangePlan incomplete() {
        return new ChangePlan("Standing instructions", List.of(
                new ChangePlan.Item("backend/src/com/bank/si/StandingInstructionDao.java", "create", "service", "DAO", List.of(),
                        "Implements FR-007: reads DIGX_PY_STANDING_INSTR."),
                new ChangePlan.Item("channel/components/modules/payments/si-create/si-create.js", "create", "ui", "Screen", List.of(),
                        "Implements FR-001.")), List.of(LIMIT_RISK, "Host API unknown."));
    }

    @Test
    void approvingAPlanTheModelsLimitStoppedNamesWhatLooksMissing() {
        assertThatThrownBy(() -> ChangeService.requireCompletePlan(incomplete(), SPEC)).isInstanceOf(ConflictException.class)
                .hasMessageStartingWith(ChangeService.INCOMPLETE_PLAN)
                .hasMessageContaining("no test planned (1 acceptance criteria)")
                .hasMessageContaining("no SQL script planned, though FR-007 needs a table")
                .hasMessageContaining("FR-009 not named by any planned file")
                .hasMessageContaining("approve it as it is");
        // a plan without that risk is approved as before
        ChangePlan complete = new ChangePlan("x", incomplete().items(), List.of("Host API unknown."));
        ChangeService.requireCompletePlan(complete, SPEC);
        // what cannot be told is said too
        assertThatThrownBy(() -> ChangeService.requireCompletePlan(new ChangePlan("x", List.of(new ChangePlan.Item("a/B.java", "create",
                "service", null, List.of(), null)), List.of(ImpactAnalyzer.CUT_OFF + ".")), null))
                .hasMessageContaining("cannot tell which ones");
    }

    @Test
    void aPlanThatNamesNoRequirementDoesNotListThemAll() {
        ChangePlan plan = new ChangePlan("x", List.of(new ChangePlan.Item("backend/src/A.sql", "create", "data", null, List.of(), null),
                new ChangePlan.Item("backend/test/ATest.java", "create", "test", null, List.of(), null)), List.of());

        assertThat(PlanReview.gaps(plan, SPEC)).isEmpty();
    }

    /** Plans with queued JSON answers and records the prompts. */
    static final class Planner implements ModelGateway {
        final Deque<Object> replies = new ArrayDeque<>();
        final List<String> prompts = new ArrayList<>();

        @Override
        public ChatResult chat(String systemPrompt, String userPrompt) {
            throw new UnsupportedOperationException();
        }

        @Override
        public ChatResult chatJson(String systemPrompt, String userPrompt) {
            prompts.add(userPrompt);
            Object next = replies.removeFirst();
            if (next instanceof RuntimeException e) {
                throw e;
            }
            return new ChatResult((String) next, "scripted", 1);
        }

        @Override
        public float[] embed(String text) {
            throw new UnsupportedOperationException();
        }

        @Override
        public List<float[]> embedAll(List<String> texts) {
            throw new UnsupportedOperationException();
        }
    }

    private static ImpactAnalyzer analyzer(Planner model) {
        return new ImpactAnalyzer(model, new ChangeProperties(30, 25, DataSize.ofKilobytes(80), 2, "branches/factory", "-"));
    }

    private static final ChangeContext CONTEXT = new ChangeContext("Standing instructions", "{\"apis\": []}", null, "", "backend/: 3");

    @Test
    void analyzeAgainContinuesAPlanTheModelsLimitStopped() {
        Planner model = new Planner();
        model.replies.add("{\"items\": [{\"path\": \"db/DIGX_PY_STANDING_INSTR.sql\", \"layer\": \"data\"},"
                + " {\"path\": \"backend/test/com/bank/si/StandingInstructionDaoTest.java\", \"layer\": \"test\"}], \"risks\": [\"Retention unknown.\"]}");

        assertThat(ImpactAnalyzer.resumable(incomplete())).isTrue();
        ChangePlan plan = analyzer(model).resume(CONTEXT, List.of(), path -> false, incomplete());

        // the planned files kept, only the missing ones asked for, once
        assertThat(model.prompts).singleElement().asString().contains("only the files still missing",
                "- backend/src/com/bank/si/StandingInstructionDao.java", "- channel/components/modules/payments/si-create/si-create.js");
        assertThat(plan.items()).extracting(ChangePlan.Item::path).containsExactly("db/DIGX_PY_STANDING_INSTR.sql",
                "backend/src/com/bank/si/StandingInstructionDao.java", "channel/components/modules/payments/si-create/si-create.js",
                "backend/test/com/bank/si/StandingInstructionDaoTest.java");
        // complete now: the risk is gone, the others stay
        assertThat(plan.risks()).containsExactly("Host API unknown.", "Retention unknown.");
        assertThat(ImpactAnalyzer.resumable(plan)).isFalse();
    }

    @Test
    void aResumedPlanTheLimitStopsAgainKeepsItsFilesAndSaysSo() {
        Planner model = new Planner();
        model.replies.add(new ModelLimitReachedException("daily limit reached", true, null));

        ChangePlan plan = analyzer(model).resume(CONTEXT, List.of(), path -> false, incomplete());

        assertThat(plan.items()).hasSize(2);
        assertThat(plan.risks()).first().asString().startsWith(ImpactAnalyzer.LIMIT_STOPPED);
        assertThat(plan.risks().stream().filter(ImpactAnalyzer::incompleteRisk)).hasSize(1);
        // a plan cut off at the output limit is analyzed afresh (its risk says: with a model with a higher limit)
        assertThat(ImpactAnalyzer.resumable(new ChangePlan("x", plan.items(), List.of(ImpactAnalyzer.CUT_OFF + ".")))).isFalse();
    }

    // --- R18-3: a new shell file ---

    @Test
    void aNewDashboardThatWouldLoadTheNewWidgetIsARisk() {
        ChangePlan plan = new ChangePlan("x", List.of(
                new ChangePlan.Item(FOLDER + "quick-transfer.js", "create", "ui", null, List.of(), null),
                new ChangePlan.Item(FOLDER + "quick-transfer.html", "create", "ui", null, List.of(), null),
                new ChangePlan.Item("channel/components/modules/dashboard/dashboard.js", "create", "ui", "Register the widget", List.of(), null)),
                List.of());

        List<String> risks = PlanReview.review(plan, null, Map.of(), Map.of()).risks();

        assertThat(risks).singleElement().asString().startsWith(PlanReview.NEW_SHELL + "channel/components/modules/dashboard/dashboard.js")
                .contains("would load the new files under it (" + FOLDER + "quick-transfer.js", "loadComponent");
        // or when the code has a file of that name elsewhere
        ChangePlan alone = new ChangePlan("x", List.of(new ChangePlan.Item("channel/js/widgets/menu.js", "create", "ui", null, List.of(), null)),
                List.of());
        assertThat(PlanReview.review(alone, null, Map.of(), Map.of("menu.js", List.of("channel/framework/js/menu.js"))).risks())
                .singleElement().asString().contains("the code already has channel/framework/js/menu.js");
        // not for a component of its own name, a resource bundle, or a change to an existing dashboard
        assertThat(PlanReview.shellName(FOLDER + "quick-transfer.js")).isFalse();
        assertThat(PlanReview.shellName("channel/resources/nls/dashboard.js")).isFalse();
        ChangePlan modify = new ChangePlan("x", List.of(new ChangePlan.Item("channel/components/modules/dashboard/dashboard.js", "modify", "ui",
                null, List.of(), null), plan.items().getFirst()), List.of());
        assertThat(PlanReview.review(modify, null, Map.of(), Map.of()).risks()).isEmpty();
    }

    @Test
    void theImpactPromptAsksWhichExistingComponentANewOneHooksInto() {
        assertThat(ImpactAnalyzer.SYSTEM).contains("name in its details the existing", "Do not create a new dashboard, shell");
    }

    // --- R18-4: the order of the back end's files ---

    @Test
    void dtosAreWrittenBeforeTheAdapterThatUsesThem() {
        ChangePlan plan = PlanParser.parse("""
                {"items": [
                  {"path": "backend/src/com/bank/obdx/common/adapter/HostStandingInstructionAdapter.java", "layer": "integration"},
                  {"path": "backend/src/com/bank/obdx/payments/dto/CreatingStandingInstructionRequest.java", "layer": "service"},
                  {"path": "backend/src/com/bank/obdx/payments/dao/StandingInstructionDao.java", "layer": "service"},
                  {"path": "backend/src/com/bank/obdx/common/exception/BankCustomException.java", "layer": "service"},
                  {"path": "backend/src/com/bank/obdx/payments/StandingInstructionService.java", "layer": "service"},
                  {"path": "backend/src/com/bank/obdx/payments/StandingInstructionResource.java", "layer": "service"},
                  {"path": "backend/test/com/bank/obdx/payments/StandingInstructionServiceTest.java", "layer": "test"},
                  {"path": "channel/components/modules/payments/si/si.html", "layer": "ui"},
                  {"path": "channel/components/modules/payments/si/si.js", "layer": "ui"},
                  {"path": "db/DIGX_PY_STANDING_INSTR.sql", "layer": "data"},
                  {"path": "config/si.properties", "layer": "config"}]}
                """, path -> false, 20);

        assertThat(plan.items()).extracting(ChangePlan.Item::path).containsExactly(
                "db/DIGX_PY_STANDING_INSTR.sql",
                "backend/src/com/bank/obdx/payments/dto/CreatingStandingInstructionRequest.java",
                "backend/src/com/bank/obdx/common/exception/BankCustomException.java",
                "backend/src/com/bank/obdx/common/adapter/HostStandingInstructionAdapter.java",
                "backend/src/com/bank/obdx/payments/dao/StandingInstructionDao.java",
                "backend/src/com/bank/obdx/payments/StandingInstructionService.java",
                "backend/src/com/bank/obdx/payments/StandingInstructionResource.java",
                "config/si.properties",
                "channel/components/modules/payments/si/si.js",
                "channel/components/modules/payments/si/si.html",
                "backend/test/com/bank/obdx/payments/StandingInstructionServiceTest.java");
    }
}
