package com.obdx.factory.change;

import com.obdx.factory.requirements.RequirementSpec;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/** Requirement coverage comes from what the written files name: tests for criteria, code for requirements. */
class ChangeCoverageTest {

    private static ChangeFileStore.ChangeFile file(String path, String layer, ChangeFileStore.Status status, String content) {
        return new ChangeFileStore.ChangeFile(0, path, "create", layer, null, status, null, content, false, null, null, 1, null, false);
    }

    private static final RequirementSpec SPEC = new RequirementSpec("Beneficiaries", null, List.of(), List.of(), List.of(), List.of(), List.of(),
            List.of(), List.of(), List.of(), List.of(), List.of(), List.of(),
            List.of(new RequirementSpec.FunctionalRequirement("FR-001", "Check the beneficiary", null, "Must", List.of()),
                    new RequirementSpec.FunctionalRequirement("FR-002", "Validate the IFSC", null, "Must", List.of())),
            List.of(new RequirementSpec.AcceptanceCriterion("AC-001", "A wrong IFSC stops the transfer", List.of("FR-002")),
                    new RequirementSpec.AcceptanceCriterion("AC-002", "The name is shown", List.of("FR-001")),
                    new RequirementSpec.AcceptanceCriterion("AC-003", "Existing payees are checked again", List.of("FR-001")),
                    new RequirementSpec.AcceptanceCriterion(null, "No ID, not traceable", List.of())),
            List.of());

    @Test
    void criteriaNamedInTestsAreCoveredAndOthersAreNot() {
        ChangeCoverage.Coverage coverage = ChangeCoverage.of(SPEC, List.of(
                file("backend/test/com/bank/BeneficiaryValidatorTest.java", "test", ChangeFileStore.Status.GENERATED, "// AC-001: wrong IFSC\nvoid ac001() {}"),
                file("ui/js/viewModels/transfer.js", "ui", ChangeFileStore.Status.GENERATED, "// FR-001 and AC-002: show the name"),
                file("backend/src/com/bank/BeneficiaryValidator.java", "service", ChangeFileStore.Status.GENERATED, "/** FR-002 (not FR-0021) */"),
                // A file the model's limit cut off counts as not written, whatever its part says
                file("backend/src/com/bank/Payees.java", "service", ChangeFileStore.Status.FAILED, "// AC-003")));

        assertThat(coverage.hasSpec()).isTrue();
        assertThat(coverage.written()).isEqualTo(3);
        assertThat(coverage.planned()).isEqualTo(4);
        assertThat(coverage.criteria()).extracting(ChangeCoverage.Item::id).containsExactly("AC-001", "AC-002", "AC-003");
        assertThat(coverage.criteria().get(0).tests()).containsExactly("backend/test/com/bank/BeneficiaryValidatorTest.java");
        assertThat(coverage.criteria().get(1).tests()).isEmpty();
        assertThat(coverage.criteria().get(1).code()).containsExactly("ui/js/viewModels/transfer.js");
        assertThat(coverage.criteria().get(2).tests()).isEmpty();
        assertThat(coverage.criteria().get(2).code()).isEmpty();
        assertThat(coverage.requirements().get(0).code()).containsExactly("ui/js/viewModels/transfer.js");
        assertThat(coverage.requirements().get(1).code()).containsExactly("backend/src/com/bank/BeneficiaryValidator.java");
    }

    @Test
    void withoutASpecNothingIsTraced() {
        ChangeCoverage.Coverage coverage = ChangeCoverage.of(null, List.of(file("a/B.java", "service", ChangeFileStore.Status.PENDING, null)));
        assertThat(coverage.hasSpec()).isFalse();
        assertThat(coverage.written()).isZero();
        assertThat(coverage.criteria()).isEmpty();
    }

    @Test
    void testFilesAreKnownByLayerOrName() {
        assertThat(ChangeCoverage.isTest(file("ui/js/specs/transferSpec.js", "ui", ChangeFileStore.Status.GENERATED, ""))).isTrue();
        assertThat(ChangeCoverage.isTest(file("src/payments/Transfer.java", "service", ChangeFileStore.Status.GENERATED, ""))).isFalse();
    }
}
