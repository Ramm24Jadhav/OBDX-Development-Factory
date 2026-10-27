package com.obdx.factory.model;

import java.util.List;

/**
 * The only way the factory talks to AI models. Keeping every call behind this interface lets a workspace switch
 * between local and privately hosted models without changing the rest of the code.
 */
public interface ModelGateway {

    ChatResult chat(String systemPrompt, String userPrompt);

    float[] embed(String text);

    /** Embeds several texts in one call; the result has one vector per text, in the same order. */
    List<float[]> embedAll(List<String> texts);

    record ChatResult(String reply, String model, long latencyMs) {
    }
}
