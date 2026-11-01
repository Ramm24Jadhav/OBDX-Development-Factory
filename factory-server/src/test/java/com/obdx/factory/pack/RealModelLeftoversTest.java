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
                "// The fee table is not defined in the prompt, so it is empty.", "// As per instruction, amounts are in minor units.",
                "// Only codes in the provided list are accepted.", "// Assuming the host returns the account as active.",
                "/* Assuming standard OBDX error codes */", "// We model the behavior of the host here.",
                "// Since we don't have the adapter, the call is skipped.")) {
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
        assertThat(rules(found)).containsOnly(ModelReasoning.STUB_RULE).hasSize(3);
        assertThat(found.getFirst().message()).contains("Placeholder logic");
        assertThat(ModelReasoning.findings("backend/src/com/bank/beneficiary/BeneficiaryValidationServiceTest.java", null, java)).isEmpty();
        assertThat(ModelReasoning.findings("backend/test/com/bank/MockData.java", null, "// mock response for the host\nclass M {}\n")).isEmpty();
        assertThat(rules(ModelReasoning.findings("backend/src/com/bank/Host.java", null, "class Host { // mock data until the host is ready\n}\n")))
                .containsExactly(ModelReasoning.STUB_RULE);
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
