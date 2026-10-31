package com.obdx.factory.design;

import com.obdx.factory.requirements.RequirementSpec;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertTimeoutPreemptively;

/** Long validation and note texts are read quickly when a design is drafted. */
class LongInputDesignTest {

    @Test
    void aLongNoteDoesNotSlowTheDesignDown() {
        String note = "Shown when " + "x ".repeat(5_000) + "is selected";
        String validation = "max " + "9".repeat(10_000) + " values: " + "a, ".repeat(3_000);
        RequirementSpec.Field field = new RequirementSpec.Field("remarks", null, "select", false, List.of(validation), null, null, note);
        RequirementSpec.Screen screen = new RequirementSpec.Screen("Remarks", "new", null, null, List.of(field), List.of(), List.of());

        ScreenModel model = assertTimeoutPreemptively(Duration.ofSeconds(2), () -> ScreenModels.fromSpec(screen));

        assertThat(model.sections().getFirst().components().getFirst().visibleWhen()).isNull();
    }
}
