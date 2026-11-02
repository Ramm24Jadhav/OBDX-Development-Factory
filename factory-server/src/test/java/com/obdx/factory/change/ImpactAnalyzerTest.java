package com.obdx.factory.change;

import com.obdx.factory.model.ModelGateway;
import com.obdx.factory.model.ModelLimitReachedException;
import org.junit.jupiter.api.Test;
import org.springframework.util.unit.DataSize;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

/** Impact analysis on a model whose server writes little per answer (a free cloud tier): the plan is continued. */
class ImpactAnalyzerTest {

    /** Answers with queued replies, each whole or cut off at the output limit, and records the prompts. */
    static class ScriptedModel implements ModelGateway {
        final Deque<Object> replies = new ArrayDeque<>();
        final List<String> prompts = new ArrayList<>();
        int outputLimit;
        boolean local;

        @Override
        public boolean local() {
            return local;
        }

        ScriptedModel cut(String reply) {
            replies.add(new ChatResult(reply, "scripted", 1, true));
            return this;
        }

        ScriptedModel whole(String reply) {
            replies.add(new ChatResult(reply, "scripted", 1, false));
            return this;
        }

        @Override
        public int outputLimit() {
            return outputLimit;
        }

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
            return (ChatResult) next;
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

    private final ScriptedModel model = new ScriptedModel();
    private final ImpactAnalyzer analyzer = new ImpactAnalyzer(model, new ChangeProperties(30, 25, DataSize.ofKilobytes(80), 2,
            "branches/factory", "-"));
    private final ChangeContext context = new ChangeContext("Standing instructions", "{\"apis\": []}", null, "", "backend/: 3");

    /** The first piece of BRD1's plan as the model wrote it before its output limit: UI files, then a resource cut off. */
    private static final String FIRST = """
            {"summary":"Adds standing instructions: screens, REST endpoints, host integration and storage.","items":[
            {"path":"channel/components/modules/payments/create-standing-instruction/model.js","action":"create","layer":"ui","purpose":"API calls.","basedOn":[],"details":"Fetches accounts."},
            {"path":"channel/components/modules/payments/create-standing-instruction/create-standing-instruction.js","action":"create","layer":"ui","purpose":"View model.","basedOn":[],"details":"Validates input (FR-001)."},
            {"path":"backend/src/com/bank/obdx/payments/StandingInstructionResource.java","action":"create","layer":"service","purpose":"REST resou""";

    @Test
    void aPlanCutOffAtTheOutputLimitIsContinuedWithTheFilesStillMissing() {
        model.outputLimit = 900;
        model.cut(FIRST)
                .cut("""
                        {"items":[{"path":"backend/src/com/bank/obdx/payments/StandingInstructionResource.java","layer":"service","purpose":"REST endpoints (FR-008).","details":"POST and GET /standing-instructions"},
                        {"path":"channel/components/modules/payments/create-standing-instruction/model.js","layer":"ui","purpose":"again"},
                        {"path":"backend/src/com/bank/obdx/payments/StandingInstructionService.java","layer":"service","purpose":"Busi""")
                .whole("""
                        {"items":[{"path":"backend/src/com/bank/obdx/payments/StandingInstructionService.java","layer":"service","purpose":"Business logic."},
                        {"path":"backend/test/com/bank/obdx/payments/StandingInstructionServiceTest.java","layer":"test","purpose":"AC-001 to AC-004."}],
                         "risks":["Host API for standing instructions is not described."]}""");

        ChangePlan plan = analyzer.analyze(context, List.of(), path -> false);

        assertThat(plan.items()).extracting(ChangePlan.Item::path).containsExactlyInAnyOrder(
                "channel/components/modules/payments/create-standing-instruction/model.js",
                "channel/components/modules/payments/create-standing-instruction/create-standing-instruction.js",
                "backend/src/com/bank/obdx/payments/StandingInstructionResource.java",
                "backend/src/com/bank/obdx/payments/StandingInstructionService.java",
                "backend/test/com/bank/obdx/payments/StandingInstructionServiceTest.java");
        // the file planned twice is kept as first planned
        assertThat(plan.items()).filteredOn(i -> i.path().endsWith("model.js")).singleElement()
                .satisfies(i -> assertThat(i.purpose()).isEqualTo("API calls."));
        assertThat(plan.summary()).startsWith("Adds standing instructions");
        assertThat(plan.risks()).containsExactly("Host API for standing instructions is not described.");
        assertThat(model.prompts).hasSize(3);
        assertThat(model.prompts.get(0)).contains("limited to about 900 tokens");
        assertThat(model.prompts.get(1)).contains("stopped at your output limit", "- channel/components/modules/payments/create-standing-instruction/model.js")
                .doesNotContain("StandingInstructionResource.java\n");
        assertThat(model.prompts.get(2)).contains("- backend/src/com/bank/obdx/payments/StandingInstructionResource.java");
    }

    @Test
    void aPlanStillCutOffAfterItsContinuationsSaysFilesMayBeMissing() {
        model.cut(FIRST);
        for (int i = 0; i < ImpactAnalyzer.MAX_CONTINUATIONS; i++) {
            model.cut("{\"items\":[{\"path\":\"backend/src/Extra" + i + ".java\"},{\"path\":\"backend/src/Cut");
        }

        ChangePlan plan = analyzer.analyze(context, List.of(), path -> false);

        assertThat(plan.items()).hasSize(2 + ImpactAnalyzer.MAX_CONTINUATIONS);
        assertThat(plan.risks().getFirst()).contains("cut off at its output limit", "files may be missing");
        assertThat(model.replies).isEmpty();
    }

