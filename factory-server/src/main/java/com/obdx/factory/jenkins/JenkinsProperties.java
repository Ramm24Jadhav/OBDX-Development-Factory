package com.obdx.factory.jenkins;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;
import org.springframework.util.unit.DataSize;

import java.time.Duration;

/**
 * @param pollInterval   how often a queued or running build is checked
 * @param queueTimeout   longest wait for a build to start
 * @param buildTimeout   longest wait for a build to finish
 * @param requestTimeout limit for one call to Jenkins
 * @param maxFixRounds   times the model may fix build errors before giving up
 * @param maxLogSize     how much of the end of a console log is read
 */
@ConfigurationProperties(prefix = "factory.jenkins")
public record JenkinsProperties(
        @DefaultValue("10s") Duration pollInterval,
        @DefaultValue("30m") Duration queueTimeout,
        @DefaultValue("60m") Duration buildTimeout,
        @DefaultValue("30s") Duration requestTimeout,
        @DefaultValue("2") int maxFixRounds,
        @DefaultValue("300KB") DataSize maxLogSize) {
}
