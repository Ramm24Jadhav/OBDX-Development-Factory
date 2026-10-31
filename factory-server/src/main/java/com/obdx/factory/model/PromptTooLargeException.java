package com.obdx.factory.model;

/**
 * The model's server refused a request because it has more input tokens than it takes in one request. Asking again
 * with the same prompt fails again; {@link PromptFit} builds a smaller one.
 */
public class PromptTooLargeException extends ModelGatewayException {

    private final int limit;
    private final int requested;

    public PromptTooLargeException(String message, int limit, int requested, Throwable cause) {
        super(message, cause);
        this.limit = limit;
        this.requested = requested;
    }

    public int limit() {
        return limit;
    }

    public int requested() {
        return requested;
    }
}
