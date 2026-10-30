package com.obdx.factory.knowledge;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * An answer is checked against its sources before it is shown: citations, identifiers, vendors, versions, code, claims
 * and the Markdown.
 */
class AnswerPostProcessorTest {

    private static final List<String> SOURCES = List.of(
            "User Management - Change user status. This section allows you to lock and unlock a user. Navigate to Onboarding > User "
                    + "Management. Enter the search criteria, click Search. Click in the Status column to lock or unlock a user. "
                    + "In the Lock Status field move the slider to lock or unlock a user, enter the reason and click Save.",
            "Revoke channel access: if a customer does not want to use channel banking and asks the bank to disable internet banking, "
                    + "the bank administrator revokes the channel access of the user. The property digx.user.lock.attempts sets the "
                    + "number of wrong password attempts.");

    private static AnswerPostProcessor.Checked check(String answer) {
        return AnswerPostProcessor.process(answer, SOURCES, "How do I lock a retail user?", "22");
    }

    @Test
    void aGroundedAnswerIsVerified() {
        AnswerPostProcessor.Checked c = check("""
                Based on the provided sources, a user is locked in User Management [1].

                1. Navigate to Onboarding > User Management, enter the search criteria and click Search [1].
                2. Click in the Status column, move the Lock Status slider, enter the reason and click Save [1].""");
        assertThat(c.answer()).startsWith("A user is locked in User Management [1].");
        assertThat(c.quality().status()).isEqualTo(AnswerPostProcessor.Status.VERIFIED);
        assertThat(c.cited()).containsExactly(1);
        assertThat(c.needsCorrection()).isFalse();
    }

    @Test
    void citationsToSourcesThatDoNotExistAreRemovedAndOthersNormalised() {
        AnswerPostProcessor.Checked c = check("The administrator locks the user in the Status column of User Management [1, 2] [7].");
        assertThat(c.answer()).contains("[1][2]").doesNotContain("[7]");
        assertThat(c.quality().findings()).anyMatch(f -> f.startsWith("Removed citations") && f.contains("[7]"));
        assertThat(c.quality().status()).isEqualTo(AnswerPostProcessor.Status.PARTIALLY_VERIFIED);
        assertThat(c.needsCorrection()).isTrue();
        assertThat(AnswerPostProcessor.citations("see [Source 2] and [1-2]", 2, new java.util.TreeSet<>())).isEqualTo("see [2] and [1][2]");
    }

    @Test
    void identifiersMenuPathsAndCodeNotInTheSourcesAreMarked() {
        AnswerPostProcessor.Checked c = check("""
                Set `digx.user.delete.enabled` to true and go to Administration > Users > Delete User to delete the user [1].

                The lock attempts come from `digx.user.lock.attempts` [2].""");
        assertThat(c.answer()).contains("`digx.user.delete.enabled` _(not in the sources)_")
                .contains("Delete User _(menu path not confirmed by the sources)_")
                .doesNotContain("`digx.user.lock.attempts` _(not in");
        assertThat(c.quality().status()).isEqualTo(AnswerPostProcessor.Status.PARTIALLY_VERIFIED);
        assertThat(c.needsCorrection()).isTrue();
    }

    @Test
    void otherVendorsAreRemoved() {
        AnswerPostProcessor.Checked c = check("""
                A user is locked in User Management by moving the Lock Status slider [1].

                - In Temenos T24, users are deleted from the user profile screen.
                - The reason is entered before clicking Save [1].""");
        assertThat(c.answer()).doesNotContain("Temenos").doesNotContain("T24").contains("The reason is entered");
        assertThat(c.quality().findings()).anyMatch(f -> f.contains("Temenos"));
    }

    @Test
    void unsupportedAndWeaklySupportedStatementsAreLabelled() {
        AnswerPostProcessor.Checked c = check("""
                Locking needs approval by a second administrator through the dual control workflow, configured per segment [1].

                Deleted users are archived to the history tables every night by the batch scheduler and purged after ninety days.""");
        assertThat(c.answer()).contains("_(not confirmed by the cited source)_").contains("_(not found in the sources)_");
        assertThat(c.quality().status()).isEqualTo(AnswerPostProcessor.Status.PARTIALLY_VERIFIED);
    }

