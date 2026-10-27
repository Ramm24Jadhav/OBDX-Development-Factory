package com.obdx.factory.pack;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * @param dir optional folder with the team's own pack files (common.yml, 22.x.yml, 25.x.yml). Their rules are added
 *            to the built-in ones; a rule with the same id replaces the built-in rule, and "enabled: false" removes it.
 */
@ConfigurationProperties(prefix = "factory.packs")
public record PackProperties(String dir) {
}
