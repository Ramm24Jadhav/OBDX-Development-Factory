package com.obdx.factory.model;

/**
 * The model's server is at a rate limit that does not clear soon: a daily limit (tokens or requests per day), a wait
 * longer than the factory waits, or a limit that stayed after several tries. Every further call fails the same way
 * until it resets, so work that makes many calls (writing the files of a change) stops instead of trying each one.
 */
public class ModelLimitReachedException extends ModelGatewayException {

    private final boolean daily;

    public ModelLimitReachedException(String message, boolean daily, Throwable cause) {
        super(message, cause);
        this.daily = daily;
    }

    /** Whether it is a daily limit (as opposed to a long wait or a limit that stayed). */
    public boolean daily() {
        return daily;
    }
}
