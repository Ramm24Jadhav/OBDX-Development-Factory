package com.obdx.factory.design;

import com.obdx.factory.requirements.RequirementSpec;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/** First designs drafted from a spec: channels, steps of a transaction, lengths, options, conditions and lists. */
class DesignFromSpecTest {

    private static RequirementSpec.Field field(String name, String type, List<String> validations, String notes) {
        return new RequirementSpec.Field(name, null, type, true, validations, null, null, notes);
    }

    private static RequirementSpec.Screen screen(String name, List<RequirementSpec.Field> fields) {
        return new RequirementSpec.Screen(name, "new", null, null, fields, List.of(), List.of());
    }

    @Test
    void channelsAreTheOnesNamedAndNotTheOnesExcluded() {
        assertThat(ScreenModels.channelsIn("Available in internet or mobile banking.")).containsExactly("desktop", "mobile-app");
        assertThat(ScreenModels.channelsIn("Retail customers use the mobile app. The desktop must see no change. The tablet app is unchanged."))
                .containsExactly("mobile-app");
        assertThat(ScreenModels.channelsIn("Desktop browser only")).containsExactly("desktop");
        assertThat(ScreenModels.channelsIn("Corporate banking is out of scope.")).isEmpty();

        // the spec's own words first, the whole document only when the spec names none
        RequirementSpec spec = com.obdx.factory.requirements.SpecParser.parse("{\"title\": \"x\", \"summary\": \"Show the widget in mobile banking.\"}", "x");
        assertThat(ScreenDesignService.channels(spec, "Internet banking users see the old dashboard.")).containsExactly("mobile-app");
        assertThat(ScreenDesignService.channels(com.obdx.factory.requirements.SpecParser.parse("{\"title\": \"x\", \"summary\": \"Show the widget.\"}", "x"),
                "Internet banking only.")).containsExactly("desktop");
    }

    @Test
    void reviewAndConfirmationScreensShowTheFieldsWithTheirOwnActions() {
        ScreenModel review = ScreenModels.fromSpec(screen("Review Transfer", List.of(field("amount", "amount", List.of("max length 15"), null))));
        assertThat(review.stage()).isEqualTo("review");
        assertThat(review.sections().getFirst().components()).extracting(ScreenModel.Component::type, ScreenModel.Component::readonly)
                .containsExactly(org.assertj.core.groups.Tuple.tuple("display", true));
        assertThat(review.actions()).extracting(ScreenModel.ActionButton::label).containsExactly("Confirm", "Back", "Cancel");

        ScreenModel done = ScreenModels.fromSpec(screen("Transfer Confirmation", List.of()));
        assertThat(done.actions()).extracting(ScreenModel.ActionButton::label).containsExactly("Go to dashboard", "Start another");

        // a review the spec drafted with a single text field shows the initiate screen's fields instead
        ScreenModel initiate = ScreenModels.fromSpec(screen("Fund Transfer", List.of(field("fromAccount", "account", List.of(), null),
                field("amount", "amount", List.of(), null), field("remarks", "text", List.of(), null))));
        ScreenModel thin = ScreenModels.fromSpec(screen("Review Transfer", List.of(field("details", "text", List.of(), null))));
        ScreenModel shown = ScreenDesignService.stepAfter(thin, initiate);
        assertThat(shown.name()).isEqualTo("Review Transfer");
        assertThat(shown.sections().getFirst().components()).extracting(ScreenModel.Component::name)
                .containsExactly("fromAccount", "amount", "remarks");
        assertThat(shown.actions()).extracting(ScreenModel.ActionButton::label).containsExactly("Confirm", "Back", "Cancel");
    }

    @Test
    void onlyALengthIsTakenAsMaxLength() {
        assertThat(ScreenModels.maxLengthIn("max length 35", null)).isEqualTo(35);
        assertThat(ScreenModels.maxLengthIn("Maximum length: 140", null)).isEqualTo(140);
        assertThat(ScreenModels.maxLengthIn("max 35 characters", null)).isEqualTo(35);
        assertThat(ScreenModels.maxLengthIn("up to 20 chars", null)).isEqualTo(20);
        assertThat(ScreenModels.maxLengthIn("Max 5 chips", null)).isNull();
        assertThat(ScreenModels.maxLengthIn("Max 2 decimals", null)).isNull();
        assertThat(ScreenModels.maxLengthIn("Maximum 1,000,000", 10)).isEqualTo(10);
        // a minimum is not a maximum, and does not replace one found before
        assertThat(ScreenModels.maxLengthIn("Minimum length 6", null)).isNull();
        assertThat(ScreenModels.maxLengthIn("Min length 8", 20)).isEqualTo(20);
        assertThat(ScreenModels.maxLengthIn("min. length 8", null)).isNull();
        assertThat(ScreenModels.maxLengthIn("length 10", null)).isEqualTo(10);
        ScreenModel password = ScreenModels.fromSpec(screen("Change Password", List.of(field("newPassword", "text",
                List.of("Max length 20", "Min length 8"), null))));
        assertThat(password.sections().getFirst().components().getFirst().maxLength()).isEqualTo(20);
    }

