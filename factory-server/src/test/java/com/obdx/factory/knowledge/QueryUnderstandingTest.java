package com.obdx.factory.knowledge;

import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * A question is read before it is searched: identifiers kept exactly, typos and abbreviations, several parts, its kind.
 */
class QueryUnderstandingTest {

    /** The manuals' words, without a database: "beneficiary", "payment", "transfer" and "onboarding" are there. */
    private final QueryUnderstanding understanding = new QueryUnderstanding(null) {
        @Override
        Map<String, Integer> vocabulary() {
            return Map.of("beneficiary", 12, "payment", 40, "payments", 30, "transfer", 25, "onboarding", 9, "management", 50);
        }

        @Override
        boolean anywhere(String word) {
            return vocabulary().containsKey(word);
        }
    };

    @Test
    void identifiersAreFoundAndKeptExactly() {
        assertThat(QueryUnderstanding.identifiers("Why does TransferPaymentService throw DIGX-PY-0042 when digx.payment.timeout is 30?"))
                .containsExactly("TransferPaymentService", "DIGX-PY-0042", "digx.payment.timeout");
        assertThat(QueryUnderstanding.identifiers("What does `max_retry_count` do in config/app.properties?"))
                .contains("max_retry_count", "config/app.properties");
        assertThat(QueryUnderstanding.identifiers("How do I onboard a retail user in OBDX?")).isEmpty();
        assertThat(QueryUnderstanding.identifiers("Explain the step-by-step login")).isEmpty();
    }

    @Test
    void typosAreCorrectedFromTheManualsButIdentifiersNever() {
        QueryUnderstanding.Understood u = understanding.understand("How does a customer add a benficiary for paymnet?");
        assertThat(u.searched()).isEqualTo("How does a customer add a beneficiary for payment?");
        assertThat(u.corrections()).containsEntry("benficiary", "beneficiary").containsEntry("paymnet", "payment");
        // the same misspelling inside an identifier stays as written
        assertThat(understanding.understand("What is digx.paymnet.timeout?").searched()).isEqualTo("What is digx.paymnet.timeout?");
        assertThat(understanding.understand("Where is PaymnetService configured?").searched()).isEqualTo("Where is PaymnetService configured?");
    }

    @Test
    void abbreviationsAreWrittenOut() {
        assertThat(understanding.understand("txn limits for a retail acct").searched()).isEqualTo("transaction limits for a retail account");
        assertThat(understanding.understand("Where is the SSO config?").searched()).isEqualTo("Where is the single sign on configuration?");
    }

    @Test
    void aQuestionWithSeveralPartsIsSplit() {
        assertThat(QueryUnderstanding.parts("Explain the payment flow and how errors are handled"))
                .containsExactly("Explain the payment flow", "how errors are handled");
        assertThat(QueryUnderstanding.parts("What is a payee? How do I delete one in OBDX?"))
                .containsExactly("What is a payee?", "How do I delete one in OBDX?");
        assertThat(QueryUnderstanding.parts("How do I create and approve a user?")).isEmpty();
    }

    @Test
    void theKindOfQuestion() {
        assertThat(QueryUnderstanding.type("Payment flow")).isEqualTo(QueryUnderstanding.Type.CONCEPT);
        assertThat(QueryUnderstanding.type("How login works")).isEqualTo(QueryUnderstanding.Type.ARCHITECTURE);
        assertThat(QueryUnderstanding.type("Add new field")).isEqualTo(QueryUnderstanding.Type.IMPLEMENTATION);
        assertThat(QueryUnderstanding.type("API configuration")).isEqualTo(QueryUnderstanding.Type.API);
        assertThat(QueryUnderstanding.type("Transaction failure")).isEqualTo(QueryUnderstanding.Type.TROUBLESHOOTING);
        assertThat(QueryUnderstanding.type("Where is the configuration?")).isEqualTo(QueryUnderstanding.Type.CONFIGURATION);
        assertThat(QueryUnderstanding.type("Explain integration")).isEqualTo(QueryUnderstanding.Type.INTEGRATION);
        assertThat(QueryUnderstanding.type("Difference between 22.2 and 25.2 user onboarding")).isEqualTo(QueryUnderstanding.Type.COMPARISON);
        assertThat(QueryUnderstanding.type("Give me steps for onboarding a retail user")).isEqualTo(QueryUnderstanding.Type.PROCEDURE);
    }

    @Test
    void distanceStopsPastTheLimit() {
        assertThat(QueryUnderstanding.distance("paymnet", "payment", 1)).isEqualTo(1);
        assertThat(QueryUnderstanding.distance("benficiary", "beneficiary", 2)).isEqualTo(1);
        assertThat(QueryUnderstanding.distance("payee", "transfer", 2)).isEqualTo(3);
    }
}
