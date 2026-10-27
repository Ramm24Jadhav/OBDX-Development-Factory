package com.obdx.factory.pack;

import java.util.List;

/**
 * What the factory knows about one OBDX release line: the quick checks for generated code and the Java level to
 * assume when the Project Profile does not show one.
 *
 * @param version     "22.x" or "25.x"
 * @param description shown in the UI
 * @param javaLevel   Java language level used to parse generated Java when the profile has no Java version
 * @param rules       the pack's own rules plus the common ones
 */
public record VersionPack(String version, String description, int javaLevel, List<PackRule> rules) {

    public VersionPack {
        rules = List.copyOf(rules);
    }
}
