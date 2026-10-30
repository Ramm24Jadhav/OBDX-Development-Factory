package com.obdx.factory.model;

import java.util.List;
import java.util.function.Consumer;

/**
 * The only way the factory talks to AI models. Keeping every call behind this interface lets a workspace switch
 * between local and privately hosted models without changing the rest of the code.
 */
public interface ModelGateway {

    ChatResult chat(String systemPrompt, String userPrompt);

    /**
     * Like {@link #chat}, handing the reply to {@code pieces} as the model writes it, so people read it while it is
     * written; returns the whole reply when the model is done. Gateways that cannot stream hand it over in one piece.
     */
    default ChatResult chatStream(String systemPrompt, String userPrompt, Consumer<String> pieces) {
        ChatResult result = chat(systemPrompt, userPrompt);
        pieces.accept(result.reply());
        return result;
    }

    /** Like {@link #chat}, but asks the model to answer with a JSON object only. */
    ChatResult chatJson(String systemPrompt, String userPrompt);

    /**
     * Like {@link #chatJson}, with an image (PNG, JPEG or WebP) after the prompt, for models that read images.
     *
     * @throws ModelGatewayException when the model cannot read images
     */
    default ChatResult chatJsonWithImage(String systemPrompt, String userPrompt, byte[] image, String mimeType) {
        throw new ModelGatewayException("This model connection cannot send images", null);
    }

    float[] embed(String text);

    /** Embeds several texts in one call; the result has one vector per text, in the same order. */
    List<float[]> embedAll(List<String> texts);

    record ChatResult(String reply, String model, long latencyMs) {
    }
}
