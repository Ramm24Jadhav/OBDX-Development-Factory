package com.obdx.factory.knowledge;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/** The instruction for an answer follows the detail asked for and the kind of question. */
class AnswerGenerationTest {

    @Test
    void theDetailAndTheLayoutFollowTheQuestion() {
        String concise = AnswerGeneration.system("RULES", AnswerGeneration.Style.CONCISE, QueryUnderstanding.Type.PROCEDURE);
        assertThat(concise).startsWith("RULES").contains("At most about 120 words").contains("the numbered steps");
        String deep = AnswerGeneration.system("RULES", AnswerGeneration.Style.DEEP_DIVE, QueryUnderstanding.Type.TROUBLESHOOTING);
        assertThat(deep).contains("technical deep dive").contains("its documented causes").contains("never write one the sources do not have");
        assertThat(AnswerGeneration.system("R", AnswerGeneration.Style.DETAILED, QueryUnderstanding.Type.COMPARISON)).contains("comparison table");
    }

    @Test
    void anUnknownStyleIsDetailed() {
        assertThat(AnswerGeneration.Style.of(null)).isEqualTo(AnswerGeneration.Style.DETAILED);
        assertThat(AnswerGeneration.Style.of("deep-dive")).isEqualTo(AnswerGeneration.Style.DEEP_DIVE);
        assertThat(AnswerGeneration.Style.of("concise")).isEqualTo(AnswerGeneration.Style.CONCISE);
        assertThat(AnswerGeneration.Style.of("chatty")).isEqualTo(AnswerGeneration.Style.DETAILED);
    }
}
