package com.obdx.factory.change;

import com.obdx.factory.pack.CheckScope;
import com.obdx.factory.pack.LocalChecks;
import com.obdx.factory.pack.VersionPacks;
import org.junit.jupiter.api.Test;
import org.springframework.util.unit.DataSize;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** A file the cross-check fails is fixed once after generation, and only when the fix is whole and no worse. */
class CrossFileFixTest {

    private static final UUID CHANGE = UUID.randomUUID();
    private static final String PATH = "backend/src/com/bank/x/Resource.java";
    private static final String WRITTEN = "package com.bank.x;\n\npublic class Resource {\n    void run(Service s) {\n        s.save();\n    }\n}\n";
    private static final String FIXED = "package com.bank.x;\n\npublic class Resource {\n    void run(Service s) {\n        s.store();\n    }\n}\n";
    private static final String FINDINGS = "Fix these problems found by comparing this file with the other files of the change:\n"
            + "- Calls methods that Service does not have: save().";

    private final ContinuedTestsTest.Scripted model = new ContinuedTestsTest.Scripted();
    private final LocalChecks checks = new LocalChecks(VersionPacks.builtIn());
    private final CodeGenerator generator = new CodeGenerator(model, new ChangeProperties(30, 25, DataSize.ofKilobytes(80), 2,
            "branches/factory", "-"), checks);
    private final ChangeContext context = new ChangeContext("x", "{\"screens\": []}", "[]", "- Java version: Java 8", "backend/: 3");
    private final ChangePlan.Item item = new ChangePlan.Item(PATH, "create", "service", "REST resource", List.of(), null);
    private final ChangePlan plan = new ChangePlan("x", List.of(item), List.of());

    private static ChangeFileStore.ChangeFile file(String path, boolean edited, String generated) {
        return new ChangeFileStore.ChangeFile(0, path, "create", "service", null, ChangeFileStore.Status.GENERATED, null, generated, edited,
                FileChecks.Status.FAILED, "Calls methods that Service does not have: save().", 1);
    }

    private ChangeFileStore store(ChangeFileStore.ChangeFile file) {
        ChangeFileStore files = mock(ChangeFileStore.class);
        when(files.file(CHANGE, PATH)).thenReturn(Optional.of(file));
        when(files.files(CHANGE)).thenReturn(List.of(file));
        return files;
    }

    private boolean fit(ChangeFileStore files) {
        return ChangeService.fitToOthers(files, generator, checks, CheckScope.none(), CHANGE, context, plan, item, FINDINGS, null);
    }

    @Test
    void aWholeFixThatIsNoWorseIsKept() {
        ChangeFileStore files = store(file(PATH, false, WRITTEN));
        model.replies.add(FIXED);

        assertThat(fit(files)).isTrue();

        verify(files).saveResult(eq(CHANGE), eq(PATH), eq(ChangeFileStore.Status.GENERATED), any(), eq(FIXED), eq(false), any(), anyInt());
        // one call, with the file and the findings
        assertThat(model.prompts).singleElement().asString().contains("s.save();", "does not have: save()");
    }

    @Test
    void aFixCutOffAtTheOutputLimitLeavesTheFileAsWritten() {
        ChangeFileStore files = store(file(PATH, false, WRITTEN));
        model.replies.add("CUT:package com.bank.x;\n\npublic class Resource {\n");
        for (int i = 0; i < CodeGenerator.MAX_CONTINUATIONS; i++) {
            model.replies.add("CUT:public class Resource {\n");
        }

        assertThat(fit(files)).isFalse();

        verify(files, never()).saveResult(any(), anyString(), any(), any(), any(), anyBoolean(), any(), anyInt());
    }

    @Test
    void aFixThatBreaksTheFileIsNotKept() {
        ChangeFileStore files = store(file(PATH, false, WRITTEN));
        model.replies.add("package com.bank.x;\n\npublic class Resource {\n    void run(Service s) {\n        s.store(\n    }\n}\n");

        assertThat(fit(files)).isFalse();

        verify(files, never()).saveResult(any(), anyString(), any(), any(), any(), anyBoolean(), any(), anyInt());
    }

    @Test
    void aReviewersEditIsNeverRewritten() {
        ChangeFileStore files = store(file(PATH, true, WRITTEN));

        assertThat(fit(files)).isFalse();

        assertThat(model.prompts).isEmpty();
        verify(files, never()).saveResult(any(), anyString(), any(), any(), any(), anyBoolean(), any(), anyInt());
    }

    @Test
    void onlyTheModelsFilesOfThisRunAreFixedAndAtMostAFew() {
        Map<String, String> unfit = new java.util.LinkedHashMap<>();
        List<ChangeFileStore.ChangeFile> all = new java.util.ArrayList<>();
        for (int i = 0; i < 8; i++) {
            unfit.put("F" + i + ".java", "x");
            all.add(file("F" + i + ".java", i == 1, WRITTEN));
        }
        Set<String> writtenNow = new java.util.HashSet<>(unfit.keySet());
        writtenNow.remove("F2.java");

        // F1 was edited by a reviewer, F2 written before this run (Continue)
        assertThat(ChangeService.toFit(unfit, writtenNow, all)).containsExactly("F0.java", "F3.java", "F4.java", "F5.java", "F6.java");
        assertThat(ChangeService.toFit(unfit, Set.of(), all)).isEmpty();
    }
}
