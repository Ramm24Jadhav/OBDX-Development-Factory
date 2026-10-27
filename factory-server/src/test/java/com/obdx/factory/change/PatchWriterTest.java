package com.obdx.factory.change;

import com.obdx.factory.svn.TestSvnRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

class PatchWriterTest {

    @TempDir
    Path temp;

    @Test
    void writesSubversionStyleUnifiedDiff() {
        String patch = PatchWriter.write(List.of(
                new PatchWriter.FileChange("ui/a.js", "line 1\nline 2\nline 3\n", "line 1\nline 2 changed\nline 3\n"),
                new PatchWriter.FileChange("ui/new.js", null, "new 1\nnew 2\n"),
                new PatchWriter.FileChange("ui/same.js", "x\n", "x\n")), 42L);

        assertThat(patch).startsWith("Index: ui/a.js\n===================================================================\n"
                + "--- ui/a.js\t(revision 42)\n+++ ui/a.js\t(working copy)\n@@ -1,3 +1,3 @@\n line 1\n-line 2\n+line 2 changed\n line 3\n");
        assertThat(patch).contains("--- ui/new.js\t(nonexistent)\n+++ ui/new.js\t(working copy)\n@@ -0,0 +1,2 @@\n+new 1\n+new 2\n");
        assertThat(patch).doesNotContain("same.js");
    }

    /** The patch applies with "svn patch", the same format TortoiseSVN's "Apply Patch" reads. */
    @Test
    void appliesWithSvnPatch() throws Exception {
        assumeTrue(TestSvnRepository.toolsAvailable(), "svn is not installed");
        TestSvnRepository repo = TestSvnRepository.create(temp.resolve("server"), Map.of(
                "ui/js/viewModels/transfer.js", "define([], function () {\n  return 1;\n});\n"));
        Path workingCopy = temp.resolve("wc");
        run(temp, "svn", "checkout", "--quiet", repo.trunkUrl(), workingCopy.toString());

        String patch = PatchWriter.write(List.of(
                new PatchWriter.FileChange("ui/js/viewModels/transfer.js", "define([], function () {\n  return 1;\n});\n",
                        "define([], function () {\n  return 2;\n});\n"),
                new PatchWriter.FileChange("ui/js/views/remarks.html", null, "<div>Remarks</div>\n")), 1L);
        Path patchFile = temp.resolve("change.patch");
        Files.writeString(patchFile, patch);
        run(workingCopy, "svn", "patch", patchFile.toString());

        assertThat(workingCopy.resolve("ui/js/viewModels/transfer.js")).hasContent("define([], function () {\n  return 2;\n});");
        assertThat(workingCopy.resolve("ui/js/views/remarks.html")).hasContent("<div>Remarks</div>");
    }

    private static void run(Path dir, String... command) throws Exception {
        Process process = new ProcessBuilder(command).directory(dir.toFile()).redirectErrorStream(true).start();
        String output = new String(process.getInputStream().readAllBytes());
        assertThat(process.waitFor(60, TimeUnit.SECONDS)).isTrue();
        assertThat(process.exitValue()).as(output).isZero();
    }
}
