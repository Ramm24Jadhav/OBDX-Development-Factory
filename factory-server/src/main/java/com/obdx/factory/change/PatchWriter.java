package com.obdx.factory.change;

import com.github.difflib.DiffUtils;
import com.github.difflib.UnifiedDiffUtils;
import com.github.difflib.patch.Patch;

import java.util.List;

/**
 * Writes changes as a unified diff in the format Subversion uses, so developers can apply it with TortoiseSVN
 * ("Apply Patch") or "svn patch" on a working copy at the base revision.
 */
public final class PatchWriter {

    public record FileChange(String path, String original, String revised) {
    }

    private PatchWriter() {
    }

    public static String write(List<FileChange> changes, Long baseRevision) {
        StringBuilder patch = new StringBuilder();
        for (FileChange change : changes) {
            List<String> before = lines(change.original());
            List<String> after = lines(change.revised());
            Patch<String> diff = DiffUtils.diff(before, after);
            if (diff.getDeltas().isEmpty()) {
                continue;
            }
            String from = change.original() == null ? "(nonexistent)" : "(revision " + (baseRevision == null ? "BASE" : baseRevision) + ")";
            patch.append("Index: ").append(change.path()).append('\n');
            patch.append("===================================================================\n");
            List<String> unified = UnifiedDiffUtils.generateUnifiedDiff(change.path() + "\t" + from,
                    change.path() + "\t(working copy)", before, diff, 3);
            for (String line : unified) {
                // For a new file the old range must be "-0,0" (the diff library writes "-1,0"), or patch tools fail.
                if (before.isEmpty() && line.startsWith("@@ -1,0 ")) {
                    line = "@@ -0,0 " + line.substring("@@ -1,0 ".length());
                }
                patch.append(line).append('\n');
            }
        }
        return patch.toString();
    }

    static List<String> lines(String text) {
        if (text == null || text.isEmpty()) {
            return List.of();
        }
        String normalized = text.replace("\r\n", "\n");
        List<String> lines = new java.util.ArrayList<>(List.of(normalized.split("\n", -1)));
        if (normalized.endsWith("\n")) {
            lines.removeLast();
        }
        return lines;
    }
}
