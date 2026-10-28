package com.obdx.factory.design;

import com.obdx.factory.common.BadRequestException;
import com.obdx.factory.requirements.RequirementSpec;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ScreenModelsTest {

    @Test
    void keepsComponentsOfTheCodeAndTables() {
        ScreenModel model = ScreenModels.parse("""
                {"name": "Transfer", "sections": [{"components": [
                  {"type": "component", "label": "From account", "component": " account-input ",
                   "params": {"type": "balance", " ": "dropped", "value": null}},
                  {"type": "component", "label": "No component named"},
                  {"type": "text", "label": "Remarks", "component": "account-input", "params": {"x": "y"}},
                  {"type": "table", "label": "Orders"}
                ]}]}""");

        List<ScreenModel.Component> components = model.sections().getFirst().components();
        assertThat(components.get(0).component()).isEqualTo("account-input");
        assertThat(components.get(0).params()).containsExactly(java.util.Map.entry("type", "balance"), java.util.Map.entry("value", ""));
        assertThat(components.get(1).type()).as("a component needs its name").isEqualTo("text");
        assertThat(components.get(2).component()).as("only type component names one").isNull();
        assertThat(components.get(2).params()).isEmpty();
        assertThat(components.get(3).options()).as("a table's options are its columns").containsExactly("Column 1", "Column 2");
    }

    @Test
    void keepsAnElementsOwnCode() {
        ScreenModel model = ScreenModels.parse("""
                {"name": "Transfer", "sections": [{"components": [
                  {"type": "text", "label": "Remarks", "html": "\\n<div class=\\"note\\">Hi</div>\\n", "css": "& { color: red; }",
                   "script": " ", "id": "c-remarks"}]}]}""");

        ScreenModel.Component remarks = model.sections().getFirst().components().getFirst();
        assertThat(remarks.html()).isEqualTo("<div class=\"note\">Hi</div>");
        assertThat(remarks.css()).isEqualTo("& { color: red; }");
        assertThat(remarks.script()).as("blank code is no code").isNull();
        assertThatThrownBy(() -> ScreenModels.parse("{\"name\": \"x\", \"sections\": [{\"components\": [{\"type\": \"text\", \"css\": \""
                + "a".repeat(20_001) + "\"}]}]}"))
                .isInstanceOf(BadRequestException.class).hasMessageContaining("CSS of an element is longer");
    }

    @Test
    void buildsFirstDesignFromSpecScreen() {
        RequirementSpec.Screen screen = new RequirementSpec.Screen("Own Account Transfer", "enhance", "Add remarks", "2",
                List.of(
                        new RequirementSpec.Field("fromAccount", null, "account", true, List.of(), null, "Customer's CASA accounts", null),
                        new RequirementSpec.Field("remarks", "Remarks", "text", false, List.of("alphanumeric only", "max length 35"), null, null, "Shown on confirmation"),
                        new RequirementSpec.Field("frequency", "Frequency", "dropdown", null, List.of(), "Once", null, null)),
                List.of(new RequirementSpec.Action("Submit", "Go to review"), new RequirementSpec.Action("Cancel", null)),
                List.of("ui/js/viewModels/fund-transfer.js"));

        ScreenModel model = ScreenModels.fromSpec(screen);

        assertThat(model.name()).isEqualTo("Own Account Transfer");
        assertThat(model.changeType()).isEqualTo("enhance");
        assertThat(model.sections()).singleElement().satisfies(section -> {
            assertThat(section.id()).isEqualTo("s-1");
            assertThat(section.columns()).isEqualTo(2);
            assertThat(section.components()).extracting(ScreenModel.Component::id, ScreenModel.Component::type, ScreenModel.Component::label)
                    .containsExactly(
                            org.assertj.core.groups.Tuple.tuple("c-fromAccount", "account", "From account"),
                            org.assertj.core.groups.Tuple.tuple("c-remarks", "text", "Remarks"),
                            org.assertj.core.groups.Tuple.tuple("c-frequency", "select", "Frequency"));
        });
        ScreenModel.Component remarks = model.sections().getFirst().components().get(1);
        assertThat(remarks.maxLength()).isEqualTo(35);
        assertThat(remarks.required()).isFalse();
        assertThat(remarks.helpText()).isEqualTo("Shown on confirmation");
        assertThat(model.sections().getFirst().components().get(2).options()).containsExactly("Option 1", "Option 2");
        assertThat(model.sections().getFirst().components().get(2).defaultValue()).isEqualTo("Once");
        assertThat(model.actions()).extracting(ScreenModel.ActionButton::label, ScreenModel.ActionButton::kind)
                .containsExactly(org.assertj.core.groups.Tuple.tuple("Submit", "primary"), org.assertj.core.groups.Tuple.tuple("Cancel", "secondary"));
    }

    @Test
    void normalizesEditedOrGeneratedModels() {
        ScreenModel model = ScreenModels.parse("""
                ```json
                {"name": "Beneficiary", "changeType": "NEW",
                 "sections": [
                   {"id": "main", "title": "Payee", "columns": 7, "components": [
                     {"id": "dup", "type": "Drop-down", "label": "Bank name"},
                     {"id": "dup", "type": "currency", "name": "limit"},
                     {"type": "fancy-widget", "label": "Nick name"},
                   ]},
                   {"components": []}],
                 "actions": [{"label": "Save", "kind": "PRIMARY"}, {"label": ""}, {"label": "Back", "kind": "weird"}],
                 "extra": true}
                ```
                """);

        assertThat(model.title()).isEqualTo("Beneficiary");
        assertThat(model.changeType()).isEqualTo("new");
        ScreenModel.Section payee = model.sections().getFirst();
        assertThat(payee.columns()).isEqualTo(3);
        assertThat(payee.components()).extracting(ScreenModel.Component::id, ScreenModel.Component::type, ScreenModel.Component::name, ScreenModel.Component::label)
                .containsExactly(
                        org.assertj.core.groups.Tuple.tuple("dup", "select", "bankName", "Bank name"),
                        org.assertj.core.groups.Tuple.tuple("dup-2", "amount", "limit", "Limit"),
                        org.assertj.core.groups.Tuple.tuple("c-nickName", "text", "nickName", "Nick name"));
        assertThat(payee.components().getFirst().options()).containsExactly("Option 1", "Option 2");
        assertThat(model.sections().get(1).id()).isEqualTo("s-2");
        assertThat(model.actions()).extracting(ScreenModel.ActionButton::label, ScreenModel.ActionButton::kind)
                .containsExactly(org.assertj.core.groups.Tuple.tuple("Save", "primary"), org.assertj.core.groups.Tuple.tuple("Back", "secondary"));
    }

    @Test
    void rejectsModelsWithoutNameOrJson() {
        assertThatThrownBy(() -> ScreenModels.parse("{\"sections\": []}")).isInstanceOf(BadRequestException.class).hasMessageContaining("name");
        assertThatThrownBy(() -> ScreenModels.parse("no json")).isInstanceOf(BadRequestException.class);
        assertThat(ScreenModels.blank("New screen").sections()).singleElement().extracting(ScreenModel.Section::title).isEqualTo("Details");
    }

    @Test
    void convertsBetweenNamesAndLabels() {
        assertThat(ScreenModels.humanize("debitAccountId")).isEqualTo("Debit account id");
        assertThat(ScreenModels.humanize("value_date")).isEqualTo("Value date");
        assertThat(ScreenModels.camel("Value date (DD/MM)")).isEqualTo("valueDateDdMm");
    }
}
