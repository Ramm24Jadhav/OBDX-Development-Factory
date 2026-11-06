package com.obdx.factory.model;

import java.util.List;

/**
 * The only way the factory talks to AI models. Keeping every call behind this interface lets a workspace switch
 * between local and privately hosted models without changing the rest of the code.
 */
public interface ModelGateway {

    ChatResult chat(String systemPrompt, String userPrompt);

    /** Like {@link #chat}, but asks the model to answer with a JSON object only. */
    ChatResult chatJson(String systemPrompt, String userPrompt);

    float[] embed(String text);

    /** Embeds several texts in one call; the result has one vector per text, in the same order. */
    List<float[]> embedAll(List<String> texts);

    String NO_VISION_MODEL = "No screenshot model is chosen. Choose one on the Models page to read screenshots, or type the error text.";

    /**
     * Asks the screenshot model (one that accepts images) about an image. Without one it throws
     * {@link ModelGatewayException} with {@link #NO_VISION_MODEL}.
     */
    default ChatResult describeImage(String prompt, byte[] image, String mimeType) {
        throw new ModelGatewayException(NO_VISION_MODEL, null);
    }

    record ChatResult(String reply, String model, long latencyMs) {
    }
}
