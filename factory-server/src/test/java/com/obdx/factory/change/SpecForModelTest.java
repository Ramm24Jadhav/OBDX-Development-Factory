package com.obdx.factory.change;

import com.obdx.factory.requirements.RequirementSpec;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class SpecForModelTest {

    @Test
    void putsRequirementsAndCriteriaFirstAndLeavesOutEmptyValuesAndAnswers() {
        RequirementSpec spec = new RequirementSpec("Fund Transfer", "Transfers to beneficiaries.", List.of(), List.of(), List.of(),
                List.of(), List.of(), List.of(), List.of(), List.of(new RequirementSpec.Decision("Which limit?", "50,000 a day")),
                List.of("Beneficiaries"), List.of(), List.of("Host is available"),
                List.of(new RequirementSpec.FunctionalRequirement("FR-001", "List beneficiaries", "The system shall list them.", null, List.of())),
                List.of(new RequirementSpec.AcceptanceCriterion("AC-001", "Given ... then the list shows", List.of("FR-001"))), List.of());

        String json = ChangeService.specForModel(JsonMapper.shared(), spec);

        assertThat(json).startsWith("{\"title\":\"Fund Transfer\",\"summary\"");
        assertThat(json.indexOf("FR-001")).isLessThan(json.indexOf("AC-001"));
        assertThat(json.indexOf("AC-001")).isLessThan(json.indexOf("Host is available"));
        assertThat(json).doesNotContain("null").doesNotContain("[]").doesNotContain("50,000").doesNotContain("decisions");
    }
}
