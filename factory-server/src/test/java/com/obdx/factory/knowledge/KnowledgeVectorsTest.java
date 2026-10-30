package com.obdx.factory.knowledge;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

/** Reading embeddings in pgvector's text form for the in-memory search of the trial database, and mixing sources. */
class KnowledgeVectorsTest {

    @Test
    void readsPgvectorTextForm() {
        assertThat(KnowledgeVectors.parse("[0.5,-1.25, 3E-5]")).containsExactly(0.5f, -1.25f, 3e-5f);
        assertThat(KnowledgeVectors.parse("")).isEmpty();
        assertThat(KnowledgeVectors.parse(null)).isEmpty();
        assertThat(KnowledgeVectors.parse("1,2")).isEmpty();
    }

    @Test
    void scalesToLengthOneSoTheDotProductIsTheCosine() {
        float[] v = KnowledgeVectors.normalized(new float[]{3, 4});
        assertThat(v[0]).isCloseTo(0.6f, within(1e-6f));
        assertThat(v[1]).isCloseTo(0.8f, within(1e-6f));
        assertThat(KnowledgeVectors.normalized(new float[]{0, 0})).containsExactly(0f, 0f);
    }

    @Test
    void keepsAtMostTwoSectionsOfOneDocumentSoOtherGuidesGetIn() {
        UUID manual = UUID.randomUUID();
        UUID guide = UUID.randomUUID();
        List<KnowledgeSearch.Hit> hits = List.of(hit(manual, 1), hit(manual, 2), hit(manual, 3), hit(null, 0), hit(guide, 4), hit(manual, 5));
        assertThat(KnowledgeSearch.fewPerDocument(hits, 4)).extracting(KnowledgeSearch.Hit::pageFrom).containsExactly(1, 2, 0, 4);
    }

    @Test
    void aShortListSpreadsOverTheManualsThenTakesTheBestOfTheRest() {
        UUID manual = UUID.randomUUID();
        UUID guide = UUID.randomUUID();
        // The user manual matches best, many times over; the guide comes last
        List<KnowledgeSearch.Hit> hits = List.of(hit(manual, 1), hit(manual, 2), hit(manual, 3), hit(manual, 4), hit(manual, 5), hit(guide, 9));

        assertThat(KnowledgeSearch.spread(hits, 4)).extracting(KnowledgeSearch.Hit::pageFrom).containsExactly(1, 9, 2, 3);
    }

    @Test
    void theMeaningSearchGetsWhatIsAskedWithoutTheProductsName() {
        assertThat(KnowledgeSearch.forMeaning("How do I onboard a retail customer in OBDX?")).isEqualTo("onboard retail customer");
        assertThat(KnowledgeSearch.forMeaning("Explain Oracle Banking Digital Experience service extensions")).isEqualTo("service extensions");
        assertThat(KnowledgeSearch.forMeaning("how do I")).isEqualTo("how do I");
    }

    @Test
    void aRetailQuestionCountsCorporateOnlySectionsHalf() {
        UUID manual = UUID.randomUUID();
        List<KnowledgeSearch.Hit> hits = List.of(scored(manual, "15 Group Corporate Onboarding", 0.04), scored(manual, "2.1 User Management - Create", 0.03),
                scored(manual, "66.3 User Groups - Retail & Business User", 0.025));

        assertThat(KnowledgeSearch.forSegment(hits, "How do I onboard a retail customer?")).extracting(KnowledgeSearch.Hit::heading)
                .containsExactly("2.1 User Management - Create", "66.3 User Groups - Retail & Business User", "15 Group Corporate Onboarding");
        assertThat(KnowledgeSearch.forSegment(hits, "How do I onboard a customer?")).isEqualTo(hits);
    }

    private static KnowledgeSearch.Hit scored(UUID documentId, String heading, double score) {
        return new KnowledgeSearch.Hit("MANUAL", UUID.randomUUID(), documentId, "User Manual Core", heading, "25.2", 1, 1, null, "text", score, false, null);
    }

    private static KnowledgeSearch.Hit hit(UUID documentId, int page) {
        return new KnowledgeSearch.Hit(documentId == null ? "NOTE" : "MANUAL", UUID.randomUUID(), documentId, "t", "h" + page, "25.2", page, page,
                null, "text", 0, false, null);
    }
}
