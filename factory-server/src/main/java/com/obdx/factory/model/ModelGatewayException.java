package com.obdx.factory.model;

import com.obdx.factory.common.Messages;

/** A model call that failed. The message hides secrets (a provider's error can echo the API key): it is shown and logged. */
public class ModelGatewayException extends RuntimeException {

    public ModelGatewayException(String message, Throwable cause) {
        super(Messages.redacted(message), cause);
    }
}
