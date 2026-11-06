package com.obdx.factory.design;

import com.obdx.factory.requirements.RequirementSpec;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/** The Design Studio's mapping: screens in flow order, by functional requirement, with their rules and criteria. */
class RequirementFlowsTest {

    private static RequirementFlows.Screen screen(String name, String stage, boolean input) {
        ScreenModel.Component field = new ScreenModel.Component(null, input ? "text" : "display", "f", "Field", null, null, null,
                null, null, List.of(), List.of(), input ? null : true);
        ScreenModel model = new ScreenModel(name, name, null, "new", List.of(new ScreenModel.Section("s", "Details", 1, List.of(field))),
                List.of(), stage, List.of());
        return new RequirementFlows.Screen(UUID.randomUUID(), name, model);
    }

    private static final RequirementFlows.Screen LIST = screen("Beneficiary List", "inquiry", false);
    private static final RequirementFlows.Screen ADD = screen("Add Beneficiary", "initiate", true);
    private static final RequirementFlows.Screen LIMITS = screen("Transfer Limits", null, true);
    // Made later from Add Beneficiary, so created after Transfer Limits
    private static final RequirementFlows.Screen CONFIRM = screen("Add Beneficiary – Confirmation", "confirm", false);
    private static final RequirementFlows.Screen REVIEW = screen("Add Beneficiary – Review", "review", false);

    private static final RequirementSpec SPEC = new RequirementSpec("Beneficiaries", null, List.of(),
            List.of(new RequirementSpec.BusinessRule("BR-01", "At most 10 beneficiaries a day", List.of("add beneficiary"), null),
                    new RequirementSpec.BusinessRule("BR-02", "Limits are per day", List.of("Transfer Limits"), null)),
            List.of(), List.of(), List.of(), List.of(), List.of(), List.of(), List.of(), List.of(), List.of(),
            List.of(new RequirementSpec.FunctionalRequirement("FR-001", "Add beneficiary", "Add a payee", "Must",
                            List.of("Beneficiary List", "Add  Beneficiary")),
                    new RequirementSpec.FunctionalRequirement("FR-002", "Limits", "Set limits", "Should", List.of("Transfer Limits")),
                    new RequirementSpec.FunctionalRequirement("FR-003", "Audit", "Log every change", "Must", List.of())),
            List.of(new RequirementSpec.AcceptanceCriterion("AC-001", "The payee is added", List.of("fr-001"))),
            List.of());

    @Test
    void reviewAndConfirmationFollowTheirInitiateScreen() {
        List<RequirementFlows.Screen> ordered = RequirementFlows.order(List.of(LIST, ADD, LIMITS, CONFIRM, REVIEW));

        assertThat(ordered).containsExactly(LIST, ADD, REVIEW, CONFIRM, LIMITS);
    }

    @Test
    void eachRequirementGetsItsScreensRulesAndCriteria() {
        List<RequirementFlows.Screen> ordered = RequirementFlows.order(List.of(LIST, ADD, LIMITS, CONFIRM, REVIEW));
        List<RequirementFlows.Flow> flows = RequirementFlows.flows(SPEC, ordered);

        assertThat(flows).extracting(RequirementFlows.Flow::id).containsExactly("FR-001", "FR-002", "FR-003");
        // Names match whatever the spaces and case; the steps made from Add Beneficiary come with it
        assertThat(flows.get(0).screens()).containsExactly(LIST.id(), ADD.id(), REVIEW.id(), CONFIRM.id());
        assertThat(flows.get(0).rules()).extracting(RequirementSpec.BusinessRule::id).containsExactly("BR-01");
        assertThat(flows.get(0).criteria()).extracting(RequirementSpec.AcceptanceCriterion::id).containsExactly("AC-001");
        assertThat(flows.get(1).screens()).containsExactly(LIMITS.id());
        assertThat(flows.get(2).screens()).isEmpty();
    }

    @Test
    void screensNoRequirementNamesAreOthers() {
        RequirementFlows.Screen renamed = screen("Payee Search", null, true);
        List<RequirementFlows.Screen> ordered = RequirementFlows.order(List.of(LIST, renamed, LIMITS));

        assertThat(RequirementFlows.others(ordered, RequirementFlows.flows(SPEC, ordered))).containsExactly(renamed.id());
        // Without functional requirements every screen is an "other" one
        assertThat(RequirementFlows.others(ordered, RequirementFlows.flows(null, ordered))).hasSize(3);
    }

    @Test
    void anInputScreenWithoutReviewNeedsSteps() {
        List<RequirementFlows.Screen> withSteps = RequirementFlows.order(List.of(LIST, ADD, LIMITS, CONFIRM, REVIEW));

        assertThat(RequirementFlows.needsSteps(ADD, withSteps)).isFalse();
        assertThat(RequirementFlows.needsSteps(LIMITS, withSteps)).isTrue();
        // Lists and the steps themselves never need more
        assertThat(RequirementFlows.needsSteps(LIST, withSteps)).isFalse();
        assertThat(RequirementFlows.needsSteps(REVIEW, withSteps)).isFalse();
        assertThat(RequirementFlows.needsSteps(ADD, RequirementFlows.order(List.of(LIST, ADD)))).isTrue();
    }
}
