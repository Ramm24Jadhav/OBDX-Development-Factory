package com.obdx.factory.svn;

import com.obdx.factory.common.Messages;

/** An svn command that failed. The message hides secrets (an SVN server's error can echo the login): it is shown and logged. */
public class SvnException extends RuntimeException {

    public SvnException(String message) {
        super(Messages.redacted(message));
    }

    public SvnException(String message, Throwable cause) {
        super(Messages.redacted(message), cause);
    }
}