    @Test
    void aContinuationThatAddsNothingEndsThePlan() {
        model.cut(FIRST).whole("{\"items\": [], \"risks\": []}");

        ChangePlan plan = analyzer.analyze(context, List.of(), path -> false);

        assertThat(plan.items()).hasSize(2);
        assertThat(plan.risks()).isEmpty();
    }

    @Test
    void theModelsLimitDuringAContinuationKeepsThePlannedFiles() {
        model.cut(FIRST);
        model.replies.add(new ModelLimitReachedException("daily limit reached", true, null));

        ChangePlan plan = analyzer.analyze(context, List.of(), path -> false);

        assertThat(plan.items()).hasSize(2);
        assertThat(plan.risks().getFirst()).contains("daily limit reached", "files may be missing");
    }

    @Test
    void aCutOffAnswerWithNoWholeFileIsContinuedFromNothing() {
        model.cut("{\"summary\": \"Adds remarks\", \"items\": [{\"path\": \"backend/src/Rem");
        model.whole("{\"items\": [{\"path\": \"backend/src/Remarks.java\"}], \"risks\": []}");

        ChangePlan plan = analyzer.analyze(context, List.of(), path -> false);

        assertThat(plan.items()).extracting(ChangePlan.Item::path).containsExactly("backend/src/Remarks.java");
        assertThat(plan.summary()).isEqualTo("Adds remarks");
        assertThat(model.prompts.get(1)).contains("It planned no file completely.");
    }

    @Test
    void onOllamaAPlanIsContinuedTwiceAtMost() {
        model.local = true;
        model.cut(FIRST);
        for (int i = 0; i < 4; i++) {
            model.cut("{\"items\":[{\"path\":\"backend/src/Extra" + i + ".java\"},{\"pa");
        }

        ChangePlan plan = analyzer.analyze(context, List.of(), path -> false);

        assertThat(model.prompts).hasSize(1 + ImpactAnalyzer.LOCAL_CONTINUATIONS);
        assertThat(plan.items()).hasSize(2 + ImpactAnalyzer.LOCAL_CONTINUATIONS);
    }

    @Test
    void aContinuedPlanStopsAtTheMostFilesOfAChange() {
        ImpactAnalyzer small = new ImpactAnalyzer(model, new ChangeProperties(3, 25, DataSize.ofKilobytes(80), 2, "branches/factory", "-"));
        model.cut(FIRST).cut("{\"items\":[{\"path\":\"a/A.java\"},{\"path\":\"a/B.java\"},{\"path\":\"a/C.java\"},{\"pa");

        ChangePlan plan = small.analyze(context, List.of(), path -> false);

        assertThat(plan.items()).hasSize(3);
        assertThat(plan.risks().getFirst()).contains("more files than one change may have (3)");
        assertThat(model.prompts).hasSize(2);
    }

    @Test
    void aContinuedPlanThatIsStillUnusableIsNotAskedForAgain() {
        model.cut("{\"summary\": \"x\", \"items\": [{\"pa");
        model.whole("{\"items\": [], \"risks\": []}");

        org.assertj.core.api.Assertions.assertThatThrownBy(() -> analyzer.analyze(context, List.of(), path -> false))
                .isInstanceOf(IllegalStateException.class).hasMessageContaining("no files");
        // the first answer and one continuation: not the whole analysis again
        assertThat(model.prompts).hasSize(2);
    }

    @Test
    void aWholePlanIsNotContinued() {
        model.whole("{\"summary\": \"s\", \"items\": [{\"path\": \"backend/src/A.java\"}], \"risks\": []}");

        assertThat(analyzer.analyze(context, List.of(), Set.of()::contains).items()).hasSize(1);
        assertThat(model.prompts).hasSize(1);
        assertThat(model.prompts.getFirst()).doesNotContain("limited to about");
    }

    @Test
    void theCompleteItemsOfACutOffAnswerAreRead() {
        ChangePlan partial = PlanParser.partial(FIRST);

        assertThat(partial.summary()).startsWith("Adds standing instructions");
        assertThat(partial.items()).hasSize(2);
        assertThat(PlanParser.partial("{\"items\": [{\"path\": \"a\", \"details\": \"uses } and ] in text\"}, {\"pa").items())
                .singleElement().satisfies(i -> assertThat(i.details()).isEqualTo("uses } and ] in text"));
        assertThat(PlanParser.partial("{\"summary\": \"x\", \"items\": [], \"risks\": [\"one\", \"tw").risks()).containsExactly("one");
        assertThat(PlanParser.partial("nothing").items()).isEmpty();
        // a long summary is read without a regular expression's recursion, and kept to its first 2,000 characters
        assertThat(PlanParser.partial("{\"summary\": \"" + "s".repeat(100_000) + "\", \"items\": [{\"path\": \"a\"}, {\"pa").summary())
                .hasSize(PlanParser.MAX_SUMMARY);
    }
}
