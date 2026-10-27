package com.obdx.factory.svn;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

import java.time.Duration;

/**
 * @param command            the svn executable (Apache Subversion command-line client)
 * @param commandTimeout     limit for quick commands such as svn info
 * @param checkoutTimeout    limit for checkout and update of a whole codebase
 * @param trustUnknownCa     accept server certificates signed by an unknown CA (internal bank CAs); prefer adding the CA to the system trust store
 */
@ConfigurationProperties(prefix = "factory.svn")
public record SvnProperties(
        @DefaultValue("svn") String command,
        @DefaultValue("60s") Duration commandTimeout,
        @DefaultValue("60m") Duration checkoutTimeout,
        @DefaultValue("false") boolean trustUnknownCa) {
}
