package com.obdx.factory.requirements;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/** A drafted spec is kept to what the document says. */
class SpecGroundingTest {

    private static final String DOCUMENT = """
            The customer can view transfer history and transaction details. No endpoint, API name or OBDX service name
            is prescribed in this BRD. The beneficiary service creates and deletes beneficiaries.
            """;

    @Test
    void apisTheDocumentDoesNotNameAreDropped() {
        RequirementSpec spec = SpecParser.parse("""
                {"apis": [{"name": "FundTransferService", "method": "POST"}, {"name": "Beneficiary service", "method": "POST"}]}
                """, "x");
        assertThat(SpecGrounding.apply(spec, DOCUMENT).apis()).extracting(RequirementSpec.Api::name).containsExactly("Beneficiary service");
        // an API the analyst named in an answer counts as named
        RequirementSpec decided = spec.withQuestions(List.of(), List.of(new RequirementSpec.Decision("Which service?", "Use FundTransferService")));
        assertThat(SpecGrounding.apply(decided, DOCUMENT).apis()).hasSize(2);
    }

    @Test
    void sameWordsAreOneScreenAndARequiredScreenTheDocumentNamesIsAdded() {
        RequirementSpec spec = SpecParser.parse("""
                {"screens": [{"name": "Review Transfer", "fields": [{"name": "amount"}]},
                             {"name": "Transfer Review screen", "fields": [{"name": "fees"}]}],
                 "requirements": [{"id": "FR-011", "description": "Review before submission", "screens": ["Transfer Review"]},
                   {"id": "FR-016", "title": "Transfer history", "description": "View eligible historical transfers",
                    "screens": ["Transfer History", "Transaction Inquiry"]}]}
                """, "x");

        RequirementSpec grounded = SpecGrounding.apply(spec, DOCUMENT);

        assertThat(grounded.screens()).extracting(RequirementSpec.Screen::name).containsExactly("Review Transfer", "Transfer History");
        assertThat(grounded.screens().getFirst().fields()).extracting(RequirementSpec.Field::name).containsExactly("amount", "fees");
        assertThat(grounded.screens().get(1).reference()).isEqualTo("FR-016");
        // requirements name the screens as the spec does; a screen the document never names is not made up
        assertThat(grounded.requirements().getFirst().screens()).containsExactly("Review Transfer");
        assertThat(grounded.requirements().get(1).screens()).containsExactly("Transfer History", "Transaction Inquiry");
    }
}
