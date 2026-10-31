package com.obdx.factory.requirements;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class SpecParserTest {

    @Test
    void readsModelOutputWithFencesCommentsAndLooseValues() {
        String reply = """
                Here is the specification:
                ```json
                {
                  "title": "Standing instructions",
                  // models sometimes add comments
                  "screens": [{
                    "name": "Create Standing Instruction",
                    "changeType": "NEW",
                    "fields": [
                      {"name": "frequency", "type": "Dropdown", "mandatory": "yes", "validations": "one of daily, weekly, monthly"},
                      {"name": "endDate", "type": "date", "mandatory": "not stated"},
                      {"label": "nameless field is dropped"},
                    ],
                    "actions": ["Submit"],
                  }, {"description": "screen without name is dropped"}],
                  "roles": ["Retail user"],
                  "messages": [{"text": "Instruction created", "type": "success"}],
                  "openQuestions": ["What is the maximum number of instructions?"],
                  "somethingUnknown": 42
                }
                ```
                """;

        RequirementSpec spec = SpecParser.parse(reply, "fallback");

        assertThat(spec.title()).isEqualTo("Standing instructions");
        assertThat(spec.screens()).singleElement().satisfies(screen -> {
            assertThat(screen.changeType()).isEqualTo("new");
            assertThat(screen.fields()).extracting(RequirementSpec.Field::name).containsExactly("frequency", "endDate");
            assertThat(screen.fields().get(0).type()).isEqualTo("dropdown");
            assertThat(screen.fields().get(0).mandatory()).isTrue();
            assertThat(screen.fields().get(0).validations()).containsExactly("one of daily, weekly, monthly");
            assertThat(screen.fields().get(1).mandatory()).isNull();
            assertThat(screen.actions()).extracting(RequirementSpec.Action::name).containsExactly("Submit");
            assertThat(screen.relatedCode()).isEmpty();
        });
        assertThat(spec.roles()).extracting(RequirementSpec.Role::name).containsExactly("Retail user");
        assertThat(spec.messages()).singleElement().extracting(RequirementSpec.Message::type).isEqualTo("info");
        assertThat(spec.openQuestions()).extracting(RequirementSpec.OpenQuestion::question)
                .containsExactly("What is the maximum number of instructions?");
        assertThat(spec.businessRules()).isEmpty();
        assertThat(spec.decisions()).isEmpty();
    }

    @Test
    void readsQuestionOptionsAndSuggestedAnswer() {
        RequirementSpec spec = SpecParser.parse("""
                {"openQuestions": [
                  {"question": "Which order types can a customer place?", "options": ["Market only", "Market and limit"],
                   "suggestedAnswer": "Market and limit"},
                  {"question": "Is a reason mandatory?", "options": "Yes"}
                ]}""", "x");

        assertThat(spec.openQuestions().get(0).options()).containsExactly("Market only", "Market and limit");
        assertThat(spec.openQuestions().get(0).suggestedAnswer()).isEqualTo("Market and limit");
        assertThat(spec.openQuestions().get(1).options()).containsExactly("Yes");
        assertThat(spec.openQuestions().get(1).suggestedAnswer()).isNull();
    }

    @Test
    void usesFallbackTitleAndRejectsNonJson() {
        assertThat(SpecParser.parse("{}", "From file name").title()).isEqualTo("From file name");
        assertThatThrownBy(() -> SpecParser.parse("I cannot help with that.", "x"))
                .isInstanceOf(SpecParser.InvalidSpecException.class)
                .hasMessageContaining("no JSON object");
        assertThatThrownBy(() -> SpecParser.parse("{\"title\": }", "x"))
                .isInstanceOf(SpecParser.InvalidSpecException.class)
                .hasMessageContaining("not valid JSON");
    }
}