    @Test
    void stepsWithoutCitationsAreFound() {
        AnswerPostProcessor.Checked c = check("""
                To lock a user [1]:

                1. Open the user management screen from the menu.
                2. Search for the user by name or ID.
                3. Click the status of the user record.
                4. Move the lock slider and save it.""");
        assertThat(c.quality().findings()).contains("4 of 4 statements and steps cite no source.");
        assertThat(c.needsCorrection()).isTrue();
    }

    @Test
    void anotherVersionIsCaught() {
        AnswerPostProcessor.Checked c = check("In OBDX 25.2 the user is locked from the Status column of User Management [1].");
        assertThat(c.quality().findings()).anyMatch(f -> f.contains("25.x") && f.contains("22.x"));
        assertThat(c.limitations()).isNotEmpty();
    }

    @Test
    void noSourcesOrNoAnswerMeansInsufficientEvidence() {
        assertThat(AnswerPostProcessor.process("The manuals do not cover it.", List.of(), "q", "22").quality().status())
                .isEqualTo(AnswerPostProcessor.Status.INSUFFICIENT_EVIDENCE);
        assertThat(check("The manuals in the factory do not cover deleting a user.").quality().status())
                .isEqualTo(AnswerPostProcessor.Status.INSUFFICIENT_EVIDENCE);
        AnswerPostProcessor.Checked partly = check("The manuals do not describe deleting a user; a user can be locked from the Status column [1].");
        assertThat(partly.limitations()).contains("The manuals in the factory do not cover all of the question.");
    }

    @Test
    void markdownIsTidied() {
        AnswerPostProcessor.Checked c = check("""
                # Locking a user

                ## Locking a user

                ## Steps

                ## Details

                Click in the Status column to lock or unlock a user [1].

                Click in the Status column to lock or unlock a user [1].

                I hope this helps! Let me know if you have other questions.""");
        // "# " became "## ", the repeated heading, the headings with nothing under them, the repeated paragraph and the
        // closing line went
        assertThat(c.answer()).isEqualTo("""
                ## Details

                Click in the Status column to lock or unlock a user [1].""");
    }

    @Test
    void codeIsKeptBrokenJsonFlaggedAndUnclosedBlocksClosed() {
        String longCode = "line\n".repeat(200);
        AnswerPostProcessor.Checked c = check("Lock attempts are set by digx.user.lock.attempts [2].\n\n```json\n{\"digx.user.lock.attempts\": 3,}\n```\n\n```text\n"
                + longCode + "```\n\n```properties\ndigx.user.lock.attempts=3");
        assertThat(c.codeExamples()).hasSize(3);
        assertThat(c.codeExamples().get(1).code()).hasLineCount(200);
        assertThat(c.answer()).contains("_This JSON is not valid as written").endsWith("digx.user.lock.attempts=3\n```");
        assertThat(c.quality().findings()).anyMatch(f -> f.contains("not closed")).anyMatch(f -> f.contains("JSON"));
    }

    @Test
    void tooMuchBoldIsTakenOff() {
        AnswerPostProcessor.Checked c = check("**The** **administrator** **locks** **the** **user** **from** **the** **Status** column [1].");
        assertThat(c.answer()).isEqualTo("The administrator locks the user from the Status column [1].");
    }

    @Test
    void theStructure() {
        AnswerPostProcessor.Checked c = check("""
                A user is locked from User Management [1].

                ## Steps

                1. Click in the Status column [1].

                ## Channel access

                The administrator revokes the channel access [2].

                | Action | Where |
                |---|---|
                | Lock | User Management |""");
        assertThat(c.summary()).isEqualTo("A user is locked from User Management [1].");
        assertThat(c.sections()).extracting(AnswerPostProcessor.Section::heading).containsExactly(null, "Steps", "Channel access");
        assertThat(c.sections().get(2).citations()).containsExactly(2);
        assertThat(c.tables()).hasSize(1);
    }
}
