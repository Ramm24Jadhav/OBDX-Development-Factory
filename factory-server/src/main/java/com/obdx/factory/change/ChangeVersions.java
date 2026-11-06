package com.obdx.factory.change;

import com.github.difflib.DiffUtils;
import com.github.difflib.patch.AbstractDelta;
import com.github.difflib.patch.Patch;
import com.obdx.factory.common.BadRequestException;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.TreeSet;
import java.util.UUID;

/**
 * The versions of a change: its files' revisions (V39) grouped into the writes they came from (a first generation, a
 * Write again with a note, an edit), and what changed between two of them, file by file.
 */
@Service
public class ChangeVersions {

    /** Writes closer together than this belong to the same version (a generation writes its files one after another). */
    static final Duration SAME_WRITE = Duration.ofMinutes(2);

    /** n: 1 for the first version; upTo: its last revision; label: first version, written again or edited. */
    public record Version(int n, long upTo, OffsetDateTime at, int files, String label) {
    }

    public record FileDifference(String path, boolean added, int linesAdded, int linesRemoved, String diff) {
    }

    public record Comparison(Version from, Version to, List<FileDifference> files) {
    }

    private final ChangeFileStore files;

    public ChangeVersions(ChangeFileStore files) {
        this.files = files;
    }

    public List<Version> versions(UUID changeId) {
        return group(files.revisions(changeId));
    }

    static List<Version> group(List<ChangeFileStore.Revision> revisions) {
        List<Version> out = new ArrayList<>();
        List<ChangeFileStore.Revision> batch = new ArrayList<>();
        for (ChangeFileStore.Revision r : revisions) {
            if (!batch.isEmpty() && Duration.between(batch.getLast().writtenAt(), r.writtenAt()).compareTo(SAME_WRITE) > 0) {
                out.add(version(out.size() + 1, batch));
                batch = new ArrayList<>();
            }
            batch.add(r);
        }
        if (!batch.isEmpty()) {
            out.add(version(out.size() + 1, batch));
        }
        return out;
    }

    private static Version version(int n, List<ChangeFileStore.Revision> batch) {
        boolean edited = batch.stream().allMatch(ChangeFileStore.Revision::edited);
        String label = n == 1 ? "first version" : edited ? "edited" : "written again";
        return new Version(n, batch.getLast().id(), batch.getLast().writtenAt(), (int) batch.stream().map(ChangeFileStore.Revision::path).distinct().count(), label);
    }

    public Comparison compare(UUID changeId, int from, int to) {
        List<Version> all = versions(changeId);
        if (all.size() < 2) {
            throw new BadRequestException("This change has one version only: nothing was written again or edited since it was first written.");
        }
        Version a = pick(all, from);
        Version b = pick(all, to);
        Map<String, String> before = files.contentAt(changeId, a.upTo());
        Map<String, String> after = files.contentAt(changeId, b.upTo());
        TreeSet<String> paths = new TreeSet<>(before.keySet());
        paths.addAll(after.keySet());
        List<FileDifference> out = new ArrayList<>();
        for (String path : paths) {
            String x = before.get(path);
            String y = after.get(path);
            if (Objects.equals(x, y)) {
                continue;
            }
            out.add(difference(path, x, y));
        }
        return new Comparison(a, b, out);
    }

    static FileDifference difference(String path, String before, String after) {
        Patch<String> patch = DiffUtils.diff(PatchWriter.lines(before), PatchWriter.lines(after));
        int added = 0;
        int removed = 0;
        for (AbstractDelta<String> d : patch.getDeltas()) {
            added += d.getTarget().size();
            removed += d.getSource().size();
        }
        String diff = PatchWriter.write(List.of(new PatchWriter.FileChange(path, before, after == null ? "" : after)), null);
        return new FileDifference(path, before == null, added, removed, diff);
    }

    private static Version pick(List<Version> all, int n) {
        return all.stream().filter(v -> v.n() == n).findFirst()
                .orElseThrow(() -> new BadRequestException("There is no version " + n + "; this change has " + all.size() + "."));
    }
}
