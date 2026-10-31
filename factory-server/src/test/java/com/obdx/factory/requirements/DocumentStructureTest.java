package com.obdx.factory.requirements;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * A BRD's own tables and lists are read without a model and kept exactly as written: requirements, rules, criteria,
 * questions, the traceability matrix and the scope lists.
 */
class DocumentStructureTest {

    // As the factory extracts a Word BRD: headings as # lines, tables as | rows
    static final String BRD = """
            # 4. Scope

            ## 4.1 In scope

            View the customer's existing beneficiaries.
            Add a beneficiary using bank-approved beneficiary details.
            ## 4.2 Out of scope

            Corporate banking and bulk payment processing.
            # 8. Functional Requirements

            | ID | Requirement | Business requirement statement | Priority | Precondition / dependency |
            | --- | --- | --- | --- | --- |
            | FR-001 | Beneficiary list | The system shall display beneficiaries available to the authenticated customer. | Must | Customer is authenticated. |
            | FR-002 | Add beneficiary | The system shall allow the customer to submit a new beneficiary using mandatory bank-defined fields. | Must | Rules are configured. |
            | FR-004 | Duplicate detection | The system shall identify a potential duplicate beneficiary. | Should | Matching rules are approved. |

            # 9. Business Rules

            | Rule ID | Rule |
            | --- | --- |
            | BR-001 | Only authenticated customers may access their own beneficiary information. |
            | BR-003 | Transfer amount must be greater than zero and comply with configured minimum and maximum limits. |

            # 12. Non-Functional Requirements

            | ID | Category | Requirement | Acceptance note |
            | --- | --- | --- | --- |
            | NFR-001 | Performance | For 95% of standard beneficiary-list requests, response time should be within 3 seconds. | Target. |

            ## 15.1 Assumptions

            The bank already has an eligible payment processing capability.
            # 16. Acceptance Criteria

            | AC ID | Given / When / Then acceptance criterion |
            | --- | --- |
            | AC-001 | Given an authenticated customer with beneficiaries, when the customer opens the beneficiary list, then only their beneficiaries are displayed. |
            | AC-002 | Given valid mandatory beneficiary details, when the customer submits, then an acknowledgement is displayed. |

            # 17. Open Questions

            | ID | Question | Owner | Status |
            | --- | --- | --- | --- |
            | OQ-001 | Which OBDX version and licensed modules are in the target environment? | Solution Architect | Open |
            | OQ-002 | Which transfer types and currencies are in the first release? | Product Owner | Closed |

            # 18. Requirement Traceability Matrix

            | Requirement ID | Requirement | Acceptance criteria | Design area | Test type |
            | --- | --- | --- | --- | --- |
            | FR-001 | Beneficiary list | AC-001 | UI / beneficiary service | System test |
            | FR-002 | Add beneficiary | AC-002 | Beneficiary service | System test |

            # Appendix A – Sample Test Scenarios

            | Test ID | Scenario | Expected result |
            | --- | --- | --- |
            | TC-001 | Add beneficiary with valid details | Beneficiary is created. |
            """;

    @Test
    void readsTheTablesAndListsOfABrd() {
        DocumentStructure.Structure s = DocumentStructure.read(BRD);

        assertThat(s.scope()).containsExactly("View the customer's existing beneficiaries.", "Add a beneficiary using bank-approved beneficiary details.");
        assertThat(s.outOfScope()).containsExactly("Corporate banking and bulk payment processing.");
        assertThat(s.assumptions()).containsExactly("The bank already has an eligible payment processing capability.");
        assertThat(s.requirements()).extracting(RequirementSpec.FunctionalRequirement::id).containsExactly("FR-001", "FR-002", "FR-004");
        RequirementSpec.FunctionalRequirement first = s.requirements().getFirst();
        assertThat(first.title()).isEqualTo("Beneficiary list");
        assertThat(first.description()).isEqualTo("The system shall display beneficiaries available to the authenticated customer.");
        assertThat(first.priority()).isEqualTo("Must");
        assertThat(s.rules()).extracting(RequirementSpec.BusinessRule::id).containsExactly("BR-001", "BR-003");
        assertThat(s.nonFunctional()).extracting(RequirementSpec.NonFunctional::category).containsExactly("Performance");
        // the traceability matrix links each criterion to the requirement it verifies
        assertThat(s.criteria()).extracting(RequirementSpec.AcceptanceCriterion::id, c -> c.requirements())
                .containsExactly(org.assertj.core.groups.Tuple.tuple("AC-001", List.of("FR-001")), org.assertj.core.groups.Tuple.tuple("AC-002", List.of("FR-002")));
        // closed questions are not asked again; the owner says who answers
        assertThat(s.questions()).extracting(RequirementSpec.OpenQuestion::question)
                .containsExactly("Which OBDX version and licensed modules are in the target environment?");
        assertThat(s.questions().getFirst().reason()).isEqualTo("For Solution Architect to answer.");
        assertThat(s.questions().getFirst().reference()).isEqualTo("OQ-001");
    }

