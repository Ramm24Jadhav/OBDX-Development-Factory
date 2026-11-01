package com.obdx.factory.change;

import com.obdx.factory.model.ModelGateway;
import com.obdx.factory.pack.LocalChecks;
import com.obdx.factory.pack.VersionPacks;
import org.junit.jupiter.api.Test;
import org.springframework.util.unit.DataSize;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class CodeGeneratorTest {

    private final Deque<String> replies = new ArrayDeque<>();
    private final List<String> prompts = new ArrayList<>();
    private final ModelGateway model = new ModelGateway() {
        @Override
        public ChatResult chat(String systemPrompt, String userPrompt) {
            prompts.add(userPrompt);
            String reply = replies.removeFirst();
            // "CUT:" marks a reply that stopped at the model's output limit
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
    private final CodeGenerator generator = new CodeGenerator(model, new ChangeProperties(30, 25, DataSize.ofKilobytes(80), 2, "branches/factory", "-"),
            new LocalChecks(VersionPacks.builtIn()));

    private final ChangeContext context = new ChangeContext("Remarks", "{\"screens\": []}", "[{\"name\": \"Transfer\"}]", "- Java version: Java 8", "backend/: 3");
    private final ChangePlan.Item item = new ChangePlan.Item("backend/RemarksValidator.java", "create", "service", "Validate remarks",
            List.of("backend/LimitValidator.java"), "Check length 35");
    private final ChangePlan plan = new ChangePlan("Add remarks", List.of(item), List.of());

    @Test
    void fixesFilesThatFailTheirCheck() {
        replies.add("```java\npublic class RemarksValidator { void check( }\n```");
        replies.add("Sure, here it is:\n```\npublic class RemarksValidator { void check() {} }\n```\nDone.");

        CodeGenerator.Result result = generator.generate(context, plan, item, null,
                Map.of("backend/LimitValidator.java", "public class LimitValidator {}"), Map.of("backend/Earlier.java", "class Earlier {}"), "use a constant");

        assertThat(result.content()).isEqualTo("public class RemarksValidator { void check() {} }\n");
        assertThat(result.check().status()).isEqualTo(FileChecks.Status.PASSED);
        assertThat(result.attempts()).isEqualTo(2);
        assertThat(prompts.getFirst()).contains("File to write: backend/RemarksValidator.java (create, service)",
                "Reviewer's instruction: use a constant", "Example file to follow, backend/LimitValidator.java",
                "Files already written in this change", "- Java version: Java 8")
                .doesNotContain("Screen designs");
        assertThat(prompts.get(1)).contains("It did not pass the checks:\nJava does not parse");
    }

    @Test
    void stopsAfterTheAllowedFixAttempts() {
        replies.add("class A { void x( }");
        replies.add("class A { void x( }");
        replies.add("class A { void x( }");

        CodeGenerator.Result result = generator.generate(context, plan, item, null, Map.of(), Map.of(), null);

        assertThat(result.attempts()).isEqualTo(3);
        assertThat(result.check().status()).isEqualTo(FileChecks.Status.FAILED);
    }

    @Test
    void reportsAFileStillCutOffAfterItsContinuationsInsteadOfAskingAgainWithIt() {
        replies.add("CUT:public class RemarksValidator { void check() {} }");
        for (int i = 0; i < CodeGenerator.MAX_CONTINUATIONS; i++) {
            replies.add("CUT:// more " + i + "\n");
        }

        CodeGenerator.Result result = generator.generate(context, plan, item, null, Map.of(), Map.of(), null);

        assertThat(result.attempts()).isEqualTo(1);
        assertThat(replies).isEmpty();
        assertThat(result.check().status()).isEqualTo(FileChecks.Status.FAILED);
        assertThat(result.check().message()).contains("output limit", "higher output limit");
    }

    @Test
    void aLocalModelIsAskedToContinueFewerTimes() {
        ModelGateway local = new ModelGateway() {
            @Override
            public ChatResult chat(String systemPrompt, String userPrompt) {
                return model.chat(systemPrompt, userPrompt);
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

            @Override
            public boolean local() {
                return true;
            }
        };
        CodeGenerator onOllama = new CodeGenerator(local, new ChangeProperties(30, 25, DataSize.ofKilobytes(80), 2, "branches/factory", "-"),
                new LocalChecks(VersionPacks.builtIn()));
        replies.add("CUT:public class RemarksValidator { void check() {} }");
        for (int i = 0; i < CodeGenerator.LOCAL_CONTINUATIONS; i++) {
            replies.add("CUT:// more " + i + "\n");
        }

        CodeGenerator.Result result = onOllama.generate(context, plan, item, null, Map.of(), Map.of(), null);

        assertThat(replies).isEmpty();
        assertThat(prompts).hasSize(1 + CodeGenerator.LOCAL_CONTINUATIONS);
        assertThat(result.check().message()).contains("continue " + CodeGenerator.LOCAL_CONTINUATIONS + " times");
    }

    /** A gateway with a known input limit, answering from the same replies; "LIMIT" is the daily limit used up. */
    private ModelGateway limited(int inputLimit) {
        return new ModelGateway() {
            @Override
            public ChatResult chat(String systemPrompt, String userPrompt) {
                if ("LIMIT".equals(replies.peekFirst())) {
                    replies.removeFirst();
                    throw new com.obdx.factory.model.ModelLimitReachedException("daily limit", true, "about 15 minutes", null);
                }
                return model.chat(systemPrompt, userPrompt);
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

            @Override
            public int inputLimit() {
                return inputLimit;
            }
        };
    }

    private CodeGenerator generatorWith(ModelGateway gateway) {
        return new CodeGenerator(gateway, new ChangeProperties(30, 25, DataSize.ofKilobytes(80), 2, "branches/factory", "-"),
                new LocalChecks(VersionPacks.builtIn()));
    }

    @Test
    void aContinuationIsThePromptAtTheSameScalePlusOnlyTheFilesEnd() {
        String longStart = "public class RemarksValidator {\n" + "    private String field;\n".repeat(400);
        Map<String, String> earlier = new java.util.LinkedHashMap<>();
        for (int i = 0; i < 10; i++) {
            earlier.put("backend/Remarks" + i + "Dto.java", "package com.bank;\npublic class Remarks" + i + "Dto {\n"
                    + "    private String field;\n".repeat(200) + "}\n");
        }
        replies.add("CUT:" + longStart);
        replies.add("    private String field;\n}\n");

        generatorWith(limited(0)).generate(context, plan, item, null, Map.of(), earlier, null);

        // no limit known: the continuation is the first prompt and at most the last 3000 characters of the file (and the ask)
        assertThat(prompts.get(1).length()).isLessThanOrEqualTo(prompts.get(0).length() + CodeGenerator.TAIL + 400);
        assertThat(prompts.get(1)).doesNotContain(longStart.substring(0, 200));

        // a known limit: the first prompt shrinks, and the continuation starts at that scale and fits too
        int full = prompts.get(0).length();
        prompts.clear();
        replies.add("CUT:" + longStart);
        replies.add("    private String field;\n}\n");
        int limit = (int) (full * 0.7 / 3.5);
        generatorWith(limited(limit)).generate(context, plan, item, null, Map.of(), earlier, null);
        double room = limit * 0.9 * 3.5;
        assertThat(prompts.get(0).length()).isLessThan(full).isLessThanOrEqualTo((int) room);
        assertThat(prompts.get(1).length()).isLessThanOrEqualTo((int) room);
    }

    @Test
    void aFileStoppedByTheLimitPartWayIsKeptAndContinuedFromLater() {
        replies.add("CUT:public class RemarksValidator {\n    void check(String remarks) {\n");
        replies.add("LIMIT");

        CodeGenerator onGroq = generatorWith(limited(0));
        CodeGenerator.Partial stopped = org.assertj.core.api.Assertions.catchThrowableOfType(CodeGenerator.Partial.class,
                () -> onGroq.generate(context, plan, item, null, Map.of(), Map.of(), null));
        assertThat(stopped.content()).isEqualTo("public class RemarksValidator {\n    void check(String remarks) {\n");
        assertThat(stopped.daily()).isTrue();

        // Continue: no new first piece; the model is asked at once to go on from the kept part
        prompts.clear();
        replies.add("    void check(String remarks) {\n    }\n}\n");
        CodeGenerator.Result result = onGroq.generate(context, plan, item, null, null, Map.of(), Map.of(), null, null, stopped.content());

        assertThat(prompts).hasSize(1);
        assertThat(prompts.getFirst()).contains("The file so far ends with:\npublic class RemarksValidator {",
                "repeating its last line exactly as it is:\n    void check(String remarks) {");
        assertThat(result.content()).isEqualTo("public class RemarksValidator {\n    void check(String remarks) {\n    }\n}\n");
    }

    @Test
    void aFileCutOffAtTheOutputLimitIsContinuedAndJoined() {
        // A server that writes little per answer (a per-minute output limit): the file comes in pieces
        // Each piece starts by repeating the last whole line of the one before (the cut-off "    void check(..." is left out)
        replies.add("CUT:```java\npublic class RemarksValidator {\n    void check(String remarks) {");
        replies.add("CUT:public class RemarksValidator {\n    void check(String remarks) {\n        if (remarks.length() > 35) {\n");
        replies.add("```java\n        if (remarks.length() > 35) {\n            throw new IllegalArgumentException();\n        }\n    }\n}\n```");

        CodeGenerator.Result result = generator.generate(context, plan, item, null, Map.of(), Map.of(), null);

        assertThat(result.content()).isEqualTo("""
                public class RemarksValidator {
                    void check(String remarks) {
                        if (remarks.length() > 35) {
                            throw new IllegalArgumentException();
                        }
                    }
                }
                """);
        assertThat(result.check().status()).isEqualTo(FileChecks.Status.PASSED);
        assertThat(prompts.get(1)).contains("Begin your answer by repeating its last line exactly as it is:\npublic class RemarksValidator {")
                .doesNotContain("void check(String remarks)");
    }

    @Test
    void aContinuationThatIsTheModelsReasoningIsAskedForAgainAndNeverKept() {
        replies.add("CUT:public class RemarksValidator {\n    void check(String remarks) {\n");
        // QA round 10: the model talking to itself instead of writing the file
        replies.add("// Wait, the prompt says to continue.\n// Let's check what was written.\n// But wait, I already wrote that line\n");
        replies.add("    void check(String remarks) {\n    }\n}\n");

        CodeGenerator.Result result = generator.generate(context, plan, item, null, Map.of(), Map.of(), null);

        assertThat(result.content()).isEqualTo("public class RemarksValidator {\n    void check(String remarks) {\n    }\n}\n");
        assertThat(prompts.get(2)).contains("Do not write notes to yourself");

        // a piece with code before the reasoning keeps the code and asks for the rest
        prompts.clear();
        replies.add("CUT:public class RemarksValidator {\n    void check(String remarks) {\n");
        replies.add("    void check(String remarks) {\n        if (remarks == null) {\n            return;\n        }\n"
                + "        // WAIT. The prompt says remarks are optional\n        trim(remarks);\n");
        replies.add("        }\n    }\n}\n");
        replies.add("        }\n    }\n}\n");
        CodeGenerator.Result cutBack = generator.generate(context, plan, item, null, Map.of(), Map.of(), null);

        assertThat(cutBack.content()).doesNotContain("WAIT").doesNotContain("trim(remarks)")
                .startsWith("public class RemarksValidator {\n    void check(String remarks) {\n        if (remarks == null) {\n");
        assertThat(prompts.get(2)).contains("repeating its last line exactly as it is:\n        }");
    }

    @Test
    void reasoningIsNeverSavedAsThePartial() {
        replies.add("CUT:public class RemarksValidator {\n    void check(String remarks) {\n        // Let's assume the limit is 35\n"
                + "        // Wait, I need the limit from the spec\n");
        replies.add("LIMIT");

        CodeGenerator.Partial stopped = org.assertj.core.api.Assertions.catchThrowableOfType(CodeGenerator.Partial.class,
                () -> generatorWith(limited(0)).generate(context, plan, item, null, Map.of(), Map.of(), null));

        assertThat(stopped.content()).isEqualTo("public class RemarksValidator {\n    void check(String remarks) {\n");
    }

    @Test
    void aSeamThatLostTextFailsTheFileInsteadOfKeepingIt() {
        // QA round 10, BeneficiaryValidationServiceTest: the partial ended in the middle of a name
        String partial = """
                package com.bank.beneficiary;

                public class BeneficiaryValidationServiceTest {
                    void rejectsAShortName() {
                        BeneficiaryValidationRequest request = new BeneficiaryValidationRequest();
                        BeneficiaryValidationRequest.Beneficiary""";
        ChangePlan.Item test = new ChangePlan.Item("backend/BeneficiaryValidationServiceTest.java", "create", "test", null, List.of(), null);
        ChangePlan testPlan = new ChangePlan(null, List.of(test), List.of());
        // no fix attempts: only the join is under test
        CodeGenerator generator = new CodeGenerator(model, new ChangeProperties(30, 25, DataSize.ofKilobytes(80), 0, "branches/factory", "-"),
                new LocalChecks(VersionPacks.builtIn()));

        // the model goes on in the middle of the line it did not see whole, twice: asked again once, then the pieces do not parse
        replies.add("Name(\"AB\"), \"123456789\"); // 2 chars, too short\n    }\n}\n");
        replies.add("Name(\"AB\"), \"123456789\"); // 2 chars, too short\n    }\n}\n");
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> generator.generate(context, testPlan, test, null, null, Map.of(), Map.of(), null,
                        null, partial))
                .isInstanceOf(CodeGenerator.JoinFailed.class).hasMessageContaining("did not join cleanly").hasMessageContaining("write it again")
                .hasMessageNotContaining("expected one of");
        // it was asked for a fresh line: the cut-off name is not in what it was shown
        assertThat(prompts.getFirst()).contains("repeating its last line exactly as it is:\n"
                + "        BeneficiaryValidationRequest request = new BeneficiaryValidationRequest();")
                .doesNotContain("BeneficiaryValidationRequest.Beneficiary");
        assertThat(prompts.get(1)).contains("MUST begin with that exact line");

        // repeating the last line, as asked: joined on it
        replies.add("        BeneficiaryValidationRequest request = new BeneficiaryValidationRequest();\n"
                + "        request.setBeneficiaryName(\"AB\"); // 2 chars, too short\n    }\n}\n");
        assertThat(generator.generate(context, testPlan, test, null, null, Map.of(), Map.of(), null, null, partial).content())
                .contains("new BeneficiaryValidationRequest();\n        request.setBeneficiaryName(\"AB\");")
                .containsOnlyOnce("BeneficiaryValidationRequest request =");
    }

    @Test
    void aContinuedJavaFileKnowsWhatIsWrittenLosesItsRepeatsAndGetsItsMissingMethods() throws Exception {
        // QA round 12's BeneficiaryValidatorTest: cut off after two tests, then a piece that wrote a test again
        String test = com.obdx.factory.pack.JavaCompileChecksTest.roundTwelve();
        int seam = test.indexOf("    // BR-006 / AC-004");
        ChangePlan.Item testItem = new ChangePlan.Item("backend/src/com/bank/obdx/payments/BeneficiaryValidatorTest.java", "create", "test",
                null, List.of(), null);
        CodeGenerator noFixes = new CodeGenerator(model, new ChangeProperties(30, 25, DataSize.ofKilobytes(80), 0, "branches/factory", "-"),
                new LocalChecks(VersionPacks.builtIn()));
        replies.add("CUT:" + test.substring(0, seam));
        replies.add("    }\n\n" + test.substring(seam));
        // asked once for the helpers no piece wrote
        replies.add("""
                private BeneficiaryValidationRequest.BeneficiaryEntry createValidEntry(String clientRef) {
                    BeneficiaryValidationRequest.BeneficiaryEntry entry = new BeneficiaryValidationRequest.BeneficiaryEntry();
                    entry.setClientRef(clientRef);
                    return entry;
                }

                private boolean hasErrorCode(BeneficiaryValidationResponse.Result result, String code) {
                    return result.getErrors().stream().anyMatch(e -> code.equals(e.getCode()));
                }
                """);

        CodeGenerator.Result result = noFixes.generate(context, new ChangePlan(null, List.of(testItem), List.of()), testItem, null, null,
                Map.of(), Map.of(), null, null, null);

        assertThat(prompts.get(1)).contains("Already written, do not write these again: methods setUp, testInvalidIfscFormat, testDuplicateClientRef;",
                "Methods called but not yet written (write each of them once, in this file): createValidEntry, hasErrorCode.");
        assertThat(prompts.get(2)).contains("calls methods it does not declare: createValidEntry, hasErrorCode, assertFalse",
                "Write only these missing methods");
        assertThat(result.content()).containsOnlyOnce("public void testDuplicateClientRef()")
                .contains("    private BeneficiaryValidationRequest.BeneficiaryEntry createValidEntry(String clientRef) {")
                .endsWith("}\n");
        assertThat(com.obdx.factory.pack.JavaCompileChecks.undeclaredCalls(result.content())).containsOnlyKeys("assertFalse");
        // what joining changed is in the file's check, and the one call still undeclared fails it
        assertThat(result.check().message()).contains("testDuplicateClientRef() was written twice across the answer's pieces",
                "were asked for and added: createValidEntry, hasErrorCode, assertFalse", "Calls assertFalse(...)");
        assertThat(result.check().status()).isEqualTo(FileChecks.Status.FAILED);
    }

    @Test
    void onASmallPerMinuteLimitTheFirstPromptLeavesRoomForTheWholeAnswer() {
        // Groq's 8000 tokens a minute, prompt and answer together; a test file is expected to take about 3000 tokens
        ModelGateway smallPlan = new ModelGateway() {
            @Override
            public ChatResult chat(String systemPrompt, String userPrompt) {
                return model.chat(systemPrompt, userPrompt);
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

            @Override
            public int tokensPerMinute() {
                return 8000;
            }
        };
        ChangePlan.Item test = new ChangePlan.Item("backend/RemarksValidatorTest.java", "create", "test", "Tests of RemarksValidator", List.of(), null);
        // two examples (each capped at 12,000 characters): too much beside a 3000-token answer
        Map<String, String> examples = Map.of("backend/LimitValidatorTest.java", "public class LimitValidatorTest {\n"
                + "    // an example test line\n".repeat(1500) + "}\n", "backend/AmountValidatorTest.java", "public class AmountValidatorTest {\n"
                + "    // an example test line\n".repeat(1500) + "}\n");
        replies.add("public class RemarksValidatorTest { }");

        generatorWith(smallPlan).generate(context, new ChangePlan(null, List.of(test), List.of()), test, null, examples, Map.of(), null);

        assertThat(CodeGenerator.expectedAnswerTokens(test, null, 3.5)).isEqualTo(3000);
        // prompt + expected answer within 90% of 8000: at most 4200 tokens of prompt, so the examples are left out first
        assertThat((CodeGenerator.SYSTEM.length() + prompts.getFirst().length()) / 3.5).isLessThanOrEqualTo(0.9 * 8000 - 3000);
        assertThat(prompts.getFirst()).doesNotContain("an example test line").contains("File to write: backend/RemarksValidatorTest.java");

        // with room enough, nothing is left out
        prompts.clear();
        replies.add("public class RemarksValidatorTest { }");
        generator.generate(context, new ChangePlan(null, List.of(test), List.of()), test, null, examples, Map.of(), null);
        assertThat(prompts.getFirst()).contains("an example test line");
    }

    /** A gateway with Groq's 8000 tokens a minute; "LIMIT" is the daily limit used up. */
    private ModelGateway eightThousand() {
        return new ModelGateway() {
            @Override
            public ChatResult chat(String systemPrompt, String userPrompt) {
                if ("LIMIT".equals(replies.peekFirst())) {
                    replies.removeFirst();
                    prompts.add(userPrompt);
                    throw new com.obdx.factory.model.ModelLimitReachedException("daily limit", true, "about 15 minutes", null);
                }
                return model.chat(systemPrompt, userPrompt);
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

            @Override
            public int tokensPerMinute() {
                return 8000;
            }
        };
    }

    @Test
    void aWholeFileWhoseOnlyFindingIsAReasoningCommentIsCleanedNotWrittenAgain() {
        replies.add("""
                public class RemarksValidator {
                    // The prompt asks for remarks of at most 35 characters.
                    private static final int MAX = 35; // As per the instructions, a constant.

                    boolean valid(String remarks) {
                        return remarks.length() <= MAX;
                    }
                }
                """);

        CodeGenerator.Result result = generator.generate(context, plan, item, null, Map.of(), Map.of(), null);

        // no second request: the comments are taken out and the file checked again
        assertThat(prompts).hasSize(1);
        assertThat(result.content()).doesNotContain("prompt").doesNotContain("instructions")
                .contains("    private static final int MAX = 35;\n\n    boolean valid");
        assertThat(result.check().status()).isNotEqualTo(FileChecks.Status.FAILED);
        assertThat(result.check().message()).contains("Removed 2 comment(s) with the model's reasoning.");
        assertThat(CodeGenerator.SYSTEM).contains("Write no comments about the prompt, the instructions or your own reasoning");
    }

    @Test
    void onASmallLimitAFixSendsOnlyTheFileItsRulesAndTheFindings() {
        Map<String, String> examples = Map.of("backend/LimitValidator.java", "public class LimitValidator {\n" + "    // an example line\n".repeat(600) + "}\n");
        replies.add("public class RemarksValidator {\n    void a() { }\n    void a() { }\n}\n");
        replies.add("public class RemarksValidator {\n    void a() { }\n}\n");

        CodeGenerator.Result result = generatorWith(eightThousand()).generate(context, plan, item, null, examples, Map.of(), null);

        assertThat(prompts.get(1)).startsWith("File to correct: backend/RemarksValidator.java (create, service)")
                .contains("You wrote this content:", "is declared twice").doesNotContain("an example line").doesNotContain("The whole change");
        assertThat(result.content()).isEqualTo("public class RemarksValidator {\n    void a() { }\n}\n");
    }

    @Test
    void whenEvenTheFileIsTooLargeOnlyTheMethodsWithFindingsAreSentAndPutBack() {
        StringBuilder large = new StringBuilder("public class RemarksValidator {\n");
        for (int i = 0; i < 40; i++) {
            large.append("    void rule").append(i).append("(String remarks) {\n").append("        remarks.trim();\n".repeat(20)).append("    }\n\n");
        }
        // one method calls a helper never written
        String file = large.toString().replace("    void rule7(String remarks) {\n", "    void rule7(String remarks) {\n        helper(remarks);\n") + "}\n";
        replies.add(file);
        replies.add("    void rule7(String remarks) {\n        remarks.strip();\n    }\n");

        CodeGenerator.Result result = generatorWith(eightThousand()).generate(context, plan, item, null, Map.of(), Map.of(), null);

        assertThat(prompts.get(1)).contains("Write only these methods again", "void rule7(String remarks) {\n        helper(remarks);",
                "Calls helper(...)").doesNotContain("void rule8(String remarks) {\n        remarks.trim();");
        assertThat(prompts.get(1).length()).isLessThan(file.length() / 3);
        assertThat(result.content()).contains("    void rule7(String remarks) {\n        remarks.strip();\n    }")
                .doesNotContain("helper(").contains("void rule39(String remarks)");
        assertThat(result.check().status()).isNotEqualTo(FileChecks.Status.FAILED);
        assertThat(result.check().message()).contains("Corrected only the method(s) with findings: rule7.");
    }

    @Test
    void aWholeAnswerWhoseFixTheLimitStoppedIsKept() {
        String whole = "public class RemarksValidator {\n    void a() { }\n    void a() { }\n}\n";
        replies.add(whole);
        replies.add("LIMIT");

        CodeGenerator.Partial stopped = org.assertj.core.api.Assertions.catchThrowableOfType(CodeGenerator.Partial.class,
                () -> generatorWith(eightThousand()).generate(context, plan, item, null, Map.of(), Map.of(), null));

        assertThat(stopped.content()).isEqualTo(whole);
        assertThat(stopped.check().status()).isEqualTo(FileChecks.Status.FAILED);
        assertThat(stopped.daily()).isTrue();
        // kept whole, it is checked and fixed next time, not continued
        assertThat(CodeGenerator.complete(item.path(), whole)).isTrue();
        prompts.clear();
        replies.add("public class RemarksValidator {\n    void a() { }\n}\n");
        CodeGenerator.Result fixed = generatorWith(eightThousand()).generate(context, plan, item, null, null, Map.of(), Map.of(), null, null, whole);
        assertThat(prompts).singleElement().asString().startsWith("File to correct:");
        assertThat(fixed.content()).isEqualTo("public class RemarksValidator {\n    void a() { }\n}\n");
    }

    @Test
    void aParseErrorInTheModelsOwnPieceGoesToTheFixNotToABadJoin() {
        // QA round 15: the first piece has `a + b = c;` at line 70, well before the seam; the join itself is clean
        StringBuilder first = new StringBuilder("public class RemarksValidator {\n");
        for (int i = 0; first.toString().lines().count() < 64; i++) {
            first.append("    void rule").append(i).append("() {\n        check(").append(i).append(");\n    }\n\n");
        }
        while (first.toString().lines().count() < 68) {
            first.append("\n");
        }
        first.append("    void total(int a, int b, int c) {\n        a + b = c;\n    }\n\n");
        for (int i = 100; first.toString().lines().count() < 110; i++) {
            first.append("    void rule").append(i).append("() {\n        check(").append(i).append(");\n    }\n\n");
        }
        first.append("    void check(int i) {\n");
        assertThat(first.toString().lines().toList().get(69)).isEqualTo("        a + b = c;");
        replies.add("CUT:" + first);
        replies.add("    void check(int i) {\n    }\n}\n");
        // the fix gets the parser's message as the finding
        replies.add(first.toString().replace("a + b = c;", "c = a + b;") + "    }\n}\n");

        CodeGenerator.Result result = generator.generate(context, plan, item, null, Map.of(), Map.of(), null);

        assertThat(prompts.get(2)).contains("It did not pass the checks:", "line 69", "The model's answer does not parse at line 69");
        assertThat(result.content()).contains("c = a + b;").doesNotContain("a + b = c;");
        assertThat(result.check().status()).isNotEqualTo(FileChecks.Status.FAILED);
        // the parser places it on the method's header line, just before the statement
        assertThat(CodeGenerator.errorLine(item.path(), first + "    }\n}\n")).isEqualTo(69);
    }

    @Test
    void onASmallLimitAFileThatDoesNotParseSendsOnlyTheMethodWithTheError() {
        StringBuilder file = new StringBuilder("public class RemarksValidator {\n");
        for (int i = 0; i < 60; i++) {
            file.append("    void rule").append(i).append("(int a, int b, int c) {\n").append("        check(a);\n".repeat(12)).append("    }\n\n");
        }
        String broken = file.toString().replace("    void rule7(int a, int b, int c) {\n", "    void rule7(int a, int b, int c) {\n        a + b = c;\n")
                + "    void check(int i) { }\n}\n";
        replies.add(broken);
        replies.add("    void rule7(int a, int b, int c) {\n        c = a + b;\n    }\n");

        CodeGenerator.Result result = generatorWith(eightThousand()).generate(context, plan, item, null, Map.of(), Map.of(), null);

        assertThat(prompts.get(1)).contains("This method of the file does not parse:", "a + b = c;").doesNotContain("void rule8(");
        assertThat(result.content()).contains("    void rule7(int a, int b, int c) {\n        c = a + b;\n    }").contains("void rule59(");
        assertThat(result.check().message()).contains("Corrected only the method with the parse error");
    }

    @Test
    void aContinuationIsMuchSmallerThanTheFirstPrompt() {
        replies.add("CUT:public class RemarksValidator {\n    void check(String remarks) {\n");
        replies.add("    void check(String remarks) {\n    }\n}\n");
        Map<String, String> examples = Map.of("backend/LimitValidator.java", "public class LimitValidator {\n" + "    // a long example\n".repeat(500) + "}\n");

        generator.generate(context, plan, item, null, examples, Map.of(), null);

        assertThat(prompts.get(1).length()).isLessThan(prompts.get(0).length() / 3);
        assertThat(prompts.get(1)).contains("File being written: backend/RemarksValidator.java", "Purpose: Validate remarks",
                "Requirement specification (excerpt)").doesNotContain("a long example").doesNotContain("The whole change");
    }

    @Test
    void stitchesWithoutRepeatingTextOrLosingAnyOfIt() {
        // the cut line finished as it came
        assertThat(CodeGenerator.stitch("a();\nb(", "x, y);\nc();")).isEqualTo("a();\nb(x, y);\nc();");
        // an exact repeat of the end (at least 20 characters that are not spaces) is written once
        assertThat(CodeGenerator.stitch("a();\n    validateRemarks(remarks);\n", "    validateRemarks(remarks);\n    save();\n"))
                .isEqualTo("a();\n    validateRemarks(remarks);\n    save();\n");
        // a short repeat is real code: closing braces that differ only in indentation are both kept
        assertThat(CodeGenerator.stitch("        }\n", "    }\n}\n")).isEqualTo("        }\n    }\n}\n");
        assertThat(CodeGenerator.stitch("a();\nb();\n", "b();\nc();")).isEqualTo("a();\nb();\nb();\nc();");
        // a continuation that starts with a line break finishes the cut line: JavaScript's closing }); stays
        assertThat(CodeGenerator.stitch("    });", "\n  });\n});\n")).isEqualTo("    });\n  });\n});\n");
    }

    @Test
    void dropsFencesAndProseButNotTheFilesOwnContent() {
        assertThat(CodeGenerator.withoutFences("Here it is:\n```js\nx();\n```")).isEqualTo("x();\n");
        assertThat(CodeGenerator.withoutFences("Continuing from where it stopped:\n\n```java\nx();\n```")).isEqualTo("x();\n");
        // a markdown file's own fence, and code before a fence, are content
        assertThat(CodeGenerator.withoutFences("# Setup\n\n```bash\nmvn verify\n")).isEqualTo("# Setup\n\n```bash\nmvn verify\n");
        assertThat(CodeGenerator.withoutFences("const t = x;\n```")).isEqualTo("const t = x;\n");
    }

    @Test
    void aContinuationThatStartsTheFileAgainIsNotAppended() {
        replies.add("CUT:package com.bank;\n\nimport java.util.List;\n\npublic class RemarksValidator {\n    void check(String remarks) {");
        // the model starts again with another class: asked once more, strictly
        replies.add("package com.bank;\n\nimport java.util.List;\n\npublic class RemarksValidatorV2 {\n}\n");
        replies.add("public class RemarksValidator {\n    void check(String remarks) {\n    }\n}\n");

        CodeGenerator.Result result = generator.generate(context, plan, item, null, Map.of(), Map.of(), null);

        assertThat(result.content()).isEqualTo("package com.bank;\n\nimport java.util.List;\n\npublic class RemarksValidator {\n"
                + "    void check(String remarks) {\n    }\n}\n");
        assertThat(prompts.get(2)).contains("Do NOT start the file again");

        // the whole file again and further is taken as the file
        prompts.clear();
        replies.add("CUT:package com.bank;\n\npublic class RemarksValidator {\n    void check(String remarks) {");
        replies.add("package com.bank;\n\npublic class RemarksValidator {\n    void check(String remarks) {\n    }\n}\n");
        assertThat(generator.generate(context, plan, item, null, Map.of(), Map.of(), null).content())
                .isEqualTo("package com.bank;\n\npublic class RemarksValidator {\n    void check(String remarks) {\n    }\n}\n");
    }

    @Test
    void aMarkdownFileKeepsItsOwnFencesWhenItIsContinued() {
        ChangePlan.Item readme = new ChangePlan.Item("docs/remarks.md", "create", "config", null, List.of(), null);
        replies.add("CUT:# Remarks\n\nRun:\n\n```bash\nmvn verify\n```\n\nThen open the");
        replies.add("```\n\nThen open the page.\n");

        CodeGenerator.Result result = generator.generate(context, new ChangePlan(null, List.of(readme), List.of()), readme, null, Map.of(),
                Map.of(), null);

        assertThat(result.content()).isEqualTo("# Remarks\n\nRun:\n\n```bash\nmvn verify\n```\n\nThen open the page.\n");
    }

    @Test
    void givesOnlyTheSignaturesOfTheFilesThisFileUses() {
        ChangePlan.Item resource = new ChangePlan.Item("backend/si/StandingInstructionResource.java", "create", "service",
                "REST resource calling StandingInstructionService", List.of(), null);
        Map<String, String> earlier = new java.util.LinkedHashMap<>();
        earlier.put("backend/si/StandingInstructionService.java", """
                package com.bank.si;
                public class StandingInstructionService {
                    private final HostAdapter host = new HostAdapter();
                    /** Lists them. */
                    public java.util.List<String> list(String customer) {
                        String a = "body that is long";
                        return java.util.List.of(a);
                    }
                    public enum Frequency { DAILY, MONTHLY }
                }
                """);
        earlier.put("ui/js/viewModels/other.js", "define([], function () {});");
        earlier.put("backend/unrelated/Audit.java", "package x; class Audit {}");

        Map<String, String> related = CodeGenerator.related(resource, earlier, 1);

        assertThat(related).containsOnlyKeys("backend/si/StandingInstructionService.java");
        assertThat(related.get("backend/si/StandingInstructionService.java"))
                .contains("public class StandingInstructionService", "private final HostAdapter host;",
                        "public java.util.List<String> list(String customer);", "public enum Frequency", "DAILY, MONTHLY")
                .doesNotContain("body that is long").doesNotContain("Lists them");
    }

    @Test
    void includesDesignsForUserInterfaceFiles() {
        replies.add("<div></div>");
        ChangePlan.Item ui = new ChangePlan.Item("ui/views/remarks.html", "create", "ui", null, List.of(), null);

        generator.generate(context, new ChangePlan(null, List.of(ui), List.of()), ui, null, Map.of(), Map.of(), null);

        assertThat(prompts.getFirst()).contains("Screen designs (approved)");
    }
}
