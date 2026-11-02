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

    @Test
    void aMissingWorkingCopyIsNothingToRemove(@TempDir Path temp) {
        assertThatCode(() -> ImportService.deleteWorkingCopy(temp.resolve("none"))).doesNotThrowAnyException();
    }
}
