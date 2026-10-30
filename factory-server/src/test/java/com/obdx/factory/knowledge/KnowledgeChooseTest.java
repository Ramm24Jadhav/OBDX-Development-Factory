package com.obdx.factory.knowledge;

import com.obdx.factory.model.ModelGateway;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

import java.util.List;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The chat model picks, from the search's short list, the sections that answer the question.
 */
class KnowledgeChooseTest {

    private final AtomicReference<String> reply = new AtomicReference<>();
    private final AtomicReference<String> asked = new AtomicReference<>();

    private final ModelGateway gateway = new ModelGateway() {
        @Override
        public ChatResult chat(String systemPrompt, String userPrompt) {
            return chatJson(systemPrompt, userPrompt);
        }

        @Override
        public ChatResult chatJson(String systemPrompt, String userPrompt) {
            asked.set(userPrompt);
            return new ChatResult(reply.get(), "test", 1);
        }

        @Override
        public float[] embed(String text) {
            return new float[] {1};
        }

        @Override
        public List<float[]> embedAll(List<String> texts) {
            return texts.stream().map(this::embed).toList();
        }
    };

    private final KnowledgeService service = new KnowledgeService(null, null, gateway, null, null, JsonMapper.builder().build(), null, null);

    private static final List<KnowledgeSearch.Hit> SHORT_LIST = List.of(
            hit("7.1.2 Biller Onboarding - Create (continued)"), hit("15. Group Corporate Onboarding"),
            hit("4.1 User Management - Create"), hit("4.1 User Management - Create (continued)"));

    @Test
    void keepsTheSectionsTheModelPicksInItsOrder() {
        reply.set("{\"sections\": [3, 4, 3, 9]}");

        List<KnowledgeSearch.Hit> chosen = service.choose("Steps for onboarding a retail user", SHORT_LIST, 5);

        assertThat(chosen).extracting(KnowledgeSearch.Hit::heading)
                .containsExactly("4.1 User Management - Create", "4.1 User Management - Create (continued)");
        assertThat(asked.get()).contains("[3] User Manual Core | 4.1 User Management - Create | ").contains("[4] User Manual Core | 4.1 User Management - Create |");
    }

    @Test
    void keepsTheSearchOrderWhenTheReplyCannotBeRead() {
        reply.set("The best sections are 3 and 4.");

        assertThat(service.choose("Steps for onboarding a retail user", SHORT_LIST, 2)).containsExactly(SHORT_LIST.get(0), SHORT_LIST.get(1));
    }

    private static KnowledgeSearch.Hit hit(String heading) {
        return new KnowledgeSearch.Hit("MANUAL", UUID.randomUUID(), UUID.randomUUID(), "User Manual Core", heading, "22.2", 1, 1, null,
                "Section text   with\nspaces", 0, false, null);
    }
}
