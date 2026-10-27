package com.obdx.factory.requirements;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * @param maxCharsPerCall long documents are sent to the model in sections of at most this many characters;
 *                        lower it for models with a small context window
 * @param maxAttempts     model calls per section before giving up on unusable answers
 */
@ConfigurationProperties(prefix = "factory.requirements")
public record RequirementsProperties(
        @DefaultValue("12000") int maxCharsPerCall,
        @DefaultValue("2") int maxAttempts) {
}
