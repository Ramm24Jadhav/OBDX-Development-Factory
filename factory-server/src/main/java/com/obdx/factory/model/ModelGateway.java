package com.obdx.factory.model;

/**
 * The only way the factory talks to AI models. Keeping every call behind this interface lets a workspace switch
 * between local and privately hosted models without changing the rest of the code.
 */
public interface ModelGateway {

    ChatResult chat(String systemPrompt, String userPrompt);

    float[] embed(String text);

    record ChatResult(String reply, String model, long latencyMs) {
    }
}
