package com.obdx.factory.change;

import com.obdx.factory.requirements.RequirementSpec;
import com.obdx.factory.requirements.SpecParser;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

/** What QA found in code a real model wrote: names in comments, missing nested types, static calls, imports, APIs. */
class RealModelOutputTest {

    @Test
    void aClassNamedOnlyInACommentOrStringIsNotUsed() {
        String resource = """
                package com.bank.si;
                // Uses SiDTO once the host answers; see "SiDTO" in the design
                class SiResource { String a = "SiDTO"; }
                """;

        assertThat(CrossFileJava.unwrittenClasses("src/com/bank/si/SiResource.java", resource, List.of("src/com/bank/si/SiDTO.java"))).isEmpty();
        assertThat(CrossFileJava.unwrittenClasses("src/com/bank/si/SiResource.java", resource + "class B { SiDTO d; }",
                List.of("src/com/bank/si/SiDTO.java"))).isPresent();
    }

    @Test
    void nestedTypesAndStaticCallsAreCheckedAgainstTheWrittenClass() {
        String response = """
                package com.bank.beneficiary;
                public class BeneficiaryValidationResponse {
                    public enum Result { VALID, INVALID }
                    private Result result;
                    public static BeneficiaryValidationResponse valid() { return new BeneficiaryValidationResponse(); }
                }
                """;
        String service = """
                package com.bank.beneficiary;
                public class BeneficiaryValidationService {
                    public BeneficiaryValidationResponse validate(String account) {
                        if (account == null) {
                            return BeneficiaryValidationResponse.invalid("missing");
                        }
                        BeneficiaryValidationResponse.Status status = BeneficiaryValidationResponse.Status.OK;
                        BeneficiaryValidationResponse.Result result = BeneficiaryValidationResponse.Result.VALID;
                        Object error = new BeneficiaryValidationResponse.ErrorPayload("E01");
                        return BeneficiaryValidationResponse.valid();
                    }
                }
                """;

        List<String> problems = CrossFileJava.missingMethods(service, Map.of("BeneficiaryValidationResponse", response,
                "BeneficiaryValidationService", service));

        assertThat(problems).anySatisfy(p -> assertThat(p).startsWith(CrossFileJava.MISSING_METHODS + " BeneficiaryValidationResponse does not "
                + "have: invalid()"));
        assertThat(problems).anySatisfy(p -> assertThat(p).startsWith(CrossFileJava.MISSING_NESTED + " BeneficiaryValidationResponse does not "
                + "declare: BeneficiaryValidationResponse.Status, BeneficiaryValidationResponse.ErrorPayload"));
        assertThat(problems).noneMatch(p -> p.contains("Result") || p.contains(" valid()"));
    }

    @Test
    void anImportUnderTheBanksRootIsCheckedEvenWithoutItsPackage() {
        assertThat(ChangeService.commonRoot(List.of("com.bank.obdx.payments", "com.bank.obdx.accounts.host", "com.ofss.digx.app.x")))
                .isEqualTo("com.bank.obdx");
        assertThat(ChangeService.commonRoot(List.of("com.bank", "org.other"))).isNull();
        String service = """
                package com.bank.obdx.payments;
                import com.bank.obdx.common.HostIntegrationException;
                import com.bank.obdx.payments.dto.TransferDTO;
                import com.ofss.digx.app.payment.dto.PaymentDTO;
                class TransferService {}
                """;
        Set<String> classes = Set.of("com/bank/obdx/payments/dto/TransferDTO.java");

        // com.bank.obdx.common has no file at all: without the bank's root it was taken for a library
        assertThat(ChangeService.unresolvedImports(service, classes::contains, folder -> false)).isEmpty();
        assertThat(ChangeService.unresolvedImports(service, classes::contains, folder -> false, "com.bank.obdx", folder -> true))
                .containsExactly("com.bank.obdx.common.HostIntegrationException");
    }

    @Test
    void anApiIsServedOnlyByAResourceOrController() {
        RequirementSpec spec = SpecParser.parse("""
                {"title": "x", "apis": [{"name": "POST /payments/beneficiaries/validation", "method": "POST"}]}
                """, "x");
        ChangePlan withoutResource = new ChangePlan("x", List.of(
                new ChangePlan.Item("backend/BeneficiaryValidationService.java", "create", "service", null, List.of(), null),
                new ChangePlan.Item("backend/BeneficiaryValidationValidator.java", "create", "service", null, List.of(), null),
                new ChangePlan.Item("backend/test/BeneficiaryValidationServiceTest.java", "create", "test", null, List.of(), null)), List.of());
        ChangePlan withResource = new ChangePlan("x", List.of(
                new ChangePlan.Item("backend/BeneficiaryValidationResource.java", "create", "service", null, List.of(), null)), List.of());

        assertThat(PlanReview.review(withoutResource, spec, Map.of()).risks())
                .anySatisfy(r -> assertThat(r).startsWith(PlanReview.UNSERVED_API + "POST /payments/beneficiaries/validation"));
        assertThat(PlanReview.review(withResource, spec, Map.of()).risks()).noneMatch(r -> r.startsWith(PlanReview.UNSERVED_API));
    }

    @Test
    void aNewClassNamedLikeAnExistingOneElsewhereIsARisk() {
        ChangePlan plan = new ChangePlan("x", List.of(
                new ChangePlan.Item("backend/com/bank/payments/HostAccountAdapter.java", "create", "integration", null, List.of(), null)), List.of());

        List<String> risks = PlanReview.review(plan, null, Map.of(),
                Map.of("HostAccountAdapter", List.of("backend/com/bank/accounts/HostAccountAdapter.java"))).risks();

        assertThat(risks).singleElement().asString().startsWith(PlanReview.SAME_NAME).contains("accounts/HostAccountAdapter.java");
    }
}