    @Test
    void aStepWhereTheCustomerEntersASecretTakesInput() {
        ScreenModel otp = ScreenModels.fromSpec(screen("Verify OTP", List.of(field("otp", "text", List.of("6 digits"), null))));
        assertThat(otp.stage()).isEqualTo("initiate");
        assertThat(otp.sections().getFirst().components().getFirst().type()).isEqualTo("text");

        ScreenModel pin = ScreenModels.fromSpec(screen("Confirm Transfer", List.of(field("transactionPin", "password", List.of(), null))));
        assertThat(pin.stage()).isEqualTo("initiate");
        assertThat(pin.sections().getFirst().components().getFirst().readonly()).isNull();

        // a review's own field is never replaced by the previous screen's fields; a placeholder is
        ScreenModel initiate = ScreenModels.fromSpec(screen("Fund Transfer", List.of(field("amount", "amount", List.of(), null))));
        ScreenModel ownField = ScreenModels.fromSpec(screen("Review Transfer", List.of(field("exchangeRate", "text", List.of(), null))));
        assertThat(ScreenDesignService.stepAfter(ownField, initiate)).isEqualTo(ownField);
        assertThat(ScreenDesignService.stepAfter(otp, initiate)).isEqualTo(otp);
    }

    @Test
    void aValueThatIsSelectedShowsTheField() {
        RequirementSpec.Field execution = field("execution", "radio", List.of("One of: Now, Later"), null);
        RequirementSpec.Field date = field("executionDate", "date", List.of(), "Shown when Later is selected.");
        RequirementSpec.Field monthly = field("dayOfMonth", "number", List.of("Visible only if Frequency is Monthly"), null);
        RequirementSpec.Field frequency = field("frequency", "select", List.of("Values: Daily, Monthly"), null);

        List<ScreenModel.Component> c = ScreenModels.fromSpec(screen("Standing Instruction", List.of(execution, date, frequency, monthly)))
                .sections().getFirst().components();

        assertThat(c.get(1).visibleWhen()).isEqualTo(new ScreenModel.Condition(c.get(0).id(), "equals", "Later"));
        assertThat(c.get(3).visibleWhen()).isEqualTo(new ScreenModel.Condition(c.get(2).id(), "equals", "Monthly"));
    }

    @Test
    void choiceFieldsOfferTheValuesTheSpecNamesAndShowWhenTheyApply() {
        RequirementSpec.Field frequency = field("frequency", "dropdown", List.of(), null);
        RequirementSpec.Field execution = field("execution", "radio", List.of("One of: Now, Later"), null);
        RequirementSpec.Field date = field("executionDate", "date", List.of(), "Shown when Later");
        List<RequirementSpec.BusinessRule> rules = List.of(new RequirementSpec.BusinessRule("BR-002",
                "Frequency can be Daily, Weekly or Monthly.", List.of(), null));

        ScreenModel model = ScreenModels.fromSpec(screen("Standing Instruction", List.of(frequency, execution, date)), List.of(), rules);

        List<ScreenModel.Component> components = model.sections().getFirst().components();
        assertThat(components.get(0).options()).containsExactly("Daily", "Weekly", "Monthly");
        assertThat(components.get(1).options()).containsExactly("Now", "Later");
        assertThat(components.get(2).visibleWhen()).isEqualTo(new ScreenModel.Condition(components.get(1).id(), "equals", "Later"));
        // no list in the rule: the placeholders stay
        assertThat(ScreenModels.optionsInRules("Frequency", "frequency", List.of(new RequirementSpec.BusinessRule("BR-1",
                "Frequency must be selected before the start date, and the end date after it.", List.of(), null)))).isEmpty();
    }

    @Test
    void aListShowsItsFieldsAsTableColumns() {
        ScreenModel history = ScreenModels.fromSpec(screen("Standing Instruction List", List.of(field("beneficiary", "text", List.of(), null),
                field("amount", "amount", List.of(), null))));

        assertThat(history.sections().getFirst().components()).singleElement().satisfies(table -> {
            assertThat(table.type()).isEqualTo("table");
            assertThat(table.options()).containsExactly("Beneficiary", "Amount");
        });
        assertThat(history.actions()).extracting(ScreenModel.ActionButton::label).containsExactly("Back");
    }
}
