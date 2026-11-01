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
