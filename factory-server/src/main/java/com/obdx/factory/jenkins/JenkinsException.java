package com.obdx.factory.jenkins;

import com.obdx.factory.common.Messages;

/** A Jenkins call that failed. The message hides secrets (a server's error can echo the token): it is shown and logged. */
public class JenkinsException extends RuntimeException {

    public JenkinsException(String message) {
        super(Messages.redacted(message));
    }

    public JenkinsException(String message, Throwable cause) {
        super(Messages.redacted(message), cause);
    }
}
