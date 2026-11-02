package com.obdx.factory.importing;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;

/** Regression audit A6: Check out again removes the old working copy, read-only pristine files included. */
class WorkingCopyRecoveryTest {

    @Test
    void aWorkingCopyWithReadOnlyFilesIsRemoved(@TempDir Path temp) throws Exception {
        Path wc = temp.resolve("checkout");
        Path pristine = Files.createDirectories(wc.resolve(".svn/pristine/0a"));
        Path base = Files.writeString(pristine.resolve("0a6a.svn-base"), "x");
        Files.writeString(wc.resolve(".svn/wc.db"), "not a database");
        assertThat(base.toFile().setReadOnly()).isTrue();

        ImportService.deleteWorkingCopy(wc);

        assertThat(wc).doesNotExist();
    }

    /** Review of 57735c6: a link or junction in the working copy is removed itself; what it points to is left as it was. */
    @Test
    void linksAndJunctionsAreNotFollowed(@TempDir Path temp) throws Exception {
        Path outside = Files.createDirectories(temp.resolve("outside"));
        Path kept = Files.writeString(outside.resolve("keep.txt"), "x");
        assertThat(kept.toFile().setReadOnly()).isTrue();
        Path wc = Files.createDirectories(temp.resolve("checkout/src"));
        boolean linked = false;
        try {
            Files.createSymbolicLink(wc.resolve("link"), outside);
            linked = true;
        } catch (UnsupportedOperationException | java.io.IOException e) {
            // no right to make symbolic links (Windows without developer mode): a junction instead
        }
        if (!linked && System.getProperty("os.name").toLowerCase().contains("win")) {
            Process p = new ProcessBuilder("cmd", "/c", "mklink", "/J", wc.resolve("link").toString(), outside.toString())
                    .redirectErrorStream(true).start();
            linked = p.waitFor() == 0;
        }
        org.junit.jupiter.api.Assumptions.assumeTrue(linked, "cannot make a link or junction here");

        ImportService.deleteWorkingCopy(temp.resolve("checkout"));

        assertThat(temp.resolve("checkout")).doesNotExist();
        assertThat(kept).exists().hasContent("x");
        assertThat(kept.toFile().canWrite()).as("what the link points to is not made writable").isFalse();
    }

    // --- verification of f4c835e: the swap never leaves a workspace without its code ---

    @Test
    void theNewWorkingCopyTakesThePlaceOfTheOld(@TempDir Path temp) throws Exception {
        Path wc = Files.createDirectories(temp.resolve("checkout"));
        Files.writeString(wc.resolve("old.txt"), "old");
        Path fresh = Files.createDirectories(temp.resolve("checkout.new"));
        Files.writeString(fresh.resolve("new.txt"), "new");

        ImportService.swapIn(fresh, wc);

        assertThat(wc.resolve("new.txt")).hasContent("new");
        assertThat(wc.resolve("old.txt")).doesNotExist();
        assertThat(temp.resolve("checkout.old")).doesNotExist();
        assertThat(fresh).doesNotExist();
    }

    @Test
    void aWorkingCopyInUseIsKeptAndTheSwapRefused(@TempDir Path temp) throws Exception {
        org.junit.jupiter.api.Assumptions.assumeTrue(System.getProperty("os.name").toLowerCase().contains("win"),
                "only Windows refuses to rename a folder with an open file");
        Path wc = Files.createDirectories(temp.resolve("checkout"));
        Path open = Files.writeString(wc.resolve("old.txt"), "old");
        Path fresh = Files.createDirectories(temp.resolve("checkout.new"));
        try (var held = Files.newInputStream(open)) {
            org.assertj.core.api.Assertions.assertThatThrownBy(() -> ImportService.swapIn(fresh, wc)).isInstanceOf(java.io.IOException.class)
                    .hasMessageContaining("Could not set the old working copy aside");
        }
        assertThat(wc.resolve("old.txt")).hasContent("old");
    }

    @Test
    void aSwapStoppedHalfWayIsPutRight(@TempDir Path temp) throws Exception {
        Path wc = temp.resolve("checkout");
        Path old = Files.createDirectories(temp.resolve("checkout.old"));
        Files.writeString(old.resolve("old.txt"), "old");
        Files.createDirectories(temp.resolve("checkout.new"));

        ImportService.recoverWorkingCopy(wc);

        assertThat(wc.resolve("old.txt")).hasContent("old");
        assertThat(temp.resolve("checkout.old")).doesNotExist();
        assertThat(temp.resolve("checkout.new")).doesNotExist();

        // with the working copy there, a stale .old is only removed
        Files.createDirectories(temp.resolve("checkout.old"));
        ImportService.recoverWorkingCopy(wc);
        assertThat(wc.resolve("old.txt")).hasContent("old");
        assertThat(temp.resolve("checkout.old")).doesNotExist();
    }

    @Test
    void aMissingWorkingCopyIsNothingToRemove(@TempDir Path temp) {
        assertThatCode(() -> ImportService.deleteWorkingCopy(temp.resolve("none"))).doesNotThrowAnyException();
    }
}
