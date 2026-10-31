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
        assertThat(ChangeService.limitReason(new ModelLimitReachedException("asks to wait about 12 minutes", false, null)))
                .contains("rate limit", "about 12 minutes");
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
