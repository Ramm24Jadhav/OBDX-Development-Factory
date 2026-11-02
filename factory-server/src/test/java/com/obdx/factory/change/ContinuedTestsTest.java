package com.obdx.factory.change;

import com.obdx.factory.model.ModelGateway;
import org.junit.jupiter.api.Test;
import org.springframework.util.unit.DataSize;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * QA round 17's BRD4 test file on a server that writes 900 tokens per answer: its continuations wrote five tests again
 * inside an unclosed one. Methods written again are left out, and a test file with a test per criterion is finished.
 */
class ContinuedTestsTest {

    /** Answers with queued replies; "CUT:" marks one that stopped at the output limit. */
    static final class Scripted implements ModelGateway {
        final Deque<String> replies = new ArrayDeque<>();
        final List<String> prompts = new ArrayList<>();

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
    }

    private static final String PATH = "backend/test/com/bank/obdx/payments/BeneficiaryValidationServiceTest.java";

    @Test
    void aTestFileWithATestPerCriterionIsFinishedInsteadOfContinuedAgain() {
        Scripted model = new Scripted();
        CodeGenerator generator = new CodeGenerator(model, new ChangeProperties(30, 25, DataSize.ofKilobytes(80), 0, "branches/factory", "-"),
                new com.obdx.factory.pack.LocalChecks(com.obdx.factory.pack.VersionPacks.builtIn()));
        ChangeContext context = new ChangeContext("BRD4", "{\"screens\": []}", "[]", "- Java version: Java 8", "backend/: 3");
        ChangePlan.Item item = new ChangePlan.Item(PATH, "create", "test", "Tests the validation flow.", List.of(),
                "Validates AC-001 to AC-002 by checking the 100-entry limit.");
        ChangePlan plan = new ChangePlan("x", List.of(item), List.of());
        model.replies.add("""
                CUT:package com.bank.obdx.payments;

                import org.junit.Test;
                import static org.junit.Assert.assertEquals;

                public class BeneficiaryValidationServiceTest {

                    @Test
                    public void rejectsAnEmptyList() {
                        assertEquals(1, 1); // AC-001
                    }

                    @Test
                    public void rejectsMoreThanAHundred() {
                        assertEquals(2, 2); // AC-002
                    }

                    @Test
                    public void writesTheAudit""");
        // asked to finish, the model went on with more tests and stopped at its limit again
        model.replies.add("""
                CUT:    @Test
                    public void writesTheAuditRow() {
                        assertEquals(3, 3);
                    }

                    @Test
                    public void rejectsAnEmptyList() {
                        assertEquals(1, 1);
                    }

                    @Test
                    public void more""");

        CodeGenerator.Result result = generator.generate(context, plan, item, null, Map.of(), Map.of(), null);

        assertThat(model.prompts).hasSize(2);
        assertThat(model.prompts.get(1)).contains("finish the test being written, then close the class. Write no more tests.");
        // closed after its last whole test, without the test written twice
        assertThat(CodeGenerator.joinProblem(PATH, result.content())).isNull();
        assertThat(result.content()).contains("writesTheAuditRow").endsWith("    }\n}\n");
        assertThat(CodeGenerator.tests(result.content())).isEqualTo(3);
        assertThat(result.check().message()).doesNotContain(CodeGenerator.CUT);
    }

    @Test
    void methodsWrittenAgainAreLeftOutEvenWhenTheFileDoesNotParse() {
        // as in the evidence: a piece started over inside an unclosed test and wrote two tests again
        String content = """
                package com.bank.obdx.payments;

                public class ServiceTest {

                    @Test
                    public void validate_noEntries() {
                        check(0);
                    }

                    @Test
                    public void validate_tooMany(int count) {
                        check(count);
                    }

                    @Test
                    public void withInjection() {
                        String id = "x";
                        // the model's piece ended here
                    @Test
                    public void validate_noEntries() {
                        check(0, "again");
                    }

                    @Override
                    @Test
                    public void validate_tooMany(final int n) {
                        check(n);
                    }

                    @Test
                    public void validate_other() {
                        check(1);
                    }
                }
                """;
        List<String> notes = new ArrayList<>();

        String once = CodeGenerator.withoutRepeatedMethods(content, notes);

        assertThat(once).doesNotContain("\"again\"").doesNotContain("@Override").contains("validate_other", "withInjection");
        assertThat(once.split("void validate_noEntries", -1)).hasSize(2);
        assertThat(once.split("void validate_tooMany", -1)).hasSize(2);
        assertThat(notes).hasSize(2).allMatch(n -> n.contains("was written again"))
                .anyMatch(n -> n.startsWith("The method validate_noEntries() was written again (line 20, first on line 6)"));
        // the comment before the method that was left out stays
        assertThat(once).contains("// the model's piece ended here");
    }

    @Test
    void theSameMethodInTwoAnonymousClassesIsNoRepeat() {
        String content = """
                class A {
                    Runnable first() {
                        return new Runnable() {
                            @Override
                            public void run() { System.out.println(1); }
                        };
                    }
                    Runnable second() {
                        return new Runnable() {
                            @Override
                            public void run() { System.out.println(2); }
                        };
                    }
                    void over(String s) { }
                    void over(int i) { }
                }
                """;

        assertThat(CodeGenerator.withoutRepeatedMethods(content, new ArrayList<>())).isEqualTo(content);
    }

    @Test
    void readsTheCriteriaATestFileCovers() {
        assertThat(CodeGenerator.criteria(new ChangePlan.Item("test/ATest.java", "create", "test", "AC-003", List.of(),
                "Validates AC-001 to AC-002, and AC-005."))).containsExactly("AC-003", "AC-001", "AC-002", "AC-005");
        assertThat(CodeGenerator.criteria(new ChangePlan.Item("src/A.java", "create", "service", null, List.of(), "AC-001"))).isEmpty();
        assertThat(CodeGenerator.tests("@Test void a() {}\n@Test void b() {}")).isEqualTo(2);
        assertThat(CodeGenerator.tests("describe('x', () => {\n  it('a', () => {});\n  test('b', () => {});\n});")).isEqualTo(2);
    }
}
