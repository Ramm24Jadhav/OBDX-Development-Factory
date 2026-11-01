package com.obdx.factory.pack;

import com.obdx.factory.change.FileChecks;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

/** Lines a real model left in generated Java: its reasoning, stubs, sample data, and the caller taken from a header. */
class RealModelLeftoversTest {

    private final LocalChecks checks = new LocalChecks(VersionPacks.builtIn());
    private final CheckScope v22 = new CheckScope("22.x", Map.of(), Set.of());

    private static List<String> rules(List<LocalChecks.Finding> findings) {
        return findings.stream().map(LocalChecks.Finding::ruleId).toList();
    }

    @Test
    void itsReasoningFailsTheFile() {
        for (String line : List.of("// For this exercise the limit is fixed.", "// In this isolated artifact we keep the rules here.",
                "// The fee table is not defined in the prompt, so it is empty.", "// As per the instructions, amounts are in minor units.",
                "// Assuming the host returns the account as active.",
                "/* Assuming standard OBDX error codes */", "// We model the behavior of the host here.",
                "// Since we don't have the adapter, the call is skipped.",
                "// No specific error code defined for Name Format in the provided list",
                "// Using a general error message as per instruction \"never exception text\"")) {
            String java = "package com.bank.si;\nclass A {\n    " + line + "\n    void a() {}\n}\n";
            assertThat(rules(ModelReasoning.findings("backend/src/com/bank/si/A.java", null, java))).as(line).containsExactly(ModelReasoning.RULE);
        }
        // a developer's assumption in the middle of a sentence is fine
        assertThat(ModelReasoning.findings("A.java", null, "class A {\n    // the rate is cached, assuming the host is up\n}\n")).isEmpty();
    }

    @Test
    void stubsFailTheBanksCodeButNotItsTests() {
        String java = """
                package com.bank.beneficiary;
                class BeneficiaryValidationService {
                    // Placeholder logic until the host adapter exists
                    String validate(String account) {
                        // Simulated host call
                        // In a real implementation this would call the host
                        // TODO: call the host adapter
                        return "JOHN SMITH";
                    }
                }
                """;

        List<LocalChecks.Finding> found = ModelReasoning.findings("backend/src/com/bank/beneficiary/BeneficiaryValidationService.java", null, java);
        // at most 3 of a rule, and the sample name still reported (as a warning) beside them
        assertThat(rules(found)).containsExactly(ModelReasoning.STUB_RULE, ModelReasoning.STUB_RULE, ModelReasoning.STUB_RULE,
                ModelReasoning.SAMPLE_RULE);
        assertThat(found.getLast().severity()).isEqualTo(PackRule.Severity.WARNING);
        assertThat(found.getFirst().message()).contains("Placeholder logic");
        assertThat(ModelReasoning.findings("backend/src/com/bank/beneficiary/BeneficiaryValidationServiceTest.java", null, java)).isEmpty();
        assertThat(ModelReasoning.findings("backend/test/com/bank/MockData.java", null, "// mock response for the host\nclass M {}\n")).isEmpty();
        assertThat(rules(ModelReasoning.findings("backend/src/com/bank/Host.java", null, "class Host { // mock data until the host is ready\n}\n")))
                .containsExactly(ModelReasoning.STUB_RULE);
    }

    @Test
    void manyReasoningLinesDoNotHideTheStubs() {
        // HostAccountAdapter, as the real model wrote it
        String java = """
                package com.bank.accounts;
                class HostAccountAdapter {
                    // For this exercise the host is not called.
                    // In this isolated artifact the account is fixed.
                    // Since we don't have the host, we model the behavior.
                    // We model the behavior of the host here.
                    // Placeholder logic until the host adapter exists
                    // Simulate the host response
                    String name() { return "JOHN SMITH"; }
                }
                """;

        List<String> found = rules(ModelReasoning.findings("backend/src/com/bank/accounts/HostAccountAdapter.java", null, java));

        assertThat(found).containsExactly(ModelReasoning.RULE, ModelReasoning.RULE, ModelReasoning.RULE, ModelReasoning.STUB_RULE,
                ModelReasoning.STUB_RULE, ModelReasoning.SAMPLE_RULE);
    }

    @Test
    void aDevelopersOwnWordsAreNotReasoningOrStubs() {
        for (String line : List.of("// Simulate the maturity amount for the selected tenure", "// Debit as per instruction frequency",
                "// Only codes in the provided list are accepted.", "// Returns null when no code is in the provided list.",
                "/** The codes defined in the provided list, in order. */", "// Debit as per instruction: frequency of the plan",
                "// Assuming the response has no items, show the empty state.")) {
            String java = "package com.bank.td;\nclass A {\n    " + line + "\n    void a() {}\n}\n";
            assertThat(ModelReasoning.findings("backend/src/com/bank/td/A.java", null, java)).as(line).isEmpty();
        }
        // a placeholder shows a sample name on purpose; nls bundles, mocks and stories are not checked for it
        assertThat(ModelReasoning.findings("ui/js/viewModels/a.js", null, "self.input = { placeholder: 'John Smith' };\n")).isEmpty();
        assertThat(ModelReasoning.findings("ui/resources/nls/payee.js", null, "define({ root: { example: 'Jane Doe' } });\n")).isEmpty();
        assertThat(ModelReasoning.findings("src/__mocks__/host.js", null, "// mock response\nconst n = 'John Smith';\n")).isEmpty();
        assertThat(ModelReasoning.findings("src/Payee.stories.tsx", null, "// Simulated response\nconst n = 'John Smith';\n")).isEmpty();
        // and the model's own words are still found
        assertThat(rules(ModelReasoning.findings("A.java", null, "class A {\n    // As per the prompt, the limit is 5.\n}\n")))
                .containsExactly(ModelReasoning.RULE);
        assertThat(rules(ModelReasoning.findings("A.java", null, "class A {\n    // As per your instructions the field is optional.\n}\n")))
                .containsExactly(ModelReasoning.RULE);
    }

    @Test
    void theCallerComesFromTheAuthenticatedUserNotAHeader() {
        String java = """
                package com.bank.beneficiary;
                import javax.ws.rs.*;
                import javax.ws.rs.core.Response;
                public class AuditService {
                    public void record(@HeaderParam("X-Caller-Id") String caller) { }
                    public void other(javax.servlet.http.HttpServletRequest request) { String user = request.getHeader("x-user-id"); }
                }
                """;

        FileChecks.Result result = checks.check(v22, "backend/src/com/bank/beneficiary/AuditService.java", null, java);

        assertThat(result.message()).contains("Line 5 (java-user-from-header, warning)", "Line 6 (java-user-from-header, warning)");
        assertThat(checks.check(v22, "backend/src/com/bank/A.java", null, "package com.bank;\nclass A { String x(javax.servlet.http.HttpServletRequest r) "
                + "{ return r.getHeader(\"Accept-Language\"); } }\n").message()).isNull();
    }
}
