package com.obdx.factory.model;

import java.util.function.DoubleFunction;

/**
 * Asks the model with a prompt that fits its server's input limit. The caller builds the prompt for a scale (1 = the
 * usual sizes of its context sections, 0.5 = half of each); once the server has refused a request as too large, the
 * prompt is built smaller until it fits, so a model with a small limit (a free cloud tier) gets less context instead
 * of failing.
 */
public final class PromptFit {

    private static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(PromptFit.class);

    /** Room left for the server counting tokens a little differently than estimated. */
    static final double MARGIN = 0.9;
    static final double MIN_SCALE = 0.1;

    private PromptFit() {
    }

    public static ModelGateway.ChatResult chat(ModelGateway gateway, String system, DoubleFunction<String> build) {
        return ask(gateway, system, build, false);
    }

    public static ModelGateway.ChatResult chatJson(ModelGateway gateway, String system, DoubleFunction<String> build) {
        return ask(gateway, system, build, true);
    }

    private static ModelGateway.ChatResult ask(ModelGateway gateway, String system, DoubleFunction<String> build, boolean json) {
        double scale = 1;
        for (int refused = 0; ; refused++) {
            String user = build.apply(scale);
            for (int i = 0; i < 8 && scale > MIN_SCALE; i++) {
                double room = gateway.inputLimit() * MARGIN;
                double tokens = tokens(gateway, system, user);
                if (gateway.inputLimit() <= 0 || tokens <= room) {
                    break;
                }
                scale = Math.max(MIN_SCALE, scale * room / tokens);
                user = build.apply(scale);
            }
            if (scale < 1) {
                log.info("Prompt shortened to {}% of its usual context to fit the {} tokens the model's server takes at once",
                        Math.round(scale * 100), gateway.inputLimit());
            }
            try {
                return json ? gateway.chatJson(system, user) : gateway.chat(system, user);
            } catch (PromptTooLargeException e) {
                if (refused >= 2 || scale <= MIN_SCALE) {
                    throw new ModelGatewayException("The request is larger than the " + e.limit() + " tokens the model's server takes "
                            + "at once, even with less context. Use a model or plan with a larger limit (on a cloud server, a paid tier).", e);
                }
            }
        }
    }

    static double tokens(ModelGateway gateway, String system, String user) {
        return ((system == null ? 0 : system.length()) + user.length()) / gateway.charsPerToken();
    }

    /** A section's usual size at a scale, never below a useful minimum. */
    public static int size(int usual, double scale) {
        return Math.max(Math.min(usual, 400), (int) (usual * scale));
    }
}
