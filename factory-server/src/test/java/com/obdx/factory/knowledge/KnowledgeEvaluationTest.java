package com.obdx.factory.knowledge;

import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The evaluation questions are well formed, and a hit counts when it is from the expected manual and section.
 */
class KnowledgeEvaluationTest {

    private final KnowledgeEvaluation evaluation = new KnowledgeEvaluation(null, null, JsonMapper.builder().build());

    @Test
    void theQuestionSetCoversTheLibrary() {
        List<KnowledgeEvaluation.Case> cases = evaluation.cases();

        assertThat(cases).hasSizeGreaterThanOrEqualTo(100);
        assertThat(cases).extracting(KnowledgeEvaluation.Case::id).doesNotHaveDuplicates();
        assertThat(cases).filteredOn(c -> !c.isUnsupported()).allSatisfy(c -> assertThat(c.expect()).isNotEmpty());
        assertThat(cases).filteredOn(KnowledgeEvaluation.Case::isUnsupported).allSatisfy(c -> assertThat(c.expect()).isEmpty());
        // Every follow-up comes after the question it follows on from
        for (int i = 0; i < cases.size(); i++) {
            KnowledgeEvaluation.Case c = cases.get(i);
            if (c.isFollowUp()) {
                assertThat(cases.subList(0, i)).anyMatch(earlier -> c.thread().equals(earlier.thread()));
            }
        }
        assertThat(cases).extracting(KnowledgeEvaluation.Case::version).contains("22.2", "25.2");
    }

    @Test
    void ranksTheFirstHitFromTheExpectedManualAndSection() {
        var c = new KnowledgeEvaluation.Case("q", "25.2", "How do I unlock a retail user?", "procedure",
                List.of(new KnowledgeEvaluation.Expected("User Manual Core", "User Management - Search and View")), null, null, null);
        List<KnowledgeSearch.Hit> hits = List.of(hit("User Manual Core", "15.4 Step 3: User Onboarding"),
                hit("User Manual Retail Accounts", "2.2 User Management - Search and View"),
                hit("User Manual Core", "2.2 User Management - Search and View (continued)"));

        assertThat(KnowledgeEvaluation.rankOf(c, hits)).isEqualTo(3);
        assertThat(KnowledgeEvaluation.rankOf(c, hits.subList(0, 2))).isZero();
    }

    private static KnowledgeSearch.Hit hit(String title, String heading) {
        return new KnowledgeSearch.Hit("MANUAL", UUID.randomUUID(), UUID.randomUUID(), title, heading, "25.2", 1, 1, null, "text", 0, false, null);
    }
}
