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
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
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
        // but not when the view's own view model is planned and not written yet: as for its prompt, it has none
        assertThat(ChangeService.viewModel(FOLDER + "quick-transfer.html", Map.of(FOLDER + "model.js", "self.x = ko.observable();"), null,
                (FOLDER + "quick-transfer.js")::equals)).isNull();
    }

    @Test
    void aViewInJetsViewsFolderIsPairedWithItsViewModelInViewModels() {
        String view = "src/js/views/transfer.html";
        String viewModel = "src/js/viewModels/transfer.js";
        ChangePlan.Item item = new ChangePlan.Item(view, "create", "ui", null, List.of(), null);

        assertThat(CodeGenerator.viewPartner(view, Map.of(viewModel, VIEW_MODEL))).isEqualTo(viewModel);
        assertThat(CodeGenerator.related(item, Map.of(viewModel, VIEW_MODEL), 1).get(viewModel)).startsWith("The view model's public names");
        assertThat(CodeGenerator.viewPartner(viewModel, Map.of(view, VIEW))).isEqualTo(view);
        assertThat(CodeGenerator.plannedViewModel(new ChangePlan("x", List.of(item, new ChangePlan.Item(viewModel, "create", "ui", null,
                List.of(), null)), List.of()), item, Map.of())).isEqualTo(viewModel);
        assertThat(ChangeService.viewModel(view, Map.of(viewModel, VIEW_MODEL), null).inChange()).isTrue();
        // and a TypeScript view model
        assertThat(CodeGenerator.viewPartner(FOLDER + "quick-transfer.html", Map.of(FOLDER + "quick-transfer.ts", VIEW_MODEL)))
                .isEqualTo(FOLDER + "quick-transfer.ts");
        assertThat(CodeGenerator.viewPartner(FOLDER + "quick-transfer.ts", Map.of(FOLDER + "quick-transfer.html", VIEW)))
                .isEqualTo(FOLDER + "quick-transfer.html");
    }

    @Test
    void aModelJsIsTheViewsPartnerOnlyWhenItsOwnViewModelIsNeitherPlannedNorInTheCode() {
        Map<String, String> earlier = Map.of(FOLDER + "model.js", "self.payees = ko.observableArray([]);");
        String view = FOLDER + "quick-transfer.html";

        assertThat(CodeGenerator.viewPartner(view, earlier, path -> false)).isEqualTo(FOLDER + "model.js");
        // its own view model is planned (not written yet) or in the code: not the model.js
        assertThat(CodeGenerator.viewPartner(view, earlier, (FOLDER + "quick-transfer.js")::equals)).isNull();
        // a model.js without observables is a service model
        assertThat(CodeGenerator.viewPartner(view, Map.of(FOLDER + "model.js", "return { fetch: fetch };"), path -> false)).isNull();
    }

    // --- R18-1 (c): the fix by the cross-check after Continue, and of JavaScript and views ---

    private static ChangeFileStore.ChangeFile written(String path, boolean edited, boolean fitDue, String finding) {
        return new ChangeFileStore.ChangeFile(0, path, "create", "ui", null, ChangeFileStore.Status.GENERATED, null, "x", edited,
                FileChecks.Status.FAILED, finding, 1, null, false, fitDue);
    }

    @Test
    void continueFixesTheFilesWhoseFixIsDueAfterThoseItWroteAndCodeErrorsFirst() {
        String binding = ViewBindings.UNDEFINED_IN_CHANGE + ": a.";
        String define = JsModuleChecks.WRONG_BINDING + ": oj receives 'ojs/ojknockout'.";
        Map<String, String> unfit = new LinkedHashMap<>();
        List<ChangeFileStore.ChangeFile> all = new ArrayList<>();
        // a: due; b: due but a reviewer's edit; c: due; d: not due (a completed run tried it, or it was written again);
        // e and f: written now; g: due, a code error; h: due
        for (String name : List.of("a.html", "b.js", "c.html", "d.js", "e.html", "f.js", "g.js", "h.html")) {
            String finding = name.endsWith(".js") ? define : binding;
            unfit.put(name, finding);
            all.add(written(name, name.equals("b.js"), !name.equals("d.js") && !name.startsWith("e") && !name.startsWith("f"), finding));
        }
        Set<String> writtenNow = Set.of("e.html", "f.js");

        // code errors first (written now before due), then the views' bindings (written now before due); at most five
        assertThat(ChangeService.toFit(unfit, writtenNow, all, true)).containsExactly("f.js", "g.js", "e.html", "a.html", "c.html");
        // a run that was not continued fixes only its own files
        assertThat(ChangeService.toFit(unfit, writtenNow, all, false)).containsExactly("f.js", "e.html");
        // a Continue after a completed run: nothing is due, so only what it wrote
        List<ChangeFileStore.ChangeFile> noneDue = all.stream().map(f -> written(f.path(), f.edited(), false, f.checkMessage())).toList();
        assertThat(ChangeService.toFit(unfit, Set.of("e.html"), noneDue, true)).containsExactly("e.html");
        assertThat(ChangeService.onlyBindings(binding)).isTrue();
        assertThat(ChangeService.onlyBindings(binding + "\n" + define)).isFalse();
    }

    @Test
    void aFixOfAViewIsTriedOnceAndKeptOnlyWhenItBindsFewerMissingNames() {
        SmallServer model = new SmallServer();
        LocalChecks checks = new LocalChecks(VersionPacks.builtIn());
        CodeGenerator generator = new CodeGenerator(model, new ChangeProperties(30, 25, DataSize.ofKilobytes(80), 2, "branches/factory", "-"),
                checks);
        UUID change = UUID.randomUUID();
        String path = FOLDER + "quick-transfer.html";
        ChangePlan.Item item = new ChangePlan.Item(path, "create", "ui", "Widget view", List.of(), null);
        String finding = ViewBindings.problems(VIEW, VIEW_MODEL, true).getFirst();
        ChangeFileStore.ChangeFile view = new ChangeFileStore.ChangeFile(0, path, "create", "ui", null, ChangeFileStore.Status.GENERATED, null,
                VIEW, false, FileChecks.Status.FAILED, finding, 1, null, false, true);
        ChangeFileStore.ChangeFile viewModel = new ChangeFileStore.ChangeFile(1, FOLDER + "quick-transfer.js", "create", "ui", null,
                ChangeFileStore.Status.GENERATED, null, VIEW_MODEL, false, FileChecks.Status.PASSED, null, 1);
        ChangeFileStore files = mock(ChangeFileStore.class);
        when(files.file(change, path)).thenReturn(Optional.of(view));
        when(files.files(change)).thenReturn(List.of(view, viewModel));
        // the model "fixes" the view toward names the view model does not have either
        model.replies.add(VIEW.replace("selectPayee", "pickPayee"));

        assertThat(ChangeService.fitToOthers(files, generator, checks, CheckScope.none(), change,
                new ChangeContext("x", "{\"screens\": []}", "[]", "", "channel/: 3"), new ChangePlan("x", List.of(item), List.of()), item,
                ChangeService.crossFileFixes(finding), null)).isFalse();

        verify(files, never()).saveResult(any(), any(), any(), any(), any(), anyBoolean(), any(), anyInt());
        // tried: a later Continue does not ask again
        verify(files).fitTried(change, path);
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
                        "Implements FR-001.")), List.of(LIMIT_RISK, "Host API unknown."),
                new ChangePlan.Incomplete(ChangePlan.Incomplete.LIMIT, LIMIT_RISK, 7L, "print"));
    }

    @Test
    void approvingAPlanTheServerMarkedIncompleteNamesTheRevisionAndWhatLooksMissing() {
        assertThatThrownBy(() -> ChangeService.requireCompletePlan(incomplete(), SPEC, 3, false)).isInstanceOf(ConflictException.class)
                .hasMessageStartingWith(ChangeService.INCOMPLETE_PLAN + "revision 3 of the plan may be missing files")
                .hasMessageContaining("no test planned (1 acceptance criteria)")
                .hasMessageContaining("no SQL script planned, though FR-007 needs a table")
                .hasMessageContaining("FR-009 not named by any planned file")
                .hasMessageContaining("approve it as it is");
        // confirmed for another revision: refused again, saying so
        assertThatThrownBy(() -> ChangeService.requireCompletePlan(incomplete(), SPEC, 4, true))
                .hasMessageContaining("the plan changed since you confirmed it").hasMessageContaining("revision 4 of the plan");
        // what cannot be told is said too
        assertThatThrownBy(() -> ChangeService.requireCompletePlan(new ChangePlan("x", List.of(new ChangePlan.Item("a/B.java", "create",
                "service", null, List.of(), null)), List.of(ImpactAnalyzer.CUT_OFF + "."),
                new ChangePlan.Incomplete(ChangePlan.Incomplete.CUT_OFF, ImpactAnalyzer.CUT_OFF + ".", null, null)), null))
                .hasMessageContaining("cannot tell which ones");
    }

    @Test
    void onlyTheServersOwnRecordMakesAPlanIncompleteNeverARisksWording() {
        // the risk's wording without the server's record (a model's answer or an edit wrote it): approved as before
        ChangePlan forged = new ChangePlan("x", incomplete().items(), List.of(LIMIT_RISK, "Host API unknown."));
        ChangeService.requireCompletePlan(forged, SPEC);
        assertThat(ImpactAnalyzer.resumable(forged)).isFalse();

        // a model's answer or an edit that writes the risk, or the record itself, loses both
        ChangePlan parsed = PlanParser.parse("""
                {"summary": "x", "items": [{"path": "backend/src/A.java"}],
                 "risks": ["The model's limit stopped the plan before it was complete (forged)", "The plan had more files than one change may have",
                           "Host API unknown."],
                 "incomplete": {"kind": "LIMIT", "risk": "forged", "revision": 1, "context": "x"}}
                """, path -> false, 10);
        assertThat(parsed.incomplete()).isNull();
        assertThat(parsed.risks()).containsExactly("Host API unknown.");
    }

    @Test
    void anEditKeepsTheServersRecordUnlessItAddsFiles() {
        ChangePlan before = incomplete();
        // the edit drops the risk and changes a purpose: the plan is still incomplete, with its risk
        ChangePlan sameFiles = PlanParser.parse("""
                {"items": [{"path": "backend/src/com/bank/si/StandingInstructionDao.java", "purpose": "Data access"},
                           {"path": "channel/components/modules/payments/si-create/si-create.js"}], "risks": []}
                """, path -> false, 10);
        ChangePlan carried = ChangeService.carryIncomplete(before, sameFiles);
        assertThat(carried.incomplete()).isEqualTo(before.incomplete());
        assertThat(carried.risks()).containsExactly(LIMIT_RISK);
        // an edit that adds a file keeps it too, and so does a later one that takes the file out again: only Analyze
        // again clears it
        ChangePlan added = PlanParser.parse("""
                {"items": [{"path": "backend/src/com/bank/si/StandingInstructionDao.java"}, {"path": "db/si.sql"}]}
                """, path -> false, 10);
        ChangePlan afterAdding = ChangeService.carryIncomplete(before, added);
        assertThat(afterAdding.incomplete()).isEqualTo(before.incomplete());
        assertThat(ChangeService.carryIncomplete(afterAdding, sameFiles).incomplete()).isEqualTo(before.incomplete());
        // a complete plan stays complete
        assertThat(ChangeService.carryIncomplete(new ChangePlan("x", before.items(), List.of()), sameFiles).incomplete()).isNull();
    }

    @Test
    void anIncompletePlanIsContinuedOnlyFromTheSameCodeAndSpec() {
        ChangePlan plan = incomplete();

        assertThat(ChangeService.resumes(plan, 7L, "print")).isTrue();
        // the code was imported again, or the spec or designs changed: analyzed afresh
        assertThat(ChangeService.resumes(plan, 8L, "print")).isFalse();
        assertThat(ChangeService.resumes(plan, 7L, "other")).isFalse();
        // a record without them (made before they were recorded) is not continued
        assertThat(ChangeService.resumes(new ChangePlan("x", plan.items(), plan.risks(), new ChangePlan.Incomplete(ChangePlan.Incomplete.LIMIT,
                LIMIT_RISK, null, null)), 7L, "print")).isFalse();
        // nor a plan cut off at the output limit (its risk says: with a model with a higher limit)
        assertThat(ChangeService.resumes(new ChangePlan("x", plan.items(), plan.risks(), new ChangePlan.Incomplete(ChangePlan.Incomplete.CUT_OFF,
                "x", 7L, "print")), 7L, "print")).isFalse();
        // the fingerprint follows the spec and the designs
        ChangeContext a = new ChangeContext("x", "{\"title\": \"a\"}", "[]", "", "");
        assertThat(ChangeService.contextPrint(a)).isEqualTo(ChangeService.contextPrint(new ChangeContext("y", "{\"title\": \"a\"}", "[]", "p", "s")))
                .isNotEqualTo(ChangeService.contextPrint(new ChangeContext("x", "{\"title\": \"b\"}", "[]", "", "")))
                .isNotEqualTo(ChangeService.contextPrint(new ChangeContext("x", "{\"title\": \"a\"}", "[{}]", "", "")));
    }

    @Test
    void whatLooksMissingIsToldOnlyFromWhatTheTextsSay() {
        ChangePlan plan = new ChangePlan("x", List.of(new ChangePlan.Item("backend/src/A.sql", "create", "data", null, List.of(), null),
                new ChangePlan.Item("backend/test/ATest.java", "create", "test", null, List.of(), null)), List.of());
        assertThat(PlanReview.gaps(plan, SPEC)).isEmpty();

        // a DTO the model put in the data layer is no SQL script
        ChangePlan dtoInData = new ChangePlan("x", List.of(new ChangePlan.Item("backend/src/dto/SiDto.java", "create", "data", null, List.of(),
                "Implements FR-001, FR-007, FR-009."), new ChangePlan.Item("backend/test/SiTest.java", "create", "test", null, List.of(), null)),
                List.of());
        assertThat(PlanReview.gaps(dtoInData, SPEC)).containsExactly("no SQL script planned, though FR-007 needs a table");

        // a table it only reads, or one the text says not to make, needs no script
        assertThat(PlanReview.newTable("Read the payees from DIGX_PY_PAYEE.")).isFalse();
        assertThat(PlanReview.newTable("Do not change the database table.")).isFalse();
        assertThat(PlanReview.newTable("The service must not create a new table for this.")).isFalse();
        assertThat(PlanReview.newTable("No new table is needed.")).isFalse();
        assertThat(PlanReview.newTable("Keep history. Create table DIGX_SI_AUDIT for it.")).isTrue();
        assertThat(PlanReview.newTable("It adds a history table.")).isTrue();
        // an abbreviation's full stop ends no sentence; a remark in parentheses and "not only" deny nothing
        assertThat(PlanReview.newTable("Do not, e.g. create a new table for it.")).isFalse();
        assertThat(PlanReview.newTable("Do not (i.e. never) create a new table.")).isFalse();
        assertThat(PlanReview.newTable("Store the instruction (no approval needed) in a new table.")).isTrue();
        assertThat(PlanReview.newTable("It must not only store the instruction but also add a history table.")).isTrue();
        // a named table
        assertThat(PlanReview.newTable("Create DIGX_PY_SI table with these columns.")).isTrue();
        assertThat(PlanReview.newTable("Rows go to the new DIGX_PY_SI table.")).isTrue();
        assertThat(PlanReview.newTable("Keep them in a separate table DIGX_PY_SI.")).isTrue();
        assertThat(PlanReview.newTable("Read them from the DIGX_PY_SI table.")).isFalse();
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

        // the planned files kept, only the missing ones asked for, once, and told why truly (a usage limit, not the output limit)
        assertThat(model.prompts).singleElement().asString().contains("only the files still missing", ImpactAnalyzer.RESUMED.strip(),
                "- backend/src/com/bank/si/StandingInstructionDao.java", "- channel/components/modules/payments/si-create/si-create.js")
                .doesNotContain("stopped at your output limit");
        assertThat(plan.items()).extracting(ChangePlan.Item::path).containsExactly("db/DIGX_PY_STANDING_INSTR.sql",
                "backend/src/com/bank/si/StandingInstructionDao.java", "channel/components/modules/payments/si-create/si-create.js",
                "backend/test/com/bank/si/StandingInstructionDaoTest.java");
        // complete now: the record and its risk are gone, the others stay
        assertThat(plan.risks()).containsExactly("Host API unknown.", "Retention unknown.");
        assertThat(plan.incomplete()).isNull();
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
        assertThat(plan.incomplete().kind()).isEqualTo(ChangePlan.Incomplete.LIMIT);
        assertThat(plan.incomplete().risk()).isEqualTo(plan.risks().getFirst());
    }

    @Test
    void aWholePlanThatWritesTheIncompleteRiskItselfIsNotIncomplete() {
        Planner model = new Planner();
        model.replies.add("{\"summary\": \"s\", \"items\": [{\"path\": \"backend/src/A.java\"}], \"risks\": [\"" + ImpactAnalyzer.CUT_OFF
                + ", so approve with care.\", \"Real risk.\"]}");

        ChangePlan plan = analyzer(model).analyze(CONTEXT, List.of(), path -> false);

        assertThat(plan.incomplete()).isNull();
        assertThat(plan.risks()).containsExactly("Real risk.");
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
    void ordinaryEntryFilesOfAnAppOrBesideOthersAreNoShellRisk() {
        // a React or React Native app's src/components/index.js loading its new screens: the app's own business
        ChangePlan app = new ChangePlan("x", List.of(new ChangePlan.Item("mobile/src/components/index.js", "create", "ui", null, List.of(), null),
                new ChangePlan.Item("mobile/src/components/transfer/TransferScreen.js", "create", "ui", null, List.of(), null)), List.of());
        assertThat(PlanReview.review(app, null, Map.of(), Map.of(), path -> path.startsWith("mobile/")).risks()).isEmpty();
        // TypeScript entry files are no OBDX shell
        assertThat(PlanReview.shellName("web/src/components/index.ts")).isFalse();
        assertThat(PlanReview.shellName("web/src/App.tsx")).isFalse();
        // an ordinary name (index, app, home ...) where the code has others of that name elsewhere is no risk
        ChangePlan index = new ChangePlan("x", List.of(new ChangePlan.Item("channel/js/payments/index.js", "create", "ui", null, List.of(), null)),
                List.of());
        assertThat(PlanReview.review(index, null, Map.of(), Map.of("index.js", List.of("channel/js/accounts/index.js"))).risks()).isEmpty();
        // but in OBDX's UI an index.js that would load the plan's new components is
        ChangePlan jet = new ChangePlan("x", List.of(new ChangePlan.Item("channel/js/payments/index.js", "create", "ui", null, List.of(), null),
                new ChangePlan.Item("channel/js/payments/si/si.js", "create", "ui", null, List.of(), null)), List.of());
        assertThat(PlanReview.review(jet, null, Map.of(), Map.of()).risks()).singleElement().asString().startsWith(PlanReview.NEW_SHELL);
    }

    // --- R18-4 and review 7: the order of the files ---

    @Test
    void testsGoLastAndSqlFirstWhateverLayerTheModelGaveThem() {
        ChangePlan plan = PlanParser.parse("""
                {"items": [
                  {"path": "channel/components/modules/payments/si/si.spec.js", "layer": "ui"},
                  {"path": "channel/components/modules/payments/si/si.html", "layer": "ui"},
                  {"path": "backend/src/com/bank/si/TransferResourceTest.java", "layer": "service"},
                  {"path": "backend/src/com/bank/si/TransferResource.java", "layer": "service"},
                  {"path": "backend/src/com/bank/si/Limit.java", "layer": "service"},
                  {"path": "config/patch/si.sql", "layer": "config"},
                  {"path": "backend/src/com/bank/si/Audit.java", "layer": "integration"}]}
                """, path -> false, 20);

        assertThat(plan.items()).extracting(ChangePlan.Item::path).containsExactly(
                "config/patch/si.sql",
                "backend/src/com/bank/si/Audit.java",
                "backend/src/com/bank/si/Limit.java",
                "backend/src/com/bank/si/TransferResource.java",
                "channel/components/modules/payments/si/si.html",
                "channel/components/modules/payments/si/si.spec.js",
                "backend/src/com/bank/si/TransferResourceTest.java");
        // Limit.java and Audit.java are no tests
        assertThat(PlanReview.isTest("backend/src/com/bank/si/Limit.java")).isFalse();
        assertThat(PlanReview.isTest("backend/src/com/bank/si/PaymentsIT.java")).isTrue();
        for (String test : List.of("backend/src/com/bank/si/TestPayments.java", "backend/src/com/bank/si/PaymentsTestCase.java",
                "channel/components/__tests__/si.js", "backend/tests/Payments.java", "backend/src/payments_test.java",
                "backend/src/paymentstest.java", "ui/js/specs/transferSpec.js", "ui/js/transfer-spec.js", "ui/js/transfer.test.ts")) {
            assertThat(PlanReview.isTest(test)).as(test).isTrue();
        }
        for (String code : List.of("backend/src/com/bank/si/Latest.java", "backend/src/com/bank/si/Testimony.java", "ui/js/contest.js")) {
            assertThat(PlanReview.isTest(code)).as(code).isFalse();
        }
        // the coverage reads tests the same way
        assertThat(ChangeCoverage.isTest(new ChangeFileStore.ChangeFile(0, "backend/src/com/bank/si/Latest.java", "create", "service", null,
                ChangeFileStore.Status.GENERATED, null, "x", false, null, null, 1))).isFalse();
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
