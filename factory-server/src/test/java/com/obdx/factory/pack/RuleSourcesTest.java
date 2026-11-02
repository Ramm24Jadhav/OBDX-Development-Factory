package com.obdx.factory.pack;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;

/** Each version pack rule names the file it comes from, so the factory's own rules and the bank's standards show apart. */
class RuleSourcesTest {

    @Test
    void builtInRulesComeFromTheFactorysPackFiles() {
        VersionPack pack = VersionPacks.builtIn().find("22.x").orElseThrow();
        assertThat(pack.rules()).allSatisfy(r -> assertThat(pack.sourceOf(r.id())).startsWith("packs/"));
        assertThat(PackService.origin(pack.sourceOf(pack.rules().get(0).id()))).isEqualTo("VERSION_PACK");
    }

    @Test
    void rulesOfTheBanksPackFolderAreTheBanksStandards(@TempDir Path dir) throws IOException {
        Files.writeString(dir.resolve("common.yml"), """
                rules:
                  - id: js-no-console
                    enabled: false
                  - id: bank-logger
                    title: Bank logger
                    severity: error
                    files: ["**/*.java"]
                    forbid: 'java\\.util\\.logging'
                    message: Use com.bank.common.BankLogger.
                """);
        VersionPack pack = new VersionPacks(new PackProperties(dir.toString())).find("25.x").orElseThrow();

        String source = pack.sourceOf("bank-logger");
        assertThat(source).endsWith("common.yml").doesNotStartWith("packs/");
        assertThat(PackService.origin(source)).isEqualTo("BANK");
        assertThat(PackService.fileName(source)).isEqualTo("common.yml");
        // A rule the bank's folder removed has no source left
        assertThat(pack.sourceOf("js-no-console")).isNull();
        assertThat(PackService.fileName("packs/25.x.yml")).isEqualTo("packs/25.x.yml");
    }
}
