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

class CodeGeneratorTest {

    private final Deque<String> replies = new ArrayDeque<>();
    private final List<String> prompts = new ArrayList<>();
    private final ModelGateway model = new ModelGateway() {
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
    };
    private final CodeGenerator generator = new CodeGenerator(model, new ChangeProperties(30, 25, DataSize.ofKilobytes(80), 2, "branches/factory"));

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
        assertThat(prompts.get(1)).contains("It did not pass a check: Java does not parse");
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
    void includesDesignsForUserInterfaceFiles() {
        replies.add("<div></div>");
        ChangePlan.Item ui = new ChangePlan.Item("ui/views/remarks.html", "create", "ui", null, List.of(), null);

        generator.generate(context, new ChangePlan(null, List.of(ui), List.of()), ui, null, Map.of(), Map.of(), null);

        assertThat(prompts.getFirst()).contains("Screen designs (approved)");
    }
}
