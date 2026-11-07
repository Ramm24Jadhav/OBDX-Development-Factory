package com.obdx.factory.design;

import com.obdx.factory.requirements.RequirementSpec;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/** The Design Studio's checks: which criteria each screen helps meet, values the BRD leaves open, unanswered questions. */
class RequirementFlowsCoverageTest {

    private static ScreenModel.Component field(String type, String label, List<String> options, ScreenModel.DataSource source) {
        return new ScreenModel.Component(null, type, label.toLowerCase().replace(' ', '_'), label, null, null, null, null, null,
                options, List.of(), null, null, Map.of(), null, null, null, source, null, null);
    }

    private static RequirementFlows.Screen screen(String name, String stage, ScreenModel.Component... fields) {
        ScreenModel model = new ScreenModel(name, name, null, "new", List.of(new ScreenModel.Section("s", "Details", 1, List.of(fields))),
                List.of(), stage, List.of());
        return new RequirementFlows.Screen(UUID.randomUUID(), name, model);
    }

    private static final RequirementFlows.Screen ADD = screen("Add Beneficiary", "initiate", field("text", "Name", List.of(), null));
    private static final RequirementFlows.Screen REVIEW = screen("Add Beneficiary – Review", "review", field("display", "Name", List.of(), null));
    private static final RequirementFlows.Screen LIMITS = screen("Transfer Limits", null, field("text", "Daily limit", List.of(), null));

    private static RequirementSpec spec(List<RequirementSpec.AcceptanceCriterion> criteria, List<RequirementSpec.OpenQuestion> questions) {
        return new RequirementSpec("Beneficiaries", null, List.of(), List.of(), List.of(), List.of(), List.of(), List.of(), questions,
                List.of(), List.of(), List.of(), List.of(),
                List.of(new RequirementSpec.FunctionalRequirement("FR-001", "Add beneficiary", null, "Must", List.of("Add Beneficiary")),
                        new RequirementSpec.FunctionalRequirement("FR-002", "Limits", null, "Should", List.of("Transfer Limits")),
                        new RequirementSpec.FunctionalRequirement("FR-003", "Audit", null, "Must", List.of())),
                criteria, List.of());
    }

    @Test
    void aScreenMeetsTheCriteriaOfItsRequirementsAndNamedOnesNarrowThem() {
        RequirementSpec spec = spec(List.of(
                new RequirementSpec.AcceptanceCriterion("AC-001", "The payee is added", List.of("FR-001")),
                new RequirementSpec.AcceptanceCriterion("AC-002", "The Add Beneficiary – Review screen shows the name", List.of("FR-001")),
                new RequirementSpec.AcceptanceCriterion("AC-003", "Limits are saved", List.of("FR-002")),
                new RequirementSpec.AcceptanceCriterion("AC-004", "Every change is logged", List.of("FR-003")),
                new RequirementSpec.AcceptanceCriterion(null, "Works on phones", List.of())), List.of());
        List<RequirementFlows.Screen> ordered = RequirementFlows.order(List.of(ADD, LIMITS, REVIEW));
        Map<UUID, List<String>> byScreen = RequirementFlows.criteriaByScreen(ordered, RequirementFlows.flows(spec, ordered));

        assertThat(byScreen.get(ADD.id())).containsExactly("AC-001");
        assertThat(byScreen.get(REVIEW.id())).containsExactly("AC-001", "AC-002");
        assertThat(byScreen.get(LIMITS.id())).containsExactly("AC-003");
        // A requirement without screens, and a criterion without a requirement (named by its text), are not covered
        assertThat(RequirementFlows.uncovered(spec.acceptanceCriteria(), byScreen)).containsExactly("AC-004", "Works on phones");
    }

