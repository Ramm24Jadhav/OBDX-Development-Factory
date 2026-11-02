package com.obdx.factory.change;

import com.obdx.factory.common.NotFoundException;
import com.obdx.factory.requirements.RequirementService;
import com.obdx.factory.requirements.RequirementSpec;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * Requirement coverage of a change, from what its written files say: the generator is told to name each acceptance
 * criterion (AC-001) a test checks and each requirement (FR-001) the code implements. A criterion named in a test file
 * is covered by a test; named only in other files, it is implemented but not tested; named nowhere, it is not covered.
 * This is traceability from the code, not a test result: whether those tests pass is the build's job.
 */
@Service
public class ChangeCoverage {

    /** One criterion or requirement with the written files that name it. */
    public record Item(String id, String text, List<String> requirements, List<String> tests, List<String> code) {
    }

    /**
     * @param written how many planned files are written (named in the counts so a partial change is not read as fully
     *                traced)
     */
    public record Coverage(boolean hasSpec, int written, int planned, List<Item> criteria, List<Item> requirements) {
    }

    private final ChangeRequestRepository changes;
    private final ChangeFileStore files;
    private final RequirementService requirements;

    public ChangeCoverage(ChangeRequestRepository changes, ChangeFileStore files, RequirementService requirements) {
        this.changes = changes;
        this.files = files;
        this.requirements = requirements;
    }

    public Coverage coverage(UUID changeId) {
        ChangeRequest change = changes.findById(changeId).orElseThrow(() -> new NotFoundException("Change not found: " + changeId));
        RequirementSpec spec = null;
        if (change.getRequirementId() != null) {
            try {
                spec = requirements.get(change.getRequirementId()).spec();
            } catch (NotFoundException e) {
                // the requirement was deleted: nothing to trace to
            }
        }
        return of(spec, files.files(changeId));
    }

    static Coverage of(RequirementSpec spec, List<ChangeFileStore.ChangeFile> all) {
        List<ChangeFileStore.ChangeFile> written = all.stream().filter(f -> f.generated() != null
                && (f.status() == ChangeFileStore.Status.GENERATED || f.status() == ChangeFileStore.Status.UNCHANGED)).toList();
        if (spec == null) {
            return new Coverage(false, written.size(), all.size(), List.of(), List.of());
        }
        List<Item> criteria = new ArrayList<>();
        for (RequirementSpec.AcceptanceCriterion c : spec.acceptanceCriteria()) {
            if (c.id() != null && !c.id().isBlank()) {
                criteria.add(item(c.id(), c.description(), c.requirements() == null ? List.of() : c.requirements(), written));
            }
        }
        List<Item> functional = new ArrayList<>();
        for (RequirementSpec.FunctionalRequirement r : spec.requirements()) {
            if (r.id() != null && !r.id().isBlank()) {
                functional.add(item(r.id(), r.title() == null || r.title().isBlank() ? r.description() : r.title(), List.of(), written));
            }
        }
        return new Coverage(true, written.size(), all.size(), criteria, functional);
    }

    private static Item item(String id, String text, List<String> linked, List<ChangeFileStore.ChangeFile> written) {
        Pattern named = Pattern.compile("(?<![A-Za-z0-9-])" + Pattern.quote(id.strip()) + "(?![0-9])", Pattern.CASE_INSENSITIVE);
        List<String> tests = new ArrayList<>();
        List<String> code = new ArrayList<>();
        for (ChangeFileStore.ChangeFile f : written) {
            if (named.matcher(f.generated()).find()) {
                (isTest(f) ? tests : code).add(f.path());
            }
        }
        return new Item(id.strip(), text, linked, tests, code);
    }

    /** A test file: planned in the test layer, or named like one. */
    static boolean isTest(ChangeFileStore.ChangeFile f) {
        String path = f.path().toLowerCase(Locale.ROOT);
        return "test".equals(f.layer()) || path.contains("/test/") || path.contains("/tests/") || path.matches(".*(test|spec)\\.[a-z]+$");
    }
}
