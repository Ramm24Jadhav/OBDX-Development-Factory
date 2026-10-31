package com.obdx.factory.requirements;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class SpecMergerTest {

    @Test
    void mergesSectionsOfOneDocument() {
        RequirementSpec first = SpecParser.parse("""
                {"title": "Bill payments", "summary": "Pay utility bills.",
                 "screens": [{"name": "Bill Payment", "changeType": "unknown",
                   "fields": [{"name": "billerId", "type": "dropdown"}, {"name": "amount", "mandatory": true}]}],
                 "businessRules": [{"id": "R7", "description": "Amount must not exceed the biller limit"}],
                 "openQuestions": [{"question": "Which billers are supported?"}]}
                """, "x");
        RequirementSpec second = SpecParser.parse("""
                {"summary": "Supports scheduled payments.",
                 "screens": [{"name": "bill payment", "changeType": "enhance",
                   "fields": [{"name": "Amount", "type": "amount", "validations": ["greater than 0"]}, {"name": "payDate", "type": "date"}]},
                   {"name": "Payment Confirmation", "changeType": "new"}],
                 "businessRules": [{"description": "Amount must not exceed the biller limit"}, {"description": "Scheduled date must be in the future"}],
                 "openQuestions": [{"question": "Which billers are supported?"}, {"question": "Can a payment be cancelled?"}]}
                """, "x");

        RequirementSpec merged = SpecMerger.merge(List.of(first, second), "x");

        assertThat(merged.title()).isEqualTo("Bill payments");
        assertThat(merged.summary()).isEqualTo("Pay utility bills. Supports scheduled payments.");
        assertThat(merged.screens()).extracting(RequirementSpec.Screen::name).containsExactly("Bill Payment", "Payment Confirmation");
        RequirementSpec.Screen billPayment = merged.screens().getFirst();
        assertThat(billPayment.changeType()).isEqualTo("enhance");
        assertThat(billPayment.fields()).extracting(RequirementSpec.Field::name).containsExactly("billerId", "amount", "payDate");
        RequirementSpec.Field amount = billPayment.fields().get(1);
        assertThat(amount.mandatory()).isTrue();
        assertThat(amount.type()).isEqualTo("amount");
        assertThat(amount.validations()).containsExactly("greater than 0");
        // The document's own rule ID stays (traceability); a rule without one is numbered after it, the same way
        assertThat(merged.businessRules()).extracting(RequirementSpec.BusinessRule::id, RequirementSpec.BusinessRule::description)
                .containsExactly(
                        org.assertj.core.groups.Tuple.tuple("R7", "Amount must not exceed the biller limit"),
                        org.assertj.core.groups.Tuple.tuple("R8", "Scheduled date must be in the future"));
        assertThat(merged.openQuestions()).hasSize(2);
    }

    @Test
    void emptyListGivesEmptySpec() {
        assertThat(SpecMerger.merge(List.of(), "Title").title()).isEqualTo("Title");
    }

    @Test
    void theDocumentsRequirementsCriteriaAndIdsAreKept() {
        RequirementSpec first = SpecParser.parse("""
                {"title": "Beneficiaries", "scope": ["View beneficiaries", "Add a beneficiary"], "outOfScope": "Corporate banking",
                 "requirements": [{"id": "FR-001", "title": "Beneficiary list", "description": "Show the beneficiaries", "priority": "Must",
                   "screens": ["Beneficiary List"]}],
                 "acceptanceCriteria": [{"id": "AC-001", "description": "Given a customer, when the list opens, then only their beneficiaries show",
                   "requirements": "FR-001"}],
                 "businessRules": [{"id": "BR-009", "description": "Deletion is restricted while a transfer is pending"},
                   {"id": "BR-010", "description": "No other customer's data is shown"}]}
                """, "x");
        RequirementSpec second = SpecParser.parse("""
                {"requirements": [{"id": "FR-001", "screens": ["Beneficiary List", "Beneficiary Details"]},
                   {"id": "FR-002", "title": "Add beneficiary", "description": "Submit a new beneficiary", "priority": "Must"}],
                 "nonFunctional": [{"id": "NFR-001", "category": "Performance", "description": "List within 3 seconds"}],
                 "assumptions": [{"description": "Payment processing exists"}],
                 "businessRules": [{"description": "Amounts are positive"}]}
                """, "x");

        RequirementSpec merged = SpecMerger.merge(List.of(first, second), "x");

        assertThat(merged.scope()).containsExactly("View beneficiaries", "Add a beneficiary");
        assertThat(merged.outOfScope()).containsExactly("Corporate banking");
        assertThat(merged.assumptions()).containsExactly("Payment processing exists");
        assertThat(merged.requirements()).extracting(RequirementSpec.FunctionalRequirement::id).containsExactly("FR-001", "FR-002");
        assertThat(merged.requirements().getFirst().screens()).containsExactly("Beneficiary List", "Beneficiary Details");
        assertThat(merged.requirements().getFirst().priority()).isEqualTo("Must");
        assertThat(merged.acceptanceCriteria().getFirst().requirements()).containsExactly("FR-001");
        assertThat(merged.nonFunctional()).extracting(RequirementSpec.NonFunctional::category).containsExactly("Performance");
        assertThat(merged.businessRules()).extracting(RequirementSpec.BusinessRule::id).containsExactly("BR-009", "BR-010", "BR-011");
    }
}
