package com.obdx.factory.knowledge;

import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Improve My Question: the model's reply is used only when it keeps the question's identifiers, brings in no name the
 * question and the sections do not have, and can be read; otherwise the improvement is made without it.
 */
class QueryEnhancementTest {

    private final QueryEnhancementService service = new QueryEnhancementService(null, null, null, null, null, JsonMapper.builder().build());
    private static final List<String> HEADINGS = List.of("User Manual Retail Payments | 4. Manage Payees › 4.1 Add Payee",
            "User Manual Core | 28. Payee Restriction Setup");

    private QueryEnhancementService.Improvement checked(String question, String reply) {
        QueryUnderstanding.Understood u = new QueryUnderstanding.Understood(question, question, QueryUnderstanding.identifiers(question),
                Map.of(), List.of(), QueryUnderstanding.type(question));
        return service.checked(reply, question, u, "22", HEADINGS, List.of());
    }

    @Test
    void aGoodReplyIsUsedWithOnlyTheNamesTheSourcesHave() {
        QueryEnhancementService.Improvement i = checked("add beneficiary", """
                {"status": "READY", "enhancedQuery": "How does a retail user add a payee (beneficiary) in OBDX 22.x: the menu path, the steps and the payee types?",
                 "detectedIntent": "procedure", "detectedModule": "Manage Payees", "technicalEntities": ["Manage Payees", "PayeeRestService"],
                 "assumptions": ["A retail user, not a corporate one."], "suggestedScope": ["4.1 Add Payee", "Fund Transfer Guide"]}""");
        assertThat(i.status()).isEqualTo(QueryEnhancementService.Status.READY);
        assertThat(i.byModel()).isTrue();
        assertThat(i.detectedModule()).isEqualTo("Manage Payees");
        assertThat(i.technicalEntities()).containsExactly("Manage Payees");
        assertThat(i.suggestedScope()).containsExactly("4.1 Add Payee");
        assertThat(i.detectedVersion()).isEqualTo("22.x");
    }

    @Test
    void aClarificationIsAskedOnlyWithAQuestion() {
        QueryEnhancementService.Improvement i = checked("How to configure payment?", """
                {"status": "NEEDS_CLARIFICATION", "enhancedQuery": "", "clarificationQuestions": ["Which payment: domestic transfer, international transfer or bill payment?"]}""");
        assertThat(i.status()).isEqualTo(QueryEnhancementService.Status.NEEDS_CLARIFICATION);
        assertThat(i.clarificationQuestions()).hasSize(1);
        assertThat(i.enhancedQuery()).isEqualTo("How to configure payment?");
        // AMBIGUOUS without a question to ask is treated as ready, and then needs a question
        assertThat(checked("payment", "{\"status\": \"AMBIGUOUS\", \"enhancedQuery\": \"\"}")).isNull();
    }

    @Test
    void identifiersMustSurviveAndNoneBeInvented() {
        assertThat(checked("What does digx.payment.timeout do?",
                "{\"status\": \"READY\", \"enhancedQuery\": \"What does the payment timeout setting do in OBDX 22.x?\"}")).isNull();
        assertThat(checked("payment timeout",
                "{\"status\": \"READY\", \"enhancedQuery\": \"What does digx.payment.timeout do in OBDX 22.x?\"}")).isNull();
        assertThat(checked("What does digx.payment.timeout do?",
                "{\"status\": \"READY\", \"enhancedQuery\": \"What does the setting digx.payment.timeout control in OBDX 22.x, and its values?\"}"))
                .isNotNull();
    }

    @Test
    void aReplyThatIsNotJsonIsNotUsed() {
        assertThat(checked("payment flow", "Sure! Here is a better question: How do payments flow?")).isNull();
        assertThat(checked("payment flow", "[]")).isNull();
        assertThat(checked("payment flow", "{\"status\": \"DONE\", \"enhancedQuery\": \"How are payments processed in OBDX 22.x?\"}").status())
                .isEqualTo(QueryEnhancementService.Status.READY);
    }

    @Test
    void anImprovedQuestionMustSayMoreAndKeepWhatIsAsked() {
        assertThat(checked("How to configure payment in OBDX?", "{\"status\": \"READY\", \"enhancedQuery\": \"payment configuration\"}")).isNull();
        assertThat(checked("How do I add a beneficiary?", "{\"status\": \"READY\", \"enhancedQuery\": \"How does a corporate user approve a pending "
                + "transaction in the approvals queue in OBDX 22.x?\"}")).isNull();
        assertThat(QueryEnhancementService.fuller("payment flow", "How is a payment processed in OBDX 22.x, from initiation to the host?")).isTrue();
        // the kind of question in the factory's words
        assertThat(checked("payment flow", "{\"status\": \"READY\", \"enhancedQuery\": \"How is a payment processed in OBDX 22.x, step by step?\", "
                + "\"detectedIntent\": \"Architecture explanation\"}").detectedIntent()).isEqualTo("architecture");
    }

    @Test
    void aOneWordQuestionAcrossChaptersAsksWhichIsMeant() {
        List<String> spread = List.of("User Manual Core | 7. Electronic Bill Presentment and Payment › 7.1 Biller Onboarding",
                "User Manual Retail Payments | 16. Payment Status Inquiry", "User Manual System Configuration | 5. System Configuration › 5.1.8 Payments");
        QueryEnhancementService.Improvement ready = QueryEnhancementService.fallback("payment",
                new QueryUnderstanding.Understood("payment", "payment", List.of(), Map.of(), List.of(), QueryUnderstanding.Type.CONCEPT), "22", spread);
        QueryEnhancementService.Improvement asked = QueryEnhancementService.ambiguity(ready, spread);
        assertThat(asked.status()).isEqualTo(QueryEnhancementService.Status.AMBIGUOUS);
        assertThat(asked.clarificationQuestions()).containsExactly(
                "Which of these do you mean: Electronic Bill Presentment and Payment, Payment Status Inquiry, System Configuration?");
        // a fuller question, or sections in one chapter, need no clarification
        assertThat(QueryEnhancementService.ambiguity(ready, HEADINGS).status()).isEqualTo(QueryEnhancementService.Status.READY);
    }

    @Test
    void withoutTheModelTheQuestionIsStillImproved() {
        QueryUnderstanding.Understood u = new QueryUnderstanding.Understood("ViewModel", "ViewModel", List.of("ViewModel"), Map.of("paymnet", "payment"),
                List.of(), QueryUnderstanding.Type.IMPLEMENTATION);
        QueryEnhancementService.Improvement i = QueryEnhancementService.fallback("ViewModel", u, "25", HEADINGS);
        assertThat(i.enhancedQuery()).startsWith("ViewModel? In OBDX 25.x, give the prerequisites");
        assertThat(i.byModel()).isFalse();
        assertThat(i.detectedModule()).isEqualTo("Manage Payees");
        assertThat(i.assumptions()).containsExactly("\"paymnet\" read as \"payment\".");
    }
}
