package com.obdx.factory.model;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.function.Function;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Saving the models checks that the embedding model embeds.
 */
class ModelControllerTest {

    private static ModelController controller(Function<String, float[]> embed) {
        ModelGateway gateway = new ModelGateway() {
            @Override
            public ChatResult chat(String systemPrompt, String userPrompt) {
                return new ChatResult("", "test", 1);
            }

            @Override
            public ChatResult chatJson(String systemPrompt, String userPrompt) {
                return chat(systemPrompt, userPrompt);
            }

            @Override
            public float[] embed(String text) {
                return embed.apply(text);
            }

            @Override
            public List<float[]> embedAll(List<String> texts) {
                return texts.stream().map(this::embed).toList();
            }
        };
        return new ModelController(gateway, null, null, null, null);
    }

    private static ModelSettings.Current settings(String embeddingModel) {
        return new ModelSettings.Current("https://api.groq.com/openai/v1", "key", "qwen/qwen3.8-27b", embeddingModel, null, null, true, null, null);
    }

    @Test
    void saysWhenTheEmbeddingModelCannotEmbed() {
        ModelController controller = controller(text -> {
            throw new ModelGatewayException("the model `allam-2-7b` does not support embeddings", null);
        });

        assertThat(controller.embeddingProblem(settings("allam-2-7b")))
                .contains("cannot embed").contains("does not support embeddings").contains("nomic-embed-text");
    }

    @Test
    void warnsAboutAChatModelUsedForEmbeddings() {
        ModelController controller = controller(text -> new float[] {0.1f, 0.2f});

        assertThat(controller.embeddingProblem(settings("nomic-embed-text:latest"))).isNull();
        assertThat(controller.embeddingProblem(settings("llama3.2:latest"))).contains("does not look like an embedding model");
        assertThat(ModelController.looksLikeEmbeddingModel("intfloat/multilingual-e5-large")).isTrue();
        assertThat(ModelController.looksLikeEmbeddingModel("bge-m3")).isTrue();
        assertThat(ModelController.looksLikeEmbeddingModel("qwen2.5-coder:7b")).isFalse();
    }
}
