package com.obdx.factory.design;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/** The order of a requirement's screens holds every screen, so Approve all approves what the page shows. */
class RequirementFlowsOrderTest {

    private static RequirementFlows.Screen screen(String name, String stage) {
        ScreenModel model = new ScreenModel(name, name, null, "new", List.of(), List.of(), stage, List.of());
        return new RequirementFlows.Screen(UUID.randomUUID(), name, model);
    }

    @Test
    void aStepOfAStepIsOrderedNotLeftOut() {
        RequirementFlows.Screen pay = screen("Pay", "initiate");
        RequirementFlows.Screen review = screen("Pay – Review", "review");
        // its initiate is itself a step, not a main screen: before, it was in no flow order at all
        RequirementFlows.Screen confirm = screen("Pay – Review – Confirm", "confirm");

        List<RequirementFlows.Screen> ordered = RequirementFlows.order(List.of(confirm, review, pay));

        assertThat(ordered).containsExactlyInAnyOrder(pay, review, confirm);
        assertThat(ordered.subList(0, 2)).containsExactly(pay, review);
    }
}
