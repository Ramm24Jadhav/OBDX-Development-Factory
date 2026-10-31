package com.obdx.factory.change;

import com.obdx.factory.common.ConflictException;
import com.obdx.factory.model.ModelLimitReachedException;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Generation that stops at the model's limit leaves the rest pending for Continue generation; an incomplete change is
 * not delivered unless confirmed; cross-file findings go to the model when a file is written again.
 */
class GenerationStopTest {

    private static ChangeFileStore.ChangeFile file(String path, ChangeFileStore.Status status, String generated, FileChecks.Status check) {
        return new ChangeFileStore.ChangeFile(0, path, "create", "service", null, status, null, generated, false, check, null, 1);
    }

    private static final List<ChangeFileStore.ChangeFile> STOPPED = List.of(
            file("a/Dto.java", ChangeFileStore.Status.GENERATED, "class Dto {}", FileChecks.Status.PASSED),
            file("a/Service.java", ChangeFileStore.Status.FAILED, null, FileChecks.Status.FAILED),
            file("a/Resource.java", ChangeFileStore.Status.PENDING, null, null),
            file("a/Same.java", ChangeFileStore.Status.UNCHANGED, "class Same {}", FileChecks.Status.PASSED));

    @Test
    void continueGenerationWritesOnlyTheFilesNotWritten() {
        assertThat(ChangeService.notWritten(STOPPED)).containsExactly("a/Service.java", "a/Resource.java");
        assertThat(ChangeService.summary(STOPPED)).isEqualTo("1 file(s) written, 1 with problems, 0 with warnings, 1 not written yet "
                + "(Continue generation). Review the changes before delivering them.");
    }

    @Test
    void continueSkipsFilesThatCanOnlyBeChangedByHandAndRefusesWhenTheCodeMovedOn() {
        ChangeFileStore.ChangeFile tooLarge = new ChangeFileStore.ChangeFile(0, "a/Big.java", "modify", "service", null,
                ChangeFileStore.Status.FAILED, "x", null, false, FileChecks.Status.FAILED, "The file is too large to rewrite safely; change it by hand.", 0);
        List<ChangeFileStore.ChangeFile> files = new java.util.ArrayList<>(STOPPED);
        files.add(tooLarge);

        assertThat(ChangeService.notWritten(files)).containsExactly("a/Service.java", "a/Resource.java");
        // still not written, for delivery
        assertThat(ChangeService.unwritten(files)).contains("a/Big.java");

        assertThat(ChangeService.resumeProblem(7L, 7L)).isNull();
        assertThat(ChangeService.resumeProblem(null, 9L)).isNull();
        assertThat(ChangeService.resumeProblem(7L, 9L)).contains("r7 to r9", "Analyze the change again", "Write again");
    }

    @Test
    void anIncompleteChangeIsDeliveredOnlyWhenConfirmed() {
        assertThatThrownBy(() -> ChangeService.requireComplete(STOPPED)).isInstanceOf(ConflictException.class)
                .hasMessageStartingWith(ChangeService.INCOMPLETE).hasMessageContaining("2 planned file(s) are not written: a/Service.java, a/Resource.java");
        assertThatCode(() -> ChangeService.requireComplete(List.of(STOPPED.getFirst(), STOPPED.getLast()))).doesNotThrowAnyException();
    }

    @Test
    void saysWhichLimitStoppedIt() {
        assertThat(ChangeService.limitReason(new ModelLimitReachedException("x", true, null))).isEqualTo("The model's daily limit is used up.");
        assertThat(ChangeService.limitReason(new ModelLimitReachedException("asks to wait", false, null))).contains("rate limit");

        // with the wait the server gave, the message says when and how to go on
        ModelLimitReachedException daily = new ModelLimitReachedException("x", true, "about 15 minutes", null);
        assertThat(ChangeService.stoppedMessage(daily, null, 3, 8)).isEqualTo("The model's daily limit is used up. Generation stopped after 3 "
                + "of 8 file(s); the files already written are kept. Try again in about 15 minutes, then click Continue generation.");
        assertThat(ChangeService.stoppedMessage(new ModelLimitReachedException("x", true, null), null, 3, 8))
                .endsWith("Click Continue generation when the limit resets.");
        assertThat(ChangeService.stoppedMessage(daily, "ui/a.js", 3, 8)).isEqualTo("Writing ui/a.js again stopped: The model's daily limit is "
                + "used up. The previous version is kept; write it again in about 15 minutes.");
    }

    @Test
    void anIncompleteDeliverySaysWhatWasLeftOut() {
        assertThat(ChangeService.deliveredMessage("https://svn/b/cr-1", 4, 3, 5, List.of("ui/a.js", "ui/a.html")))
                .isEqualTo("Committed 3 of 5 file(s) to https://svn/b/cr-1 in revision 4; not delivered: ui/a.js, ui/a.html.");
        assertThat(ChangeService.deliveredMessage("https://svn/b/cr-1", 4, 5, 5, List.of())).isEqualTo("Committed to https://svn/b/cr-1 in revision 4.");
    }

    @Test
    void crossFileFindingsGoToTheModelWhenTheFileIsWrittenAgain() {
        String check = "Line 3 (java-log-concat, warning): Builds the log message with +.\n"
                + "Calls methods that TransferService does not have: save(). Use the methods TransferService declares, or add them to it.\n"
                + "Uses classes of the plan that are not written yet: TransferDTO. Write them (Continue generation or Write again), or remove the use.";

        String fixes = ChangeService.crossFileFixes(check);

        assertThat(fixes).startsWith("Fix these problems found by comparing this file with the other files of the change:")
                .contains("- Calls methods that TransferService", "- Uses classes of the plan").doesNotContain("java-log-concat");
        assertThat(ChangeService.crossFileFixes("Line 3 (java-log-concat, warning): x")).isEmpty();
        assertThat(ChangeService.crossFileFixes(null)).isEmpty();
        // and they are replaced, not added again, by the next cross-check
        assertThat(ChangeService.withCrossChecks(FileChecks.Status.WARNING, check, List.of()).message()).isEqualTo(check.lines().findFirst().orElseThrow());
    }
}
