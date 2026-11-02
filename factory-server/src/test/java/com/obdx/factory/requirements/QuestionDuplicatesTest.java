package com.obdx.factory.requirements;

import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * QA R19-7 and its review (R5, V1): a question of the document the model asks again in other words is asked once; the
 * document's own questions are never merged with each other, and an answer is never lost.
 */
class QuestionDuplicatesTest {

    private static RequirementSpec.OpenQuestion answered(String question, String answer, String... options) {
        return new RequirementSpec.OpenQuestion(question, null, null, List.of(options), null, answer);
    }

    private static RequirementSpec.OpenQuestion q(String question, String... options) {
        return answered(question, null, options);
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

    private static DocumentStructure.Structure document(List<RequirementSpec.OpenQuestion> questions) {
        return new DocumentStructure.Structure(List.of(), List.of(), List.of(), List.of(), List.of(), List.of(), List.of(), questions, List.of());
    }

    private static RequirementSpec drafted(List<RequirementSpec.OpenQuestion> questions) {
        return new RequirementSpec("BRD4", null, List.of(), List.of(), List.of(), List.of(), List.of(), List.of(), questions, List.of(),
                List.of(), List.of(), List.of(), List.of(), List.of(), List.of());
    }

    @Test
    void round19sNoneNameMatchQuestionIsAskedOnceWithTheModelsOptions() {
        assertThat(SpecMerger.restates(DOCUMENTS, MODELS)).isTrue();

        RequirementSpec spec = DocumentStructure.apply(drafted(List.of(RETENTION, MODELS)), document(List.of(DOCUMENTS)));

        assertThat(spec.openQuestions()).extracting(RequirementSpec.OpenQuestion::question)
                .containsExactly(DOCUMENTS.question(), RETENTION.question());
        assertThat(spec.openQuestions().getFirst().options()).containsExactly("Status VALID with warning", "Status INVALID");
        assertThat(spec.openQuestions().getFirst().reason()).isEqualTo("For Payments Platform to answer.");
    }

    @Test
    void theDocumentsOwnQuestionsAreNeverMergedWithEachOther() {
        // R5's probes: each pair is two questions the analysts asked
        List<RequirementSpec.OpenQuestion> asked = List.of(
                q("Should the standing instruction amount field be mandatory?", "Mandatory", "Optional"),
                q("Should the standing instruction remarks field be mandatory?", "Mandatory", "Optional"),
                q("What is the maximum amount per transaction for retail users?"),
                q("What is the maximum amount per transaction for corporate users?"),
                q("What is the daily limit for domestic transfers?"), q("What is the daily limit for international transfers?"),
                q("Should the beneficiary be notified by SMS on creation?", "Yes", "No"),
                q("Should the beneficiary be notified by email on creation?", "Yes", "No"),
                q("Which frequencies are allowed when creating a standing instruction?", "Daily", "Weekly", "Monthly"),
                q("Which frequencies are allowed when modifying a standing instruction?", "Daily", "Weekly", "Monthly"),
                q("Can a standing instruction be cancelled after its first execution?"),
                q("Can a standing instruction be cancelled before its first execution?"));

        RequirementSpec spec = DocumentStructure.apply(drafted(List.of()), document(asked));

        assertThat(spec.openQuestions()).containsExactlyElementsOf(asked);
        // only the same question word for word is one
        assertThat(DocumentStructure.apply(drafted(List.of()), document(List.of(RETENTION, q("How long should audit rows be KEPT?"))))
                .openQuestions()).containsExactly(RETENTION);
    }

    @Test
    void anAnswerIsCarriedOnlyForTheSameWordsOrTheSameDocumentId() {
        // the same words: the answer of the one left out is kept
        List<RequirementSpec.OpenQuestion> merged = SpecMerger.questions(List.of(q("How long should audit rows be kept?"),
                answered("How long should audit rows be KEPT", "1 year")));
        assertThat(merged).singleElement().satisfies(k -> assertThat(k.answer()).isEqualTo("1 year"));
        // the same question in other words: one question, but the answer to the other words is not carried
        assertThat(SpecMerger.questions(List.of(q("How long should audit rows be kept?"),
                answered("What is the required retention period for audit rows?", "1 year")))).singleElement()
                .satisfies(k -> assertThat(k.answer()).isNull());
        // the same ID of the document
        RequirementSpec.OpenQuestion answered = new RequirementSpec.OpenQuestion("Which channel sends the OTP?", null, "OQ-002", List.of(),
                null, "SMS");
        RequirementSpec spec = DocumentStructure.apply(drafted(List.of(answered)), document(List.of(new RequirementSpec.OpenQuestion(
                "Which channel should send the one-time password?", null, "OQ-002", List.of(), null, null))));
        assertThat(spec.openQuestions()).singleElement().satisfies(k -> assertThat(k.answer()).isEqualTo("SMS"));
    }

    /** The seven pairs the verification of 9317541 found merged: each asks about something else. */
    private static final List<List<RequirementSpec.OpenQuestion>> DIFFERENT = List.of(
            List.of(q("Should the standing instruction amount field be mandatory?", "Mandatory", "Optional"),
                    q("Should the standing instruction remarks field be mandatory?", "Mandatory", "Optional")),
            List.of(q("What is the maximum amount per transaction for retail users?"), q("What is the maximum amount per transaction for corporate users?")),
            List.of(q("What is the daily limit for domestic transfers?"), q("What is the daily limit for international transfers?")),
            List.of(q("Should the beneficiary be notified by SMS on creation?", "Yes", "No"),
                    q("Should the beneficiary be notified by email on creation?", "Yes", "No")),
            List.of(q("Which channel sends the OTP?", "SMS", "Email", "Push notification"), q("Which channel sends the alert?", "SMS", "Email", "Push notification")),
            List.of(q("Which frequencies are allowed when creating a standing instruction?", "Daily", "Weekly"),
                    q("Which frequencies are allowed when modifying a standing instruction?", "Daily", "Weekly")),
            List.of(q("Can a standing instruction be cancelled after its first execution?"),
                    q("Can a standing instruction be cancelled before its first execution?")),
            List.of(q("Is SMS needed?"), q("Is email needed?")));

    @Test
    void questionsThatEachNameSomethingTheOtherDoesNotAreDifferent() {
        for (List<RequirementSpec.OpenQuestion> pair : DIFFERENT) {
            RequirementSpec.OpenQuestion a = pair.get(0);
            RequirementSpec.OpenQuestion b = pair.get(1);
            assertThat(SpecMerger.sameQuestion(a, b)).as(a.question()).isFalse();
            assertThat(SpecMerger.sameQuestion(b, a)).as(b.question()).isFalse();
            assertThat(SpecMerger.restates(a, b)).as(a.question()).isFalse();
            assertThat(SpecMerger.restates(b, a)).as(b.question()).isFalse();
            assertThat(SpecMerger.questions(List.of(a, answered(b.question(), "INR 50 lakh")))).hasSize(2).first()
                    .satisfies(k -> assertThat(k.answer()).isNull());
        }
        // the same question in other words still is one
        assertThat(DocumentStructure.sameQuestion("How long should audit rows be kept?", "What is the required retention period for audit rows?"))
                .isTrue();
    }

    @Test
    void aDraftedQuestionRestatesOnlyTheDocumentQuestionItMatchesBest() {
        // the verification's document: retail, corporate, SMS; the model's: email (no ID), retail by its ID with an answer
        List<RequirementSpec.OpenQuestion> asked = List.of(
                new RequirementSpec.OpenQuestion("What is the maximum amount per transaction for retail users?", null, "OQ-001", List.of(), null, null),
                new RequirementSpec.OpenQuestion("What is the maximum amount per transaction for corporate users?", null, "OQ-002", List.of(), null, null),
                new RequirementSpec.OpenQuestion("Should the beneficiary be notified by SMS on creation?", null, "OQ-003", List.of("Yes", "No"), null, null));
        List<RequirementSpec.OpenQuestion> model = List.of(answered("Should the beneficiary be notified by email on creation?", "Yes", "Yes", "No"),
                new RequirementSpec.OpenQuestion("What's the cap per transaction for retail users?", null, "OQ-001", List.of(), null, "INR 10 lakh"),
                q("Which currency is used?"));

        List<RequirementSpec.OpenQuestion> out = DocumentStructure.apply(drafted(model), document(asked)).openQuestions();

        assertThat(out).extracting(RequirementSpec.OpenQuestion::question).containsExactly(asked.get(0).question(), asked.get(1).question(),
                asked.get(2).question(), model.get(0).question(), model.get(2).question());
        assertThat(out).extracting(RequirementSpec.OpenQuestion::answer).containsExactly("INR 10 lakh", null, null, "Yes", null);
        // a requirement's ID named by two questions makes them no one question
        assertThat(SpecMerger.restates(new RequirementSpec.OpenQuestion("Is SMS needed?", null, "FR-001", List.of(), null, null),
                new RequirementSpec.OpenQuestion("Which currency is used?", null, "FR-001", List.of(), null, "INR"))).isFalse();
    }

    @Test
    void aReferenceThatIsNoDocumentIdMergesNothing() {
        RequirementSpec.OpenQuestion a = new RequirementSpec.OpenQuestion("Which limit applies to a savings account?", null, "Section 4",
                List.of(), null, null);
        RequirementSpec.OpenQuestion b = new RequirementSpec.OpenQuestion("Which channel sends the confirmation alert?", null, "Section 4",
                List.of(), null, null);
        assertThat(SpecMerger.restates(a, b)).isFalse();
        assertThat(SpecMerger.questions(List.of(RETENTION, DOCUMENTS))).hasSize(2);
    }

    @Test
    void thousandsOfQuestionsAreCappedAndQuick() {
        List<RequirementSpec.OpenQuestion> many = new ArrayList<>();
        // distinct words, so no two are the same question and every pair is compared in full
        for (int i = 0; i < 5_000; i++) {
            many.add(q("Should the " + word(i) + " field on the " + word(i + 7) + " screen allow " + word(i + 13) + " values?"));
        }
        long start = System.nanoTime();
        RequirementSpec spec = DocumentStructure.apply(drafted(many.subList(0, 3_000)), document(many));
        assertThat((System.nanoTime() - start) / 1_000_000).isLessThan(5_000);
        // the document's first MAX_DOCUMENT_QUESTIONS, then the model's not restating them
        assertThat(spec.openQuestions().subList(0, DocumentStructure.MAX_DOCUMENT_QUESTIONS)).isEqualTo(many.subList(0,
                DocumentStructure.MAX_DOCUMENT_QUESTIONS));
        assertThat(spec.openQuestions()).hasSize(3_000);
    }

    /** A five-letter word of its own for each number: aaaaa, aaaab, ... */
    static String word(int n) {
        char[] letters = new char[5];
        for (int i = 4; i >= 0; i--) {
            letters[i] = (char) ('a' + n % 26);
            n /= 26;
        }
        return new String(letters);
    }
}
