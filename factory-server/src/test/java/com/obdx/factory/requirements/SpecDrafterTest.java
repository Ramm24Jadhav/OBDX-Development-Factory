package com.obdx.factory.requirements;

import com.obdx.factory.model.ModelGateway;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class SpecDrafterTest {

    /** Answers with queued replies and records the prompts it was given. */
    static class ScriptedModel implements ModelGateway {
        final Deque<String> replies = new ArrayDeque<>();
        final List<String> systemPrompts = new ArrayList<>();
        final List<String> userPrompts = new ArrayList<>();

        @Override
        public ChatResult chat(String systemPrompt, String userPrompt) {
            throw new UnsupportedOperationException();
        }

        @Override
        public ChatResult chatJson(String systemPrompt, String userPrompt) {
            systemPrompts.add(systemPrompt);
            userPrompts.add(userPrompt);
            return new ChatResult(replies.removeFirst(), "scripted", 1);
        }

        @Override
        public float[] embed(String text) {
            throw new UnsupportedOperationException();
        }

        @Override
        public List<float[]> embedAll(List<String> texts) {
            throw new UnsupportedOperationException();
        }
    }

    private final ScriptedModel model = new ScriptedModel();
    private final SpecDrafter drafter = new SpecDrafter(model, new RequirementsProperties(60, 2), JsonMapper.builder().build());

    @Test
    void draftsEachSectionAndRetriesUnusableAnswers() {
        model.replies.add("Sorry, here it is: {\"screens\": [{\"name\": \"Limits\", \"fields\": [{\"name\": \"daily\"}]}]}");
        model.replies.add("not json at all");
        model.replies.add("{\"screens\": [{\"name\": \"limits\", \"fields\": [{\"name\": \"monthly\"}]}]}");

        RequirementSpec spec = drafter.draft("Limits BRD",
                "Section one describes the daily limit field.\n\nSection two describes the monthly limit field.", "- OBDX version: 22.2.0");

        assertThat(spec.title()).isEqualTo("Limits BRD");
        assertThat(spec.screens()).singleElement().satisfies(screen ->
                assertThat(screen.fields()).extracting(RequirementSpec.Field::name).containsExactly("daily", "monthly"));
        assertThat(model.userPrompts).hasSize(3);
        assertThat(model.userPrompts.get(0)).contains("Section 1 of 2", "daily limit");
        assertThat(model.userPrompts.get(2)).contains("Section 2 of 2", "could not be used");
        assertThat(model.systemPrompts.getFirst()).contains("OBDX version: 22.2.0", "Never invent");
    }

    @Test
    void givesUpAfterMaxAttempts() {
        model.replies.add("no");
        model.replies.add("still no");

        assertThatThrownBy(() -> drafter.draft("x", "short", ""))
                .hasMessageContaining("did not return a usable specification");
    }

    @Test
    void refineSendsSpecWithoutDecisionsAndListsDecisions() {
        model.replies.add("{\"title\": \"Limits\", \"screens\": [{\"name\": \"Limits\"}]}");
        RequirementSpec spec = new RequirementSpec("Limits", null, List.of(), List.of(), List.of(), List.of(), List.of(), List.of(),
                List.of(new RequirementSpec.OpenQuestion("Currency?", null, null, List.of(), null, null)),
                List.of(new RequirementSpec.Decision("Is the limit per day?", "Yes, per calendar day")));

        drafter.refine(spec, "");

        assertThat(model.userPrompts.getFirst())
                .contains("Currency?")
                .contains("- Q: Is the limit per day?\n  A: Yes, per calendar day")
                .doesNotContain("\"decisions\":[{");
    }

    @Test
    void splitsAtParagraphBoundaries() {
        assertThat(SpecDrafter.split("aaaa\n\nbbbb\n\ncccc", 10)).containsExactly("aaaa\n\nbbbb", "cccc");
        assertThat(SpecDrafter.split("x".repeat(25), 10)).containsExactly("x".repeat(10), "x".repeat(10), "x".repeat(5));
    }

    @Test
    void refineLeavesTheDocumentsListsOutAndKeepsThem() {
        model.replies.add("{\"title\": \"Limits\", \"screens\": [{\"name\": \"Limits\"}], \"requirements\": []}");
        RequirementSpec spec = new RequirementSpec("Limits", null, List.of(), List.of(), List.of(), List.of(), List.of(), List.of(), List.of(),
                List.of(new RequirementSpec.Decision("Per day?", "Yes")), List.of("Daily limits"), List.of(), List.of(),
                List.of(new RequirementSpec.FunctionalRequirement("FR-001", "Limit", "Check the daily limit", "Must", List.of("Limits"))),
                List.of(), List.of());

        RequirementSpec refined = drafter.refine(spec, "");

        assertThat(model.userPrompts.getLast()).doesNotContain("FR-001").doesNotContain("Daily limits");
        assertThat(model.systemPrompts.getLast()).doesNotContain("acceptanceCriteria").contains("openQuestions");
        assertThat(refined.requirements()).extracting(RequirementSpec.FunctionalRequirement::id).containsExactly("FR-001");
        assertThat(refined.scope()).containsExactly("Daily limits");
        assertThat(refined.screens()).hasSize(1);
    }
}
