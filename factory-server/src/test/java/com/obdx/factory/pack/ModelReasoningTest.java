package com.obdx.factory.pack;

import com.obdx.factory.change.FileChecks;
import org.junit.jupiter.api.Test;

import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

/** The model's own reasoning left in a file fails it, so it is written again; a developer's words do not. */
class ModelReasoningTest {

    private final LocalChecks checks = new LocalChecks(VersionPacks.builtIn());
    private final CheckScope v22 = new CheckScope("22.x", Map.of(), Set.of());

    @Test
    void reasoningInCommentsOrStringsFailsTheFile() {
        String java = """
                package com.bank.si;

                class SiService {
                    // Let's assume the host's list is sorted by the customer's date.
                    String read() {
                        return "As an AI I cannot know the host";
                    }
                }
                """;

        FileChecks.Result result = checks.check(v22, "backend/src/com/bank/si/SiService.java", null, java);

        assertThat(result.status()).isEqualTo(FileChecks.Status.FAILED);
        assertThat(result.message()).contains("Line 4 (no-model-reasoning, error)", "Line 6 (no-model-reasoning, error)", "Let's assume");
    }

    @Test
    void aDevelopersWordsLabelsAndTheBanksOwnCommentsAreNotReasoning() {
        String nls = "define({ root: { verify: 'We need to verify your identity', later: 'I will pay later' } });\n";
        assertThat(ModelReasoning.findings("ui/resources/nls/si.js", null, nls)).isEmpty();
        assertThat(ModelReasoning.findings("A.java", null, "class A {\n  // we need to refresh the cache; I will add paging later\n}\n")).isEmpty();

        String original = "class A {\n  // In this response the old code\n  void a() {}\n}\n";
        String changed = original.replace("void a() {}", "void a() {}\n  void b() {}");
        assertThat(ModelReasoning.findings("A.java", original, changed)).isEmpty();
        assertThat(ModelReasoning.findings("A.java", null, original)).singleElement()
                .satisfies(f -> assertThat(f.message()).contains("In this response"));
    }

    @Test
    void urlsAndCommentMarksInStringsAreNotComments() {
        String js = "define([], function () {\n  const url = 'https://bank.example/help // let us assume';\n  return url;\n});\n";
        // "let us assume" in a string is not a comment
        assertThat(ModelReasoning.findings("vm.js", null, js)).isEmpty();
        assertThat(ModelReasoning.findings("vm.js", null, "const a = 1; // see http://x.example, let's assume it works\n"))
                .singleElement().satisfies(f -> assertThat(f.line()).isEqualTo(1));
    }

    @Test
    void inHtmlOnlyCommentsCount() {
        assertThat(ModelReasoning.findings("v.html", null, "<p>Let's assume nothing: read the terms.</p>\n")).isEmpty();
        assertThat(ModelReasoning.findings("v.html", null, "<div>\n<!-- The prompt says to add a field -->\n</div>\n"))
                .singleElement().satisfies(f -> assertThat(f.line()).isEqualTo(2));
    }
}
