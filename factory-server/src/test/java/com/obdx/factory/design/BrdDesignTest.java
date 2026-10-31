package com.obdx.factory.design;

import com.obdx.factory.requirements.RequirementSpec;
import com.obdx.factory.requirements.SpecParser;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/** First designs for QA's BRDs, with their own wording. */
class BrdDesignTest {

    private static RequirementSpec.Field field(String name, String label, String type, Boolean mandatory, List<String> validations, String notes) {
        return new RequirementSpec.Field(name, label, type, mandatory, validations, null, null, notes);
    }

    private static RequirementSpec.Screen screen(String name, List<RequirementSpec.Field> fields, List<RequirementSpec.Action> actions) {
        return new RequirementSpec.Screen(name, "new", null, null, fields, actions, List.of());
    }

    @Test
    void brd5IsMobileAppOnly() {
        RequirementSpec spec = SpecParser.parse("""
                {"title": "Corporate maker approvals", "summary": "The CorporateMaker reviews pending approvals in the mobile app.",
                 "scope": ["Mobile app only for CorporateMaker users.", "Desktop and tablet are unchanged."]}
                """, "x");
        String document = """
                # 3. Scope
                Mobile app only for CorporateMaker users. Desktop and tablet are unchanged.
                # 9. Error messages
                | Code | Message |
                | --- | --- |
                | E-01 | "Use desktop banking to approve bulk files." |
                # 12. Open questions
                Should the same list appear on the tablet app? No.
                The draft is kept in the browser's local storage.
                """;

        assertThat(ScreenDesignService.channels(spec, document)).containsExactly("mobile-app");
    }

    @Test
    void brd3IsDesktopAndMobileWebFromItsNonFunctionalRequirement() {
        RequirementSpec spec = SpecParser.parse("""
                {"title": "Retail dashboard transfer widget", "summary": "A quick transfer widget on the Retail Dashboard in internet banking."}
                """, "x");
        String document = """
                # 12. Non-Functional Requirements
                | ID | Category | Requirement |
                | --- | --- | --- |
                | NFR-003 | Channels | The widget is available on desktop and mobile web. |
                """;

        assertThat(ScreenDesignService.channels(spec, document)).containsExactly("desktop", "mobile-web");
        assertThat(ScreenModels.channelsIn("Should the widget appear on the tablet app? Not in scope.")).isEmpty();
        assertThat(ScreenModels.channelsIn("Saved in the browser's local storage")).isEmpty();
        assertThat(ScreenModels.channelsIn("The error says 'Use desktop banking instead'")).isEmpty();
    }

    @Test
    void shownAndMandatoryWhenTransferTimingIsLater() {
        RequirementSpec.Field timing = field("transferTiming", "Transfer Timing", "radio", true, List.of("One of: Now, Later"), null);
        RequirementSpec.Field date = field("transferDate", "Transfer Date", "date", null, List.of(), "Shown and mandatory when Transfer Timing is Later");

        List<ScreenModel.Component> c = ScreenModels.fromSpec(screen("Quick Transfer", List.of(timing, date), List.of()))
                .sections().getFirst().components();

        ScreenModel.Condition later = new ScreenModel.Condition(c.get(0).id(), "equals", "Later");
        assertThat(c.get(1).visibleWhen()).isEqualTo(later);
        assertThat(c.get(1).requiredWhen()).isEqualTo(later);
    }

    @Test
    void theRetailDashboardWidgetKeepsItsInputsAndItsReviewShowsThem() {
        RequirementSpec.Field from = field("fromAccount", "From Account", "dropdown", true, List.of(), null);
        RequirementSpec.Field amount = field("amount", "Amount", "amount", true, List.of("Up to 13 digits and 2 decimals"), null);
        RequirementSpec.Field to = field("transferTo", "User selection (Own Account / Payee)", "radio", true, List.of(), null);

        ScreenModel widget = ScreenModels.fromSpec(screen("Retail Dashboard", List.of(from, amount, to), List.of()));

        assertThat(widget.stage()).isEqualTo("initiate");
        assertThat(widget.sections().getFirst().components()).extracting(ScreenModel.Component::type)
                .containsExactly("select", "amount", "radio");
        // "13 digits" sizes the amount; it is no length in characters
        assertThat(widget.sections().getFirst().components().get(1).maxLength()).isNull();
        assertThat(widget.sections().getFirst().components().get(2).options()).containsExactly("Own Account", "Payee");

        ScreenModel review = ScreenModels.fromSpec(screen("Review Transfer", List.of(), List.of()));
        assertThat(ScreenDesignService.capturesInput(widget)).isTrue();
        assertThat(ScreenDesignService.stepAfter(review, widget).sections().getFirst().components()).extracting(ScreenModel.Component::name)
                .containsExactly("fromAccount", "amount", "transferTo");
        assertThat(ScreenModels.valuesInParentheses("Date (DD/MM/YYYY)")).isEmpty();
    }

    @Test
    void aLoneDoneGetsTheWayBackAndAListThatCancelsGetsCancel() {
        ScreenModel done = ScreenModels.fromSpec(screen("Standing Instruction Confirmation", List.of(),
                List.of(new RequirementSpec.Action("Done", null))));
        assertThat(done.actions()).extracting(ScreenModel.ActionButton::label).containsExactly("Done", "Go to dashboard");

        RequirementSpec spec = SpecParser.parse("""
                {"title": "x", "requirements": [{"id": "FR-006", "title": "Cancel instruction",
                  "description": "The customer can cancel a standing instruction from the list.", "screens": ["Standing Instruction List"]}]}
                """, "x");
        ScreenModel list = ScreenModels.fromSpec(screen("Standing Instruction List",
                List.of(field("beneficiary", null, "text", null, List.of(), null)), List.of()));
        assertThat(ScreenDesignService.withRequirementActions(list, spec).actions()).extracting(ScreenModel.ActionButton::label)
                .containsExactly("Back", "Cancel");
    }

    @Test
    void theLastFiveRunsAreATable() {
        RequirementSpec.Field runs = field("recentRuns", "Last five runs", "text", null, List.of(), "Date, amount and status of each execution");
        RequirementSpec.Field name = field("instructionName", "Instruction name", "text", true, List.of(), null);

        List<ScreenModel.Component> c = ScreenModels.fromSpec(screen("Standing Instruction", List.of(name, runs), List.of()))
                .sections().getFirst().components();

        assertThat(c.get(1).type()).isEqualTo("table");
        assertThat(c.get(0).type()).isEqualTo("text");
    }
}
