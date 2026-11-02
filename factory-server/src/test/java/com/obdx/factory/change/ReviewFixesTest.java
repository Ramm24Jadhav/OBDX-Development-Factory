package com.obdx.factory.change;

import com.obdx.factory.model.ModelGateway;
import com.obdx.factory.model.ModelGatewayException;
import com.obdx.factory.model.PromptFit;
import com.obdx.factory.model.PromptTooLargeException;
import com.obdx.factory.pack.JavaCompileChecks;
import com.obdx.factory.pack.LocalChecks;
import com.obdx.factory.pack.ModelReasoning;
import com.obdx.factory.pack.VersionPacks;
import org.junit.jupiter.api.Test;
import org.springframework.util.unit.DataSize;

import java.time.Duration;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** The code review of 0e9ff48..7d18a1d and the VAPT review: what each finding showed, fixed. */
class ReviewFixesTest {

    private final Deque<String> replies = new ArrayDeque<>();
    private final List<String> prompts = new ArrayList<>();
    private final ModelGateway model = new ModelGateway() {
        @Override
        public ChatResult chat(String systemPrompt, String userPrompt) {
            prompts.add(userPrompt);
            String reply = replies.removeFirst();
            return reply.startsWith("CUT:") ? new ChatResult(reply.substring(4), "scripted", 1, true) : new ChatResult(reply, "scripted", 1);
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
    };
    private final CodeGenerator generator = new CodeGenerator(model, new ChangeProperties(30, 25, DataSize.ofKilobytes(80), 2,
            "branches/factory", "-"), new LocalChecks(VersionPacks.builtIn()));
    private final ChangeContext context = new ChangeContext("Remarks", "{\"screens\": []}", "[]", "- Java version: Java 8", "backend/: 3");
    private final ChangePlan.Item item = new ChangePlan.Item("backend/RemarksValidator.java", "create", "service", "Validate remarks",
            List.of(), null);
    private final ChangePlan plan = new ChangePlan("Add remarks", List.of(item), List.of());

    private static final UUID CHANGE = UUID.randomUUID();

    // --- 2: a join failure keeps what was written before ---

    @Test
    void aFixWhosePiecesDoNotJoinKeepsTheWholeAnswerBeforeIt() {
        String whole = "public class RemarksValidator {\n    void a() { }\n    void a() { }\n}\n";
        replies.add(whole);
        // the fix is cut off, then goes on in the middle of a line it never saw whole, twice: the pieces do not parse
        replies.add("CUT:public class RemarksValidator {\n    void a() {\n");
        replies.add("x);\n    }\n}\n");
        replies.add("x);\n    }\n}\n");

        CodeGenerator.Result result = generator.generate(context, plan, item, null, Map.of(), Map.of(), null);

        assertThat(result.content()).isEqualTo(whole);
        assertThat(result.check().status()).isEqualTo(FileChecks.Status.FAILED);
    }

    @Test
    void writeAgainWhosePiecesDoNotJoinKeepsTheEditedVersion() {
        ChangeFileStore files = mock(ChangeFileStore.class);
        when(files.file(CHANGE, item.path())).thenReturn(Optional.of(new ChangeFileStore.ChangeFile(0, item.path(), "create", "service", null,
                ChangeFileStore.Status.GENERATED, null, "class Edited { }\n", true, FileChecks.Status.PASSED, null, 2)));

        String reason = ChangeService.recordFailure(files, CHANGE, item.path(), null,
                new CodeGenerator.JoinFailed("The model's answer came in pieces that did not join cleanly (x); write it again."));

        assertThat(reason).contains("did not join cleanly");
        // the reviewer's edit stays: nothing is saved over it
        verify(files, never()).saveResult(any(), anyString(), any(), any(), any(), eq(false), any(), anyInt());
    }

    // --- 3: a comment does not cut a piece ---

    @Test
    void ordinaryCommentsInALongPieceAreKept() {
        StringBuilder piece = new StringBuilder("public class RemarksValidator {\n");
        for (int i = 0; i < 100; i++) {
            piece.append("    void rule").append(i).append("() {\n    }\n\n");
        }
        piece.append("    // Assume default branch when none is sent\n    // fields returned in this response\n")
                .append("    // the user wants only active accounts\n    void last() {\n    }\n}\n");
        String text = piece.toString();

        assertThat(ModelReasoning.firstReasoningLine(item.path(), text)).isZero();
        assertThat(ModelReasoning.findings(item.path(), null, text)).isEmpty();
        assertThat(CodeGenerator.withoutReasoning(item.path(), text)).isEqualTo(text);
        // a reasoning comment that is no self-talk goes alone, the code after it stays
        String withReasoning = text.replace("    // fields returned in this response\n", "    // As per the prompt, the fields are fixed\n");
        assertThat(CodeGenerator.withoutReasoning(item.path(), withReasoning)).doesNotContain("As per the prompt").contains("void last()");
    }

    // --- 4: the right overload ---

    @Test
    void aMethodOnlyFixReplacesTheOverloadWithTheFinding() {
        String file = """
                public class Validator {
                    boolean validate(String name) {
                        return name != null;
                    }

                    boolean validate(Account account) {
                        a + b = c;
                    }
                }
                """;
        String fixed = """
                public class Validator {
                    boolean validate(String name) {
                        return name != null;
                    }

                    boolean validate(Account account) {
                        return account.isActive();
                    }
                }
                """;
        Map<String, String> regions = CodeGenerator.regionsWithFindings(fixed, "Line 7 (java-x, error): ...");
        assertThat(regions).containsOnlyKeys("validate(Account)");

        String spliced = CodeGenerator.spliceMethods(fixed.replace("return account.isActive();", "return false;"),
                "    boolean validate(Account account) {\n        return account.isActive();\n    }\n", regions.keySet());
        assertThat(spliced).isEqualTo(fixed);
        assertThat(file).contains("a + b = c;");
        // a method the answer adds that was not sent is left out; one it loses is never accepted
        assertThat(CodeGenerator.spliceMethods(fixed, "    boolean validate(Account account) {\n        return true;\n    }\n"
                + "    void extra() { }\n", Set.of("validate(Account)"))).doesNotContain("extra");
    }

    // --- 6 and 7: outlines of REST resources, anonymous classes ---

    @Test
    void aRestResourcesMethodsAreWrittenNotMissing() {
        String resource = """
                @Path("/payees")
                public class PayeeResource {
                    @GET
                    @Path("/{id}")
                    public Response read(@PathParam("id") String id, @QueryParam("v") @DefaultValue("1") int v) throws IOException {
                        return Response.ok(find(id)).build();
                    }
                """;

        JavaCompileChecks.Outline outline = JavaCompileChecks.outline(resource);

        assertThat(outline.methods()).contains("read");
        assertThat(outline.missing()).containsExactly("find");
    }

    @Test
    void anAnonymousClassMayCallWhatItInherits() {
        String java = """
                package x;
                import java.util.*;
                class A {
                    Map<String, String> m = new HashMap<>() {{ put("a", "b"); }};
                    TimerTask t = new TimerTask() { public void run() { cancel(); } };
                }
                """;

        assertThat(JavaCompileChecks.undeclaredCalls(java)).isEmpty();
    }

    // --- 8: no wasted calls ---

    @Test
    void aPromptThatCannotGetSmallerIsNotSentAgain() {
        List<String> sent = new ArrayList<>();
        ModelGateway refusing = new ModelGateway() {
            @Override
            public ChatResult chat(String systemPrompt, String userPrompt) {
                sent.add(userPrompt);
                throw new PromptTooLargeException("too large", 1000, 5000, null);
            }

            @Override
            public ChatResult chatJson(String systemPrompt, String userPrompt) {
                return chat(systemPrompt, userPrompt);
            }

            @Override
            public float[] embed(String text) {
                return new float[0];
            }

            @Override
            public List<float[]> embedAll(List<String> texts) {
                return List.of();
            }
        };

        assertThatThrownBy(() -> PromptFit.chat(refusing, "system", scale -> "the same prompt at any scale"))
                .isInstanceOf(ModelGatewayException.class).hasMessageContaining("cannot be made smaller");
        assertThat(sent).hasSize(1);
    }

    // --- VAPT 1, 2: no slow regex on long input ---

    // A quadratic scan of this 512 KB line takes minutes; 5 s leaves room for a busy build machine.
    @Test
    void longLinesAreCheckedInLinearTime() {
        String line = "f(\"a\"),".repeat(512 * 1024 / 7);
        long start = System.nanoTime();
        ModelReasoning.findings("ui/js/viewModels/a.js", null, line);
        assertThat(Duration.ofNanos(System.nanoTime() - start)).isLessThan(Duration.ofSeconds(5));

        String throwsSpaces = "    void a() throws " + " ".repeat(20_000) + "x";
        String shortThrows = "    void a() throws " + " ".repeat(270) + "x";
        start = System.nanoTime();
        assertThat(CodeGenerator.methodStart(throwsSpaces)).isFalse();
        assertThat(CodeGenerator.methodStart(shortThrows)).isFalse();
        JavaCompileChecks.outline("class A {\n" + throwsSpaces + "\n" + shortThrows + "\n}\n");
        assertThat(Duration.ofNanos(System.nanoTime() - start)).isLessThan(Duration.ofSeconds(1));
        assertThat(CodeGenerator.methodStart("    public Response read(@PathParam(\"id\") String id) throws IOException, X {")).isTrue();

        // QA round 17's checks, each on input built to make it slow, after a small warm-up run of the same check
        java.util.function.Function<String, String> none = module -> null;
        quickly("define lists that never close", () -> JsModuleChecks.defineProblems("define([\n])\n", none),
                () -> JsModuleChecks.defineProblems("define([\n".repeat(16_000) + "])\n".repeat(16_000), none));
        String identifier = "a".repeat(3_900);
        quickly("a bundle alias on long names", () -> JsModuleChecks.defineProblems("define(['ojL10n!nls/x'], function (nls) {\n});\n", none),
                () -> JsModuleChecks.defineProblems("define(['ojL10n!nls/x'], function (nls) {\n" + ("  var " + identifier + " = nlsx;\n").repeat(40)
                        + "  " + identifier + ".x = nls.y;\n});\n", module -> "define({ root: { y: 'x' } });"));
        quickly("a parameter after a whitespace run", () -> JsModuleChecks.defineProblems("define(['a'], function (x) {\n});\n", none),
                () -> JsModuleChecks.defineProblems("define(['a'], function (" + " ".repeat(3_900) + "x = 1) {\n});\n", none));
        quickly("many parameters", () -> JsModuleChecks.defineProblems("define(['a'], function (p, q) {\n});\n", none),
                () -> JsModuleChecks.defineProblems("define(['a'], function (" + "p, ".repeat(1_000) + "q) {\n});\n", none));
        // 64 modules of the change after the last parameter, each with 200 functions, in a 100 KB view model
        StringBuilder list = new StringBuilder();
        java.util.Map<String, String> models = new java.util.HashMap<>();
        for (int i = 0; i < 64; i++) {
            list.append("'./m").append(i).append("', ");
            StringBuilder model = new StringBuilder("define([], function () {\n  return {\n");
            for (int f = 0; f < 200; f++) {
                model.append("    fn").append(i).append('_').append(f).append(": function () { return 1; },\n");
            }
            models.put("./m" + i, model.append("  };\n});\n").toString());
        }
        String calls = "  this.x.fn0_1(); this.y.call" + "a".repeat(10) + "();\n";
        String viewModel = "define([" + list + "'knockout'], function () {\n  return function VM() {\n" + calls.repeat(100_000 / calls.length())
                + "  };\n});\n";
        quickly("modules no parameter receives", () -> JsModuleChecks.defineProblems("define(['./m0'], function () {\n});\n", models::get),
                () -> JsModuleChecks.defineProblems(viewModel, models::get));
        // a cut-off plan with a long summary, and a BRD with many message rows
        quickly("a long summary", () -> PlanParser.partial("{\"summary\": \"x\""),
                () -> PlanParser.partial("{\"summary\": \"" + "x".repeat(20_000) + "\", \"items\": [{\"path\": \"a\"}, {\"pa"));
        StringBuilder brd = new StringBuilder("# Error codes\n\n| Code | Message |\n| --- | --- |\n");
        for (int i = 0; i < 60_000; i++) {
            brd.append("| ERR_").append(i).append(" | Message ").append(i).append(" |\n");
        }
        quickly("many message rows", () -> com.obdx.factory.requirements.DocumentStructureAccess.read("| Code | Message |\n| --- | --- |\n| E_1 | x |\n"),
                () -> com.obdx.factory.requirements.DocumentStructureAccess.read(brd.toString()));
        // repeated methods with long parameter lists of spaces, and braces after parentheses that never open, in large files
        StringBuilder java = new StringBuilder("class A {\n");
        for (int i = 0; i < 2_000; i++) {
            java.append("    void m(int a,").append(" ".repeat(500)).append("int b) { }\n");
        }
        quickly("repeated methods", () -> CodeGenerator.withoutRepeatedMethods("class A { void m() { } }\n", new java.util.ArrayList<>()),
                () -> CodeGenerator.withoutRepeatedMethods(java.append("}\n").toString(), new java.util.ArrayList<>()));
        quickly("braces after parentheses", () -> CodeGenerator.withoutRepeatedMethods("class A { }\n", new java.util.ArrayList<>()),
                () -> CodeGenerator.withoutRepeatedMethods("class A {\n" + ") {\n".repeat(100_000) + "}\n", new java.util.ArrayList<>()));
    }

    // --- QA18 VAPT V1: a view and its view model are read in linear time, each input on its own ---

    @Test
    void viewsAndViewModelsAreReadInLinearTime() {
        String view = "<span>[[amount]]</span>";
        String viewModel = "function VM() { this.amount = ko.observable(); this.rows = []; }";
        // the view: unclosed bindings of each kind, comments and script tags that never close, a long binding
        quickly("unclosed [[", () -> ViewBindings.problems(view, viewModel, true), () -> ViewBindings.problems("[[".repeat(50_000), viewModel, true));
        quickly("unclosed {{a", () -> ViewBindings.problems(view, viewModel, true), () -> ViewBindings.problems("{{a".repeat(40_000), viewModel, true));
        quickly("[[ then one ]] at the end", () -> ViewBindings.bound(view), () -> ViewBindings.bound("[[a ".repeat(40_000) + "]]"));
        quickly("comments that never close", () -> ViewBindings.bound(view), () -> ViewBindings.bound("<!--".repeat(40_000) + view));
        quickly("script tags", () -> ViewBindings.bound(view), () -> ViewBindings.bound("<script>".repeat(20_000) + view));
        quickly("script tags without an end", () -> ViewBindings.bound(view), () -> ViewBindings.bound("<script".repeat(20_000)));
        quickly("aliases", () -> ViewBindings.bound(view), () -> ViewBindings.bound("as=\"" + "a".repeat(100_000)));
        quickly("hyphens in a binding", () -> ViewBindings.problems(view, null), () -> ViewBindings.problems(("[[." + "a-".repeat(900) + "]]")
                .repeat(50), null));
        // the view model: blank lines, spaces, static modifiers, receivers, brackets, classes, returned objects
        quickly("blank lines", () -> ViewBindings.outline(viewModel), () -> ViewBindings.problems(view, "\n".repeat(100_000) + "1", true));
        quickly("spaces and lines", () -> ViewBindings.outline(viewModel), () -> ViewBindings.problems(view, " \n".repeat(50_000) + "1", true));
        quickly("static modifiers", () -> ViewBindings.outline(viewModel), () -> ViewBindings.problems(view, "static ".repeat(5_000), true));
        quickly("static modifiers in a class", () -> ViewBindings.outline(viewModel),
                () -> ViewBindings.outline("class A {\n" + "static ".repeat(5_000) + "x() {}\n}\n"));
        quickly("identifiers and parentheses", () -> ViewBindings.outline(viewModel), () -> ViewBindings.outline("a(".repeat(50_000)));
        quickly("an open parenthesis", () -> ViewBindings.outline(viewModel), () -> ViewBindings.outline("\na (" + "x".repeat(100_000)));
        quickly("self. after self.", () -> ViewBindings.outline(viewModel), () -> ViewBindings.outline("self.".repeat(40_000)));
        quickly("a long receiver", () -> ViewBindings.outline(viewModel), () -> ViewBindings.outline("self.a" + " ".repeat(100_000)));
        quickly("brackets", () -> ViewBindings.outline(viewModel), () -> ViewBindings.outline("self[".repeat(40_000)));
        quickly("a long name", () -> ViewBindings.outline(viewModel), () -> ViewBindings.outline("self.a" + "x".repeat(200_000) + " = 1"));
        quickly("extend and spaces", () -> ViewBindings.outline(viewModel), () -> ViewBindings.outline("extend" + " ".repeat(100_000)));
        quickly("classes", () -> ViewBindings.outline(viewModel), () -> ViewBindings.outline("class A {\n".repeat(20_000)));
        quickly("returned objects", () -> ViewBindings.outline(viewModel), () -> ViewBindings.outline("return {".repeat(20_000)));
        quickly("strings that never close", () -> ViewBindings.outline(viewModel),
                () -> ViewBindings.outline("class A {\n" + "'".repeat(50_000) + "\n" + "\"x".repeat(50_000)));
        quickly("arrow values", () -> ViewBindings.outline(viewModel), () -> ViewBindings.outline(("self.a = (" + "b, ".repeat(60) + "\n")
                .repeat(1_000)));
        // slashes that may start regular expression literals, members on one line, typed members, letters that lower-case longer
        quickly("slashes after parentheses", () -> ViewBindings.outline(viewModel), () -> ViewBindings.outline("class A {\n" + "(/".repeat(50_000)));
        quickly("members on one line", () -> ViewBindings.outline(viewModel), () -> ViewBindings.outline("class A { " + "a = 1; ".repeat(30_000) + "}"));
        quickly("closing braces on one line", () -> ViewBindings.outline(viewModel), () -> ViewBindings.outline("class A { " + "}".repeat(100_000)));
        quickly("typed members", () -> ViewBindings.outline(viewModel), () -> ViewBindings.outline("class A {\n"
                + ("  public readonly a" + " ".repeat(50) + ": " + "x".repeat(200) + "\n").repeat(2_000) + "}\n"));
        quickly("modifiers", () -> ViewBindings.outline(viewModel), () -> ViewBindings.outline("class A {\n" + "public ".repeat(20_000) + "\n}\n"));
        quickly("copying calls", () -> ViewBindings.outline(viewModel), () -> ViewBindings.outline("extend(".repeat(30_000)));
        quickly("dotted capital I", () -> ViewBindings.bound(view), () -> ViewBindings.bound("İ".repeat(100_000) + "<!--x-->" + view));
        quickly("gaps with abbreviations", () -> PlanReview.newTable("a new table"), () -> PlanReview.newTable("e.g. ".repeat(300) + "new table"));
        // a gap's table words
        quickly("table words", () -> PlanReview.newTable("a new table"), () -> PlanReview.newTable(("new" + " ".repeat(50)).repeat(2_000)));
        // QA 19: the model's reasoning in a plan's text, what a resource serves, where a file is written, questions asked twice
        quickly("reasoning sentences", () -> ModelReasoning.withoutReasoningSentences("Wait, no. Fine."),
                () -> ModelReasoning.withoutReasoningSentences("The JSON provided was ".repeat(20_000)));
        quickly("many short sentences", () -> ModelReasoning.withoutReasoningSentences("Wait, no. Fine."),
                () -> ModelReasoning.withoutReasoningSentences(". ".repeat(200_000)));
        quickly("one long sentence", () -> ModelReasoning.withoutReasoningSentences("Wait, no. Fine."),
                () -> ModelReasoning.withoutReasoningSentences("my previous " + "a ".repeat(200_000) + "answer"));
        ChangePlan.Item resource = new ChangePlan.Item("backend/SiResource.java", "create", "service", "x", List.of(), "y");
        quickly("details naming a path", () -> PlanReview.serves(resource, "/payments/standingInstructions"),
                () -> PlanReview.serves(new ChangePlan.Item("backend/SiResource.java", "create", "service", "/a".repeat(100_000), List.of(),
                        "/standinginstruction".repeat(10_000)), "/payments/standingInstructions"));
        quickly("long segments", () -> PlanReview.serves(resource, "/payments/standingInstructions"),
                () -> PlanReview.serves(resource, "/" + "aB".repeat(100_000)));
        quickly("long resource names", () -> PlanReview.words("StandInstructionResource"),
                () -> PlanReview.serves(new ChangePlan.Item("backend/" + "StandX".repeat(50_000) + "Resource.java", "create", "service", null,
                        List.of(), null), "/payments/standingInstructions"));
        quickly("stage of long paths", () -> PlanParser.stage("service", "channel/a/model.js"),
                () -> PlanParser.stage("service", "channel/".repeat(50_000) + "nls/x.js"));
        List<com.obdx.factory.requirements.RequirementSpec.OpenQuestion> questions = new ArrayList<>();
        for (int i = 0; i < 60; i++) {
            questions.add(new com.obdx.factory.requirements.RequirementSpec.OpenQuestion("Question " + i + " " + "word ".repeat(400), null,
                    null, List.of("option ".repeat(400)), null, null));
        }
        quickly("many long questions", () -> com.obdx.factory.requirements.DocumentStructureAccess.questions(questions.subList(0, 2)),
                () -> com.obdx.factory.requirements.DocumentStructureAccess.questions(questions));
    }

    /** Runs a small input first (so the code is compiled), then the large one, which must take under 2 seconds. */
    private static void quickly(String what, Runnable warmUp, Runnable large) {
        warmUp.run();
        // The first large run compiles the code paths a small input does not reach (and pays for loading classes): it
        // is not timed, but it must not take long either (a quadratic scan takes minutes)
        Duration first = timed(large);
        assertThat(first).as(what + " (first run)").isLessThan(Duration.ofSeconds(10));
        // then the best of three runs, so a pause of the machine or the collector does not fail it
        Duration best = first;
        for (int run = 0; run < 3 && best.compareTo(Duration.ofSeconds(2)) >= 0 || run < 1; run++) {
            Duration again = timed(large);
            best = again.compareTo(best) < 0 ? again : best;
        }
        assertThat(best).as(what).isLessThan(Duration.ofSeconds(2));
    }

    private static Duration timed(Runnable run) {
        long start = System.nanoTime();
        run.run();
        return Duration.ofNanos(System.nanoTime() - start);
    }

    // --- VAPT 6: removing comments never changes strings or cuts the file ---

    @Test
    void reasoningIsNotTakenOutOfTextBlocksOrOpenComments() {
        String textBlock = "class A {\n    String s = \"\"\"\n        // The prompt says this is text\n        \"\"\";\n}\n";
        assertThat(ModelReasoning.withoutReasoningComments("A.java", null, textBlock).removed()).isZero();

        String open = "class A {\n    void a() { }\n    /* The prompt says the rest\n    void b() { }\n}\n";
        assertThat(ModelReasoning.withoutReasoningComments("A.java", null, open).removed()).isZero();
    }

    // --- 5: a whole answer kept as the rewrite is checked, not continued ---

    @Test
    void aWholeAnswerKeptAsTheRewriteIsRecordedSo() {
        ChangeFileStore files = mock(ChangeFileStore.class);
        ChangeFileStore.ChangeFile file = new ChangeFileStore.ChangeFile(0, "ui/views/a.html", "create", "ui", null, ChangeFileStore.Status.GENERATED,
                null, "<div></div>\n", false, FileChecks.Status.PASSED, null, 1, "<div>\n  <p>new</p>\n</div>\n", true);

        ChangeService.Kept kept = ChangeService.resumable(files, CHANGE, file);

        assertThat(kept.complete()).isTrue();
        assertThat(kept.text()).isEqualTo("<div>\n  <p>new</p>\n</div>\n");
    }
}
