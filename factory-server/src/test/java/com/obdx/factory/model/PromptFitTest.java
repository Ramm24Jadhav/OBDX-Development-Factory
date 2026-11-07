package com.obdx.factory.model;

import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class PromptFitTest {

    /** A server that takes at most {@code limit} tokens (3.5 characters each) and remembers the limit once it refused. */
    static class LimitedGateway implements ModelGateway {
        final int limit;
        int learned;
        final List<Integer> sent = new ArrayList<>();

        LimitedGateway(int limit) {
            this.limit = limit;
        }

        @Override
        public ChatResult chat(String systemPrompt, String userPrompt) {
            int tokens = (int) ((systemPrompt.length() + userPrompt.length()) / 3.5);
            sent.add(tokens);
            if (tokens > limit) {
                learned = limit;
                throw new PromptTooLargeException("too large", limit, tokens, null);
            }
            return new ChatResult("{}", "m", 1);
        }

        @Override
        public ChatResult chatJson(String systemPrompt, String userPrompt) {
            return chat(systemPrompt, userPrompt);
        }

        @Override
        public int inputLimit() {
            return learned;
        }

        @Override
        public float[] embed(String text) {
            return new float[0];
        }

        @Override
        public List<float[]> embedAll(List<String> texts) {
            return List.of();
        }
    }

    /** A fixed part and a context section of 30,000 characters at full scale. */
    private static String prompt(double scale) {
        return "Write the file.\n" + "c".repeat(PromptFit.size(30_000, scale));
    }

    @Test
    void sendsThePromptAsItIsWhileTheServerTakesIt() {
        LimitedGateway gateway = new LimitedGateway(100_000);

        PromptFit.chatJson(gateway, "system", PromptFitTest::prompt);

        assertThat(gateway.sent).hasSize(1);
        assertThat(gateway.sent.getFirst()).isGreaterThan(8000);
    }

    @Test
    void buildsASmallerPromptOnceTheServerRefusedALargeOne() {
        LimitedGateway gateway = new LimitedGateway(7000);

        PromptFit.chatJson(gateway, "system", PromptFitTest::prompt);

        assertThat(gateway.sent).hasSize(2);
        assertThat(gateway.sent.get(1)).isLessThanOrEqualTo(7000);

        // The next request is built to fit from the start
        gateway.sent.clear();
        PromptFit.chat(gateway, "system", PromptFitTest::prompt);
        assertThat(gateway.sent).hasSize(1);
    }

    @Test
    void aRequestAskedAgainAfterARefusalIsSmallerAndSaysWhy() {
        // The server counts more than the factory estimates: the learned limit alone would let the same prompt go again
        LimitedGateway gateway = new LimitedGateway(7000) {
            @Override
            public int inputLimit() {
                return learned == 0 ? 0 : 100_000;
            }
        };
        ch.qos.logback.classic.Logger logger = (ch.qos.logback.classic.Logger) org.slf4j.LoggerFactory.getLogger(PromptFit.class);
        ch.qos.logback.core.read.ListAppender<ch.qos.logback.classic.spi.ILoggingEvent> logged = new ch.qos.logback.core.read.ListAppender<>();
        logged.start();
        logger.addAppender(logged);
        try {
            PromptFit.chat(gateway, "system", PromptFitTest::prompt);
        } finally {
            logger.detachAppender(logged);
        }

        assertThat(gateway.sent).hasSizeGreaterThan(1);
        for (int i = 1; i < gateway.sent.size(); i++) {
            assertThat(gateway.sent.get(i)).isLessThan(gateway.sent.get(i - 1));
        }
        assertThat(logged.list).extracting(ch.qos.logback.classic.spi.ILoggingEvent::getFormattedMessage)
                .anyMatch(m -> m.startsWith("Asking again with a smaller prompt: the model's server refused") && m.contains("limit 7000 tokens"));
    }

    @Test
    void saysWhatToDoWhenEvenTheSmallestPromptIsTooLarge() {
        LimitedGateway gateway = new LimitedGateway(500);

        assertThatThrownBy(() -> PromptFit.chat(gateway, "system", scale -> "f".repeat(5000) + prompt(scale)))
                .isInstanceOf(ModelGatewayException.class)
                .hasMessageContaining("larger limit");
    }
}