    @Test
    void choicesWithoutValuesFromTheBrdNeedConfirming() {
        RequirementFlows.Screen screen = screen("Transfer", "initiate",
                field("select", "Purpose", List.of("Option 1", "Option 2"), null),
                field("radio", "Frequency", List.of("Daily", "Weekly"), null),
                field("table", "Recent transfers", List.of("Column 1", "Column 2"), null),
                field("select", "From account", List.of(), new ScreenModel.DataSource("GET /digx/v1/accounts", null, null, null)),
                field("checkbox", "Notify by", List.of(), null),
                field("text", "Remarks", List.of(), null));

        assertThat(RequirementFlows.unconfirmed(screen.model())).containsExactly("Purpose", "Recent transfers", "Notify by");
        assertThat(RequirementFlows.unconfirmed(null)).isEmpty();
    }

    @Test
    void unansweredQuestionsNameTheRequirementsAndScreensTheyMention() {
        RequirementSpec spec = spec(List.of(), List.of(
                new RequirementSpec.OpenQuestion("Is there a cooling period for FR-001?", null, "Section 4", List.of("Yes", "No"), "Yes", null),
                new RequirementSpec.OpenQuestion("What is the maximum on Transfer Limits?", "Not stated", null, List.of(), null, " "),
                new RequirementSpec.OpenQuestion("Which branding applies?", null, null, List.of(), null, null),
                new RequirementSpec.OpenQuestion("Answered already?", null, null, List.of(), null, "Yes")));
        List<RequirementFlows.Screen> ordered = RequirementFlows.order(List.of(ADD, LIMITS));

        List<RequirementFlows.Question> questions = RequirementFlows.unresolved(spec, ordered);

        assertThat(questions).extracting(RequirementFlows.Question::question)
                .containsExactly("Is there a cooling period for FR-001?", "What is the maximum on Transfer Limits?", "Which branding applies?");
        assertThat(questions.get(0).requirements()).containsExactly("FR-001");
        assertThat(questions.get(0).screens()).isEmpty();
        assertThat(questions.get(1).screens()).containsExactly(LIMITS.id());
        assertThat(questions.get(2).requirements()).isEmpty();
        assertThat(RequirementFlows.unresolved(null, ordered)).isEmpty();
    }

    @Test
    void fieldsTheBrdDoesNotSayAreMandatoryAreOpenDecisions() {
        RequirementSpec.Screen source = new RequirementSpec.Screen("Add  beneficiary", "unknown", null, null, List.of(
                new RequirementSpec.Field("name", "Name", "text", null, List.of(), null, null, null),
                new RequirementSpec.Field("nickname", "Nickname", "text", null, List.of(), null, null, null),
                new RequirementSpec.Field("account", "Account", "text", true, List.of(), null, null, null),
                new RequirementSpec.Field("bank", "Bank", "text", null, List.of(), null, null, null)), List.of(), List.of());
        RequirementSpec spec = new RequirementSpec("Beneficiaries", null, List.of(source), List.of(), List.of(), List.of(), List.of(),
                List.of(), List.of(), List.of());
        ScreenModel.Component name = new ScreenModel.Component(null, "text", "name", "Name", null, null, null, null, null, List.of(), List.of(), null);
        // Someone has made the nickname mandatory since; the bank is only shown
        ScreenModel.Component nickname = new ScreenModel.Component(null, "text", "nickname", "Nickname", true, null, null, null, null, List.of(), List.of(), null);
        ScreenModel.Component bank = new ScreenModel.Component(null, "display", "bank", "Bank", null, null, null, null, null, List.of(), List.of(), true);
        RequirementFlows.Screen screen = new RequirementFlows.Screen(UUID.randomUUID(), "Add Beneficiary", new ScreenModel("Add Beneficiary",
                "Add Beneficiary", null, "unknown", List.of(new ScreenModel.Section("s", null, 1, List.of(name, nickname, bank))), List.of(), "initiate", List.of()));

        assertThat(RequirementFlows.openDecisions(spec, screen)).containsExactly(
                "New screen, or a change to an existing OBDX screen? The BRD does not say.",
                "Is \"Name\" mandatory? The BRD does not say.");
        // A screen the spec does not list (a review step, a renamed screen) has none
        assertThat(RequirementFlows.openDecisions(spec, REVIEW)).isEmpty();
    }
}
