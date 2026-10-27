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
        assertThat(merged.businessRules()).extracting(RequirementSpec.BusinessRule::id, RequirementSpec.BusinessRule::description)
                .containsExactly(
                        org.assertj.core.groups.Tuple.tuple("BR-1", "Amount must not exceed the biller limit"),
                        org.assertj.core.groups.Tuple.tuple("BR-2", "Scheduled date must be in the future"));
        assertThat(merged.openQuestions()).hasSize(2);
    }

    @Test
    void emptyListGivesEmptySpec() {
        assertThat(SpecMerger.merge(List.of(), "Title").title()).isEqualTo("Title");
    }
}
