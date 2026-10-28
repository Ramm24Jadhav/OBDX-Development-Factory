package com.obdx.factory.design;

import com.obdx.factory.common.BadRequestException;
import com.obdx.factory.model.ModelGateway;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ScreenModelEditorTest {

    private final Deque<String> replies = new ArrayDeque<>();
    private final List<String> prompts = new ArrayList<>();
    private final ModelGateway model = new ModelGateway() {
        @Override
        public ChatResult chat(String systemPrompt, String userPrompt) {
            throw new UnsupportedOperationException();
        }

        @Override
        public ChatResult chatJson(String systemPrompt, String userPrompt) {
            prompts.add(systemPrompt + "\n---\n" + userPrompt);
            return new ChatResult(replies.removeFirst(), "scripted", 1);
        }

        @Override
        public float[] embed(String text) {
            throw new UnsupportedOperationException();
        }

        @Override
        public List<float[]> embedAll(List<String> texts) {
            throw new UnsupportedOperationException();
        }
    };
    private final ScreenModelEditor editor = new ScreenModelEditor(model, JsonMapper.builder().build());

    @Test
    void sendsModelAndInstructionAndRetriesOnce() {
        replies.add("I moved it.");
        replies.add("""
                {"name": "Transfer", "sections": [{"id": "s-1", "components": [
                  {"id": "c-amount", "type": "amount", "name": "amount"},
                  {"id": "c-remarks", "type": "text", "name": "remarks", "required": false}]}]}
                """);

        ScreenModel changed = editor.apply(ScreenModels.blank("Transfer"), "move remarks to the end and make it optional");

        assertThat(changed.sections().getFirst().components()).extracting(ScreenModel.Component::id).containsExactly("c-amount", "c-remarks");
        assertThat(prompts).hasSize(2);
        assertThat(prompts.getFirst()).contains("Keep everything else, including every \"id\"", "select (Dropdown)",
                "Instruction: move remarks to the end and make it optional", "\"name\":\"Transfer\"");
        assertThat(prompts.get(1)).contains("could not be used");
    }

    @Test
    void turnsAnImportedDesignIntoAScreenWithTheCodesComponents() {
        replies.add("""
                {"name": "Transfer", "sections": [{"title": "Pay", "components": [
                  {"type": "component", "label": "From", "component": "account-input", "params": {"type": "balance"}}]}]}
                """);
        ComponentPalette.Item accountInput = new ComponentPalette.Item("component:account-input", ComponentPalette.FRAMEWORK,
                "Account input", "component", "account-input", null, List.of("type", "value"), 3, null, null);

        ScreenModel imported = editor.fromDesign(ScreenModels.blank("Transfer"),
                new DesignImporter.Design("Figma frame \"Pay\"", "frame \"Pay\"\n  text \"Label\": From", null, null), List.of(accountInput));

        assertThat(imported.sections().getFirst().components().getFirst().component()).isEqualTo("account-input");
        assertThat(prompts.getFirst()).contains("Follow the design", "account-input (params: type, value)",
                "Design (Figma frame \"Pay\"):\nframe \"Pay\"", "Current screen model:");
    }

    @Test
    void anImageNeedsAModelThatReadsImages() {
        DesignImporter.Design image = new DesignImporter.Design("image mock.png", null, new byte[]{1, 2}, "image/png");

        assertThatThrownBy(() -> editor.fromDesign(ScreenModels.blank("Transfer"), image, List.of()))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("reads images on the Models page");
    }

    @Test
    void givesUpAfterTwoUnusableAnswers() {
        replies.add("nope");
        replies.add("{\"sections\": []}");

        assertThatThrownBy(() -> editor.apply(ScreenModels.blank("Transfer"), "x"))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("did not return a usable screen model");
    }
}
