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

    @Test
    void aMissingWorkingCopyIsNothingToRemove(@TempDir Path temp) {
        assertThatCode(() -> ImportService.deleteWorkingCopy(temp.resolve("none"))).doesNotThrowAnyException();
    }
}
