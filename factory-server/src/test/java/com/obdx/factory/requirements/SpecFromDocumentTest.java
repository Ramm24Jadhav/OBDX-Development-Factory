package com.obdx.factory.requirements;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** An API the document names is kept even when the model dropped it; a body that is no spec is refused. */
class SpecFromDocumentTest {

    @Test
    void anApiTheDocumentNamesIsAddedWhenTheDraftLeftItOut() {
        // BRD4 FR-001
        String document = """
                # 8. Functional Requirements
                | ID | Requirement |
                | --- | --- |
                | FR-001 | The service validates a beneficiary account: POST /payments/beneficiaries/validation returns the name and status. |
                | FR-002 | GET /payments/beneficiaries/{beneficiaryId} reads one beneficiary. |
                """;
        RequirementSpec drafted = SpecParser.parse("""
                {"title": "Beneficiary validation", "apis": [{"name": "/payments/beneficiaries/{beneficiaryId}", "method": "GET"}]}
                """, "x");

        RequirementSpec grounded = SpecGrounding.apply(drafted, document);

        assertThat(grounded.apis()).extracting(RequirementSpec.Api::name)
                .containsExactly("/payments/beneficiaries/{beneficiaryId}", "POST /payments/beneficiaries/validation");
        assertThat(grounded.apis().get(1).method()).isEqualTo("POST");
        assertThat(grounded.apis().get(1).description()).isEqualTo("Named in the document (FR-001)");
    }

    @Test
    void examplesExistingServicesAndOutOfScopeLinesNameNoApi() {
        String document = """
                # 8. Functional Requirements
                FR-001: POST /payments/beneficiaries/validation validates the account.
                FR-002: Reuse the existing GET /payments/beneficiaries list.
                FR-003: Paths follow the bank's style, e.g. GET /payments/{id}.
                # 4.2 Out of scope
                DELETE /payments/beneficiaries/{id} is not part of this change.
                # Appendix A - Examples
                PUT /payments/beneficiaries/{id}
                """;

        assertThat(SpecGrounding.namedApis(document)).extracting(RequirementSpec.Api::name)
                .containsExactly("POST /payments/beneficiaries/validation");
    }

    @Test
    void anApiIsTheSameWhetherItsPathIsInItsNameOrDescription() {
        RequirementSpec drafted = SpecParser.parse("""
                {"title": "x", "apis": [{"name": "Validate beneficiary", "method": "POST",
                  "description": "POST /payments/beneficiaries/validation checks the account"}]}
                """, "x");
        String document = "FR-001: POST /payments/beneficiaries/validation validates the beneficiary account.";

        assertThat(SpecGrounding.apply(drafted, document).apis()).extracting(RequirementSpec.Api::name).containsExactly("Validate beneficiary");
        assertThat(SpecMerger.apiKey(drafted.apis().getFirst())).isEqualTo("POST /payments/beneficiaries/validation");
        // updating with answers adds no API the document names: one the analyst removed stays removed
        RequirementSpec removed = SpecParser.parse("{\"title\": \"x\", \"screens\": [{\"name\": \"A\"}]}", "x");
        assertThat(SpecGrounding.apply(removed, document, false).apis()).isEmpty();
        assertThat(SpecGrounding.apply(removed, document, true).apis()).hasSize(1);
    }

    @Test
    void aBodyThatIsNoSpecIsRefusedAndAWrappedOneIsRead() {
        assertThatThrownBy(() -> SpecParser.parse("{\"spek\": {\"x\": 1}}", "x")).isInstanceOf(SpecParser.InvalidSpecException.class)
                .hasMessage("The spec has none of its fields (title, requirements, screens…). Send the spec itself.");
        RequirementSpec wrapped = SpecParser.parse("{\"spec\": {\"title\": \"Limits\", \"screens\": [{\"name\": \"Limits\"}]}}", "x");
        assertThat(wrapped.title()).isEqualTo("Limits");
        assertThat(wrapped.screens()).hasSize(1);
        assertThat(RequirementService.empty(SpecParser.parse("{\"title\": \"Only a title\"}", "x"))).isTrue();
        assertThat(RequirementService.empty(wrapped)).isFalse();
    }
}
