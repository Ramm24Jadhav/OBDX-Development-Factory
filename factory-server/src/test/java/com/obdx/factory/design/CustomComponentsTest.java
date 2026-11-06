package com.obdx.factory.design;

import com.obdx.factory.common.BadRequestException;
import com.obdx.factory.model.ModelGateway;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import tools.jackson.databind.json.JsonMapper;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class CustomComponentsTest {

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
    private final JdbcTemplate jdbc = mock(JdbcTemplate.class);
    private final CustomComponents components = new CustomComponents(jdbc, model, JsonMapper.builder().build());

    @Test
    void theModelWritesTheComponentFromADescription() {
        // The tag "rate-ticker" is taken in the workspace, so the new one is "rate-ticker-2"
        when(jdbc.queryForObject(anyString(), eq(Boolean.class), any(), any())).thenReturn(true, false);
        replies.add("Not JSON at all");
        replies.add("""
                Here it is: {"name": "Ignored", "description": "Live INR rates", "html": "<div class=\\"rates\\">USD 83.20</div>",
                 "css": "& .rates { font-weight: 600; }", "script": ""}""");

        CustomComponents.CustomComponent created = components.create(UUID.randomUUID(), "Rate ticker",
                "INR exchange rates for USD, EUR and GBP", null, "Asha");

        assertThat(created.name()).as("the name typed wins over the model's").isEqualTo("Rate ticker");
        assertThat(created.tag()).isEqualTo("rate-ticker-2");
        assertThat(created.html()).isEqualTo("<div class=\"rates\">USD 83.20</div>");
        assertThat(created.css()).isEqualTo("& .rates { font-weight: 600; }");
        assertThat(created.script()).as("no behaviour is no script").isNull();
        assertThat(created.source()).isEqualTo("Description");
        assertThat(prompts).hasSize(2);
        assertThat(prompts.getFirst()).contains("begin every rule with \"&\"", "What it should be: INR exchange rates");
        assertThat(prompts.get(1)).contains("could not be used");
    }

    @Test
    void needsADescriptionOrADesign() {
        assertThatThrownBy(() -> components.create(UUID.randomUUID(), "x", " ", null, "Asha"))
                .isInstanceOf(BadRequestException.class).hasMessageContaining("Describe the component");
    }

    @Test
    void anImageNeedsAModelThatReadsImages() {
        DesignImporter.Design image = new DesignImporter.Design("image card.png", null, new byte[]{1}, "image/png");

        assertThatThrownBy(() -> components.create(UUID.randomUUID(), "Card", "", image, "Asha"))
                .isInstanceOf(BadRequestException.class).hasMessageContaining("reads images on the Models page");
    }
}
