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

    private static KnowledgeSearch.Hit hit(UUID documentId, int page) {
        return new KnowledgeSearch.Hit(documentId == null ? "NOTE" : "MANUAL", UUID.randomUUID(), documentId, "t", "h" + page, "25.2", page, page,
                null, "text", 0, false, null);
    }
}
