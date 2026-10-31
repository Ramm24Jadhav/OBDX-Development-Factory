package com.obdx.factory.change;

import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;

/** A link in the bank's code that leads outside the working copy is not read. */
class WorkingCopyLinksTest {

    @TempDir
    Path temp;

    @Test
    void readsOnlyFilesThatAreReallyInTheWorkingCopy() throws IOException {
        Path workingCopy = Files.createDirectories(temp.resolve("wc"));
        Path inside = Files.writeString(Files.createDirectories(workingCopy.resolve("src")).resolve("A.java"), "class A {}");
        Path secret = Files.writeString(temp.resolve("secret.properties"), "password=x");

        assertThat(ChangeService.within(workingCopy, inside)).isTrue();
        assertThat(ChangeService.within(workingCopy, workingCopy.resolve("src/../../secret.properties"))).isFalse();
        assertThat(ChangeService.within(workingCopy, workingCopy.resolve("src/Missing.java"))).isFalse();

        Path link = workingCopy.resolve("src/B.java");
        try {
            Files.createSymbolicLink(link, secret);
        } catch (IOException | UnsupportedOperationException e) {
            Assumptions.abort("This computer does not allow symbolic links here: " + e.getMessage());
        }
        assertThat(ChangeService.within(workingCopy, link)).isFalse();
    }
}
