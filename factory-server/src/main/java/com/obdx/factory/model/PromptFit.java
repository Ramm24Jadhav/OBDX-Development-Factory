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
    /** The scale of the prompt being sent on this thread, for the gateway's log of each request; null outside PromptFit. */
    static final ThreadLocal<Double> SCALE = new ThreadLocal<>();

    private PromptFit() {
    }

    public static ModelGateway.ChatResult chat(ModelGateway gateway, String system, DoubleFunction<String> build) {
        return ask(gateway, system, build, false, 1).result();
    }

    /** An answer and the scale its prompt was sent at. */
    public record Fitted(ModelGateway.ChatResult result, double scale) {
    }

    /**
     * As chat, starting at a scale an earlier request of the same work needed (a file's continuation after its first
     * piece), so it is not sent at 100% again; it still shrinks when what the prompt carries besides (the file's end)
     * makes it too large.
     */
    public static Fitted chatFrom(ModelGateway gateway, String system, DoubleFunction<String> build, double scale) {
        return ask(gateway, system, build, false, scale);
    }

    public static ModelGateway.ChatResult chatJson(ModelGateway gateway, String system, DoubleFunction<String> build) {
        return ask(gateway, system, build, true, 1).result();
    }

    private static Fitted ask(ModelGateway gateway, String system, DoubleFunction<String> build, boolean json, double start) {
        double scale = Math.clamp(start, MIN_SCALE, 1);
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
            SCALE.set(scale);
            try {
                // Streamed, so a slow server writing a long answer (a file) is timed from its last piece, not from the start
                return new Fitted(json ? gateway.chatJson(system, user) : gateway.chatStream(system, user, piece -> { }), scale);
            } catch (PromptTooLargeException e) {
                if (refused >= 2 || scale <= MIN_SCALE) {
                    throw new ModelGatewayException("The request is larger than the " + e.limit() + " tokens the model's server takes "
                            + "at once, even with less context. Use a model or plan with a larger limit (on a cloud server, a paid tier).", e);
                }
            } finally {
                SCALE.remove();
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
