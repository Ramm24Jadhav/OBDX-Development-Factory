package com.obdx.factory.requirements;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Regression audit C9 and A7: duplicate requirement IDs in a stored spec are flagged (the spec is not changed), and a
 * refusal because of the requirement's status says what to do.
 */
class SpecWarningsTest {

    private static RequirementSpec spec(List<RequirementSpec.FunctionalRequirement> requirements, List<RequirementSpec.AcceptanceCriterion> criteria) {
        return new RequirementSpec("t", "s", List.of(), List.of(), List.of(), List.of(), List.of(), List.of(), List.of(), List.of(),
                List.of(), List.of(), List.of(), requirements, criteria, List.of());
    }

    @Test
    void duplicateIdsFromTraceabilityRowsAreFlagged() {
        RequirementSpec spec = spec(List.of(new RequirementSpec.FunctionalRequirement("FR-001", "Chips", null, "Must", List.of()),
                        new RequirementSpec.FunctionalRequirement("FR-001", "AC-001", null, null, List.of()),
                        new RequirementSpec.FunctionalRequirement(" FR-001 ", "AC-002", null, null, List.of()),
                        new RequirementSpec.FunctionalRequirement("FR-002", "Balance", null, "Must", List.of())),
                List.of(new RequirementSpec.AcceptanceCriterion("AC-001", "a", List.of()), new RequirementSpec.AcceptanceCriterion("AC-001", "b", List.of())));
        List<String> warnings = RequirementService.warnings(spec);
        assertThat(warnings).hasSize(2);
        assertThat(warnings.get(0)).startsWith("Duplicate requirement IDs: FR-001 (3 times).").contains("traceability table");
        assertThat(warnings.get(1)).startsWith("Duplicate acceptance criterion IDs: AC-001 (2 times).");
        // the spec itself is not changed
        assertThat(spec.requirements()).hasSize(4);
    }

    @Test
    void distinctOrMissingIdsAreFine() {
        RequirementSpec spec = spec(List.of(new RequirementSpec.FunctionalRequirement("FR-001", "a", null, null, List.of()),
                new RequirementSpec.FunctionalRequirement(null, "b", null, null, List.of()),
                new RequirementSpec.FunctionalRequirement(null, "c", null, null, List.of())), List.of());
        assertThat(RequirementService.warnings(spec)).isEmpty();
        assertThat(RequirementService.warnings(null)).isEmpty();
    }

    @Test
    void anApprovedSpecSaysHowToChangeIt() {
        assertThat(RequirementService.notInStatus(Requirement.Status.APPROVED, Requirement.Status.READY))
                .startsWith("The spec is approved, so it cannot be changed. To change it, add the requirement again");
        assertThat(RequirementService.notInStatus(Requirement.Status.PROCESSING, Requirement.Status.READY)).contains("Wait for the draft");
        assertThat(RequirementService.notInStatus(Requirement.Status.FAILED, Requirement.Status.READY)).contains("Draft again");
        assertThat(RequirementService.notInStatus(Requirement.Status.READY, Requirement.Status.APPROVED))
                .isEqualTo("The requirement is ready; this needs it to be approved");
    }
}
