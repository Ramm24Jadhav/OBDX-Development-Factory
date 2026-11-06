package com.obdx.factory.knowledge;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/** A question on the OBDX Library can be asked for another OBDX version than the workspace's. */
class KnowledgeAskVersionTest {

    @Test
    void aChosenVersionReplacesTheWorkspaceVersionLine() {
        assertThat(KnowledgeService.chosenVersionLine("22.2", "25")).isEqualTo("22");
        assertThat(KnowledgeService.chosenVersionLine("25", null)).isEqualTo("25");
        assertThat(KnowledgeService.chosenVersionLine(" 22.2.0.1 ", "25")).isEqualTo("22");
    }

    @Test
    void withoutAChoiceTheWorkspaceVersionLineStays() {
        assertThat(KnowledgeService.chosenVersionLine(null, "25")).isEqualTo("25");
        assertThat(KnowledgeService.chosenVersionLine("", "25")).isEqualTo("25");
        assertThat(KnowledgeService.chosenVersionLine("latest", "25")).isEqualTo("25");
        assertThat(KnowledgeService.chosenVersionLine(null, null)).isNull();
    }
}
