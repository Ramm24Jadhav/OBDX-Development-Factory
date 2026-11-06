package com.obdx.factory.requirements;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/** Sections drafted separately are merged without losing APIs that share a path or keeping a question twice. */
class MergingTest {

    @Test
    void anApiIsItsMethodAndPath() {
        // BRD1 FR-008: POST, GET (list), GET /{instructionId} and DELETE /{instructionId} on /payments/standingInstructions
        RequirementSpec first = SpecParser.parse("""
                {"title": "Standing instructions", "apis": [
                  {"name": "/payments/standingInstructions", "method": "POST", "description": "Create a standing instruction"},
                  {"name": "/payments/standingInstructions", "method": "GET", "description": "List standing instructions"}]}
                """, "x");
        RequirementSpec second = SpecParser.parse("""
                {"title": "Standing instructions", "apis": [
                  {"name": "GET /payments/standingInstructions/{instructionId}", "description": "Read one"},
                  {"name": "/payments/standingInstructions/{instructionId}", "method": "DELETE", "description": "Cancel one"},
                  {"name": "/payments/standingInstructions/{instructionId}", "method": "GET", "description": "The same read again"}]}
                """, "x");

        RequirementSpec merged = SpecMerger.merge(List.of(first, second), "x");

        assertThat(merged.apis()).extracting(RequirementSpec.Api::description)
                .containsExactly("Create a standing instruction", "List standing instructions", "Read one", "Cancel one");
    }

    @Test
    void theSameQuestionInOtherWordsIsAskedOnce() {
        RequirementSpec first = SpecParser.parse("""
                {"title": "Audit", "openQuestions": [{"question": "How long should audit rows be kept?"}]}
                """, "x");
        RequirementSpec second = SpecParser.parse("""
                {"title": "Audit", "openQuestions": [{"question": "What is the required retention period for audit rows?",
                  "options": ["1 year", "7 years"], "suggestedAnswer": "7 years"},
                  {"question": "Which roles may view the audit rows on screen?"}]}
                """, "x");

        RequirementSpec merged = SpecMerger.merge(List.of(first, second), "x");

        assertThat(merged.openQuestions()).extracting(RequirementSpec.OpenQuestion::question)
                .containsExactly("How long should audit rows be kept?", "Which roles may view the audit rows on screen?");
        assertThat(merged.openQuestions().getFirst().options()).containsExactly("1 year", "7 years");
    }
}
