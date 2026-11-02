package com.obdx.factory.requirements;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/** QA R19-7: the same open question asked twice in other words is asked once (the first kept). */
class QuestionDuplicatesTest {

    private static RequirementSpec.OpenQuestion q(String question, String... options) {
        return new RequirementSpec.OpenQuestion(question, null, null, List.of(options), null, null);
    }

    /** BRD4's two questions as the round 19 draft had them: the document's, then the model's in other words. */
    private static final RequirementSpec.OpenQuestion DOCUMENTS = new RequirementSpec.OpenQuestion(
            "Should a NONE name match be returned as VALID with a warning or as INVALID?", "For Payments Platform to answer.", "OQ-001",
            List.of(), null, null);
    private static final RequirementSpec.OpenQuestion MODELS = new RequirementSpec.OpenQuestion(
            "How should entries with a 'NONE' name match be treated in the response status?",
            "Determines if the partner portal should block creation or allow it with a warning.", "OQ-001",
            List.of("Status VALID with warning", "Status INVALID"), "Status VALID with warning", null);
    private static final RequirementSpec.OpenQuestion RETENTION = q("How long should audit rows be kept?", "6 months", "1 year", "3 years");

    @Test
    void round19sNoneNameMatchQuestionIsAskedOnceWithTheModelsOptions() {
        assertThat(SpecMerger.sameQuestion(DOCUMENTS, MODELS)).isTrue();

        List<RequirementSpec.OpenQuestion> merged = SpecMerger.questions(List.of(DOCUMENTS, RETENTION, MODELS));

        assertThat(merged).extracting(RequirementSpec.OpenQuestion::question).containsExactly(DOCUMENTS.question(), RETENTION.question());
        assertThat(merged.getFirst().options()).containsExactly("Status VALID with warning", "Status INVALID");
        assertThat(merged.getFirst().reference()).isEqualTo("OQ-001");
    }

    @Test
    void theDocumentsQuestionTakesTheDraftedOnesPlace() {
        DocumentStructure.Structure doc = new DocumentStructure.Structure(List.of(), List.of(), List.of(), List.of(), List.of(), List.of(),
                List.of(), List.of(DOCUMENTS), List.of());
        RequirementSpec drafted = new RequirementSpec("BRD4", null, List.of(), List.of(), List.of(), List.of(), List.of(), List.of(),
                List.of(RETENTION, MODELS, q("How should a 'NONE' name match be treated in the status?", "VALID with warning", "INVALID")),
                List.of(), List.of(), List.of(), List.of(), List.of(), List.of(), List.of());

        RequirementSpec spec = DocumentStructure.apply(drafted, doc);

        assertThat(spec.openQuestions()).extracting(RequirementSpec.OpenQuestion::question)
                .containsExactly(DOCUMENTS.question(), RETENTION.question());
    }

    @Test
    void differentQuestionsStaySeparate() {
        assertThat(SpecMerger.sameQuestion(RETENTION, q("Should audit rows include the IP address?", "Yes", "No"))).isFalse();
        assertThat(SpecMerger.sameQuestion(q("Which limit applies to a standing instruction from a savings account?"), q("Which channel sends the standing instruction confirmation alert?")))
                .isFalse();
        assertThat(SpecMerger.questions(List.of(RETENTION, DOCUMENTS))).hasSize(2);
    }
}
