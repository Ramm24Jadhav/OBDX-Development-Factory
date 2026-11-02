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
