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

    @Test
    void aFileCutOffAtTheOutputLimitIsContinuedAndJoined() {
        // A server that writes little per answer (a per-minute output limit): the file comes in pieces
        replies.add("CUT:```java\npublic class RemarksValidator {\n    void check(String remarks) {");
        replies.add("CUT:    void check(String remarks) {\n        if (remarks.length() > 35) {\n");
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
        assertThat(prompts.get(1)).contains("Continue exactly where it stopped", "void check(String remarks) {");
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
        replies.add("\n    }\n}\n");

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
        replies.add(" page.\n");

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
