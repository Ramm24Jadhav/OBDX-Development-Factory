package com.obdx.factory.knowledge;

import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/** "Ask next": the follow-up block is taken off the answer, whole or streamed, and its questions are kept. */
class FollowUpsTest {

    private static final String ANSWER = "Add the field through the extensibility layer [1].\n\n1. **The screen.** Copy the component [2].";

    @Test
    void theBlockIsTakenOffTheAnswerAndItsQuestionsKept() {
        FollowUps.Split split = FollowUps.split(ANSWER + "\n\n<<ask-next>>\n- How do I map the field in the host adapter?\n"
                + "2. Show it only for retail users [1]\n\"Where is the resource bundle?\"\n");
        assertThat(split.answer()).isEqualTo(ANSWER);
        assertThat(split.questions()).containsExactly("How do I map the field in the host adapter?", "Show it only for retail users",
                "Where is the resource bundle?");
    }

    @Test
    void theMarkerIsFoundAsModelsWriteIt() {
        FollowUps.Split split = FollowUps.split(ANSWER + "\n\n**<< Ask Next >>**\n* **Which service sends it to the host?**");
        assertThat(split.answer()).isEqualTo(ANSWER);
        assertThat(split.questions()).containsExactly("Which service sends it to the host?");
    }

    @Test
    void withoutABlockOrWithAnEmptyOneThereAreNoFollowUps() {
        assertThat(FollowUps.split(ANSWER).answer()).isEqualTo(ANSWER);
        assertThat(FollowUps.split(ANSWER).questions()).isEmpty();
        FollowUps.Split empty = FollowUps.split(ANSWER + "\n<<ask-next>>\n\n- \n---\n");
        assertThat(empty.answer()).isEqualTo(ANSWER);
        assertThat(empty.questions()).isEmpty();
        assertThat(FollowUps.split(null).questions()).isEmpty();
    }

    @Test
    void atMostThreeShortDistinctQuestionsAreKept() {
        String tooLong = "Why ".repeat(50) + "?";
        FollowUps.Split split = FollowUps.split(ANSWER + "\n<<ask-next>>\nOne?\none?\n" + tooLong + "\nTwo?\nThree?\nFour?");
        assertThat(split.questions()).containsExactly("One?", "Two?", "Three?");
    }

    @Test
    void theStreamNeverPassesTheMarkerOnEvenWhenItIsSplitAcrossPieces() {
        String reply = ANSWER + "\n\n<<ask-next>>\nHow do I map the field?\nWhere is the bundle?";
        for (int size = 1; size <= 14; size++) {
            List<String> passed = new ArrayList<>();
            FollowUps.Stream stream = new FollowUps.Stream(passed::add);
            for (int i = 0; i < reply.length(); i += size) {
                stream.accept(reply.substring(i, Math.min(reply.length(), i + size)));
            }
            stream.finish();
            String text = String.join("", passed);
            assertThat(text).as("pieces of " + size).doesNotContain("<<").doesNotContain("ask-next").doesNotContain("map the field");
            assertThat(text.strip()).as("pieces of " + size).isEqualTo(ANSWER);
        }
    }

    @Test
    void theStreamPassesEverythingOnWhenThereIsNoBlock() {
        String reply = "Shift it left with `x << 2` in the adapter [1]. A < B, and a trailing <";
        List<String> passed = new ArrayList<>();
        FollowUps.Stream stream = new FollowUps.Stream(passed::add);
        for (int i = 0; i < reply.length(); i += 3) {
            stream.accept(reply.substring(i, Math.min(reply.length(), i + 3)));
        }
        stream.finish();
        assertThat(String.join("", passed)).isEqualTo(reply);
        // Nothing is held for long: the text before a possible marker is passed on as it comes
        assertThat(passed.size()).isGreaterThan(5);
    }

    @Test
    void theAnswerInstructionAsksForTheBlock() {
        assertThat(AnswerGeneration.system("R", AnswerGeneration.Style.CONCISE, QueryUnderstanding.Type.PROCEDURE)).endsWith(FollowUps.INSTRUCTION)
                .contains(FollowUps.MARKER);
    }
}