    @Test
    void theDocumentWinsOverTheDraftButKeepsTheScreensTheModelLinked() {
        RequirementSpec drafted = SpecParser.parse("""
                {"title": "Beneficiaries", "screens": [{"name": "Beneficiary List"}],
                 "requirements": [{"id": "FR-001", "title": "List", "description": "Show beneficiaries", "screens": ["Beneficiary List"]},
                   {"id": "FR-9", "description": "Something the model made up"}],
                 "businessRules": [{"id": "BR-1", "description": "Customers see their own beneficiaries", "screens": ["Beneficiary List"]}],
                 "openQuestions": [{"question": "Which OBDX version and licensed modules are used in the target environment?"},
                   {"question": "Which fields are mandatory when adding a beneficiary?"}]}
                """, "x");

        RequirementSpec spec = DocumentStructure.apply(drafted, DocumentStructure.read(BRD));

        // the document's rows in its order, then the model's requirement the document does not have
        assertThat(spec.requirements()).extracting(RequirementSpec.FunctionalRequirement::id).containsExactly("FR-001", "FR-002", "FR-004", "FR-9");
        assertThat(spec.requirements().getFirst().description()).startsWith("The system shall display");
        assertThat(spec.requirements().getFirst().screens()).containsExactly("Beneficiary List");
        // BR-1 is the document's BR-001: its screens are kept, the model's wording is not
        assertThat(spec.businessRules()).extracting(RequirementSpec.BusinessRule::id).containsExactly("BR-001", "BR-003");
        assertThat(spec.businessRules().getFirst().screens()).containsExactly("Beneficiary List");
        // the document's question once, then the model's other question
        assertThat(spec.openQuestions()).extracting(RequirementSpec.OpenQuestion::question).containsExactly(
                "Which OBDX version and licensed modules are in the target environment?", "Which fields are mandatory when adding a beneficiary?");
        assertThat(spec.screens()).hasSize(1);

        // once answered, the document's question does not come back
        RequirementSpec answered = spec.withQuestions(List.of(), List.of(new RequirementSpec.Decision(
                "Which OBDX version and licensed modules are in the target environment?", "25.2")));
        assertThat(DocumentStructure.apply(answered, DocumentStructure.read(BRD)).openQuestions()).isEmpty();
    }

    @Test
    void rulesTheModelDraftedFromTheProseFollowTheDocumentsRows() {
        RequirementSpec drafted = SpecParser.parse("""
                {"title": "Beneficiaries",
                 "businessRules": [{"id": "BR-7", "description": "The transfer amount must be greater than zero and within the configured minimum and maximum limits."},
                   {"id": "BR-010", "description": "A new beneficiary can receive transfers only after a cooling period of 24 hours."}],
                 "acceptanceCriteria": [{"id": "AC-009", "description": "Given a new beneficiary, when the cooling period has not passed, then a transfer is refused."}]}
                """, "x");

        RequirementSpec spec = DocumentStructure.apply(drafted, DocumentStructure.read(BRD));

        // BR-7 says what BR-003 says, so only the document's row is kept; BR-010 is the model's own rule
        assertThat(spec.businessRules()).extracting(RequirementSpec.BusinessRule::id).containsExactly("BR-001", "BR-003", "BR-010");
        assertThat(spec.acceptanceCriteria()).extracting(RequirementSpec.AcceptanceCriterion::id).containsExactly("AC-001", "AC-002", "AC-009");
    }

    @Test
    void aRuleAddedFromAnAnswerSurvivesTheUpdate() {
        // The spec as refined: the document's rows applied before, and a rule the model added from an analyst's answer
        RequirementSpec refined = SpecParser.parse("""
                {"title": "Beneficiaries",
                 "businessRules": [{"id": "BR-001", "description": "Only authenticated customers may access their own beneficiary information.", "screens": ["Beneficiary List"]},
                   {"id": "BR-003", "description": "Transfer amount must be greater than zero and comply with configured minimum and maximum limits."},
                   {"id": "BR-004", "description": "Beneficiary nicknames are at most 35 characters long."}]}
                """, "x");

        RequirementSpec spec = DocumentStructure.apply(refined, DocumentStructure.read(BRD));

        assertThat(spec.businessRules()).extracting(RequirementSpec.BusinessRule::id).containsExactly("BR-001", "BR-003", "BR-004");
        assertThat(spec.businessRules().getFirst().screens()).containsExactly("Beneficiary List");
        // applying it again changes nothing
        assertThat(DocumentStructure.apply(spec, DocumentStructure.read(BRD)).businessRules()).isEqualTo(spec.businessRules());
    }

    @Test
    void aRiskRegisterIsNotReadAsBusinessRules() {
        DocumentStructure.Structure s = DocumentStructure.read("""
                # 14. Risks

                | ID | Description | Mitigation |
                | --- | --- | --- |
                | R-01 | The host may be slow at month end. | Load test before go-live. |
                | R-02 | Users may not find the new menu. | Training. |

                # 9. Rules

                | ID | Rule |
                | --- | --- |
                | R-1 | Only the account holder may add a beneficiary. |
                """);

        assertThat(s.rules()).extracting(RequirementSpec.BusinessRule::id).containsExactly("R-1");
    }

    @Test
    void boldLabelsUnderTheScopeHeadingSeparateItsLists() {
        DocumentStructure.Structure s = DocumentStructure.read("""
                # 4. Scope

                **In scope**
                - View beneficiaries.
                - Add a beneficiary.

                **Out of scope:**
                - Bulk payments.

                # 5. Requirements
                Text.
                """);

        assertThat(s.scope()).containsExactly("View beneficiaries.", "Add a beneficiary.");
        assertThat(s.outOfScope()).containsExactly("Bulk payments.");
    }

    @Test
    void aShortRequestWithoutTablesKeepsTheDraft() {
        RequirementSpec drafted = SpecParser.parse("{\"title\": \"x\", \"businessRules\": [{\"id\": \"BR-1\", \"description\": \"r\"}]}", "x");
        assertThat(DocumentStructure.apply(drafted, DocumentStructure.read("Add a remarks field to the transfer screen."))).isSameAs(drafted);
    }
}
