package com.obdx.factory.pack;

import com.obdx.factory.change.FileChecks;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class LocalChecksTest {

    private final LocalChecks checks = new LocalChecks(VersionPacks.builtIn());
    private final CheckScope v22 = new CheckScope("22.x", Map.of(), Set.of());

    @Test
    void builtInPacksLoad() {
        VersionPacks packs = VersionPacks.builtIn();
        assertThat(packs.all()).extracting(VersionPack::version).containsExactly("22.x", "25.x");
        assertThat(packs.find("22.x").orElseThrow().javaLevel()).isEqualTo(8);
        assertThat(packs.find("22.x").orElseThrow().rules()).extracting(PackRule::id)
                .contains("java-no-system-out", "js-no-console", "ui-amd-module", "sql-delete-without-where");
        assertThat(packs.find("25.x").orElseThrow().rules()).extracting(PackRule::id).contains("jet-no-select-one");
    }

    @Test
    void reportsRuleFindingsWithLinesAndIgnoresComments() {
        String java = """
                package com.bank;

                class RemarksValidator {
                    // System.out.println("commented out");
                    void check(String remarks) {
                        System.out.println(remarks);
                        try {
                            remarks.trim();
                        } catch (RuntimeException e) {}
                    }
                }
                """;
        FileChecks.Result result = checks.check(v22, "backend/src/com/bank/RemarksValidator.java", null, java);

        assertThat(result.status()).isEqualTo(FileChecks.Status.FAILED);
        assertThat(result.message()).contains("Line 6 (java-no-system-out, error)", "Line 9 (java-no-empty-catch, error)")
                .doesNotContain("Line 4");
    }

    @Test
    void onlyLinesAddedByTheChangeCount() {
        String original = "define([], function () {\n  console.log('old');\n  return {};\n});\n";
        String changed = "define([], function () {\n  console.log('old');\n  console.log('new');\n  return {};\n});\n";

        FileChecks.Result result = checks.check(v22, "ui/js/viewModels/transfer.js", original, changed);

        assertThat(result.status()).isEqualTo(FileChecks.Status.WARNING);
        assertThat(result.message()).isEqualTo("Line 3 (js-no-console, warning): Remove console logging from UI code.");
        assertThat(checks.check(v22, "ui/js/viewModels/transfer.js", original, original).status()).isEqualTo(FileChecks.Status.PASSED);
    }

    @Test
    void javaIsParsedAtTheBanksLevel() {
        String modern = "class A { record Amount(long value) {} void x() {} }\n";

        FileChecks.Result java8 = checks.check(new CheckScope("22.x", Map.of("backend.javaVersion", "Java 1.8"), Set.of()), "A.java", null, modern);
        assertThat(java8.status()).isEqualTo(FileChecks.Status.FAILED);
        assertThat(java8.message()).startsWith("Not valid Java 8");

        assertThat(checks.check(new CheckScope("22.x", Map.of("backend.javaVersion", "Java 17"), Set.of()), "A.java", null, modern).status())
                .isEqualTo(FileChecks.Status.PASSED);
        // When the existing file already uses newer Java, the detected level is not trusted for it.
        assertThat(checks.check(v22, "A.java", modern, modern.replace("x()", "y()")).status()).isEqualTo(FileChecks.Status.PASSED);
    }

    @Test
    void rulesFollowTheProfileAndWorkspaceSettings() {
        String jakarta = "import jakarta.ws.rs.GET;\nclass A {}\n";
        assertThat(checks.check(v22, "A.java", null, jakarta).status()).isEqualTo(FileChecks.Status.PASSED);
        CheckScope javax = new CheckScope("22.x", Map.of("backend.eeNamespace", "javax"), Set.of());
        assertThat(checks.check(javax, "A.java", null, jakarta).message()).contains("java-javax-namespace");
        CheckScope mixed = new CheckScope("22.x", Map.of("backend.eeNamespace", "javax (mixed: javax (9 uses), jakarta (2 uses))"), Set.of());
        assertThat(checks.check(mixed, "A.java", null, jakarta).status()).isEqualTo(FileChecks.Status.PASSED);

        String noDefine = "var x = 1;\n";
        CheckScope amd = new CheckScope("22.x", Map.of("ui.moduleSystem", "RequireJS (AMD define) (40 files)"), Set.of());
        assertThat(checks.check(amd, "ui/js/viewModels/a.js", null, noDefine).message()).contains("File (ui-amd-module, warning)");
        assertThat(checks.check(new CheckScope("22.x", amd.facts(), Set.of("ui-amd-module")), "ui/js/viewModels/a.js", null, noDefine).status())
                .isEqualTo(FileChecks.Status.PASSED);

        String select = "<div><oj-select-one value='{{x}}'></oj-select-one></div>\n";
        assertThat(checks.check(new CheckScope("25.x", Map.of("ui.jetVersion", "JET 16.1.0"), Set.of()), "v.html", null, select).message())
                .contains("jet-no-select-one");
        assertThat(checks.check(new CheckScope("25.x", Map.of("ui.jetVersion", "JET 11.0.0"), Set.of()), "v.html", null, select).status())
                .isEqualTo(FileChecks.Status.PASSED);
    }

    @Test
    void htmlAndSqlRules() {
        String html = "<div class=\"oj-flex\">\n  <oj-input-text label-hint=\"Remarks\" value=\"{{remarks}}\"></oj-input-text>\n"
                + "  <oj-input-text label-hint=\"[[nls.remarks]]\" value=\"{{remarks}}\"></oj-input-text>\n  <span>Amount</span>\n</div>\n";
        FileChecks.Result result = checks.check(v22, "ui/views/transfer.html", null, html);
        assertThat(result.status()).isEqualTo(FileChecks.Status.WARNING);
        assertThat(result.message().lines()).containsExactly(
                "Line 2 (html-labels-from-bundle, warning): Take visible texts from the resource bundle (nls) through bindings, as the existing views do, so they can be translated.",
                "Line 4 (html-labels-from-bundle, warning): Take visible texts from the resource bundle (nls) through bindings, as the existing views do, so they can be translated.");

        assertThat(checks.check(v22, "db/a.sql", null, "-- DELETE FROM digx_fw_config;\nDELETE FROM digx_fw_config WHERE prop_id = 'X';\n").status())
                .isEqualTo(FileChecks.Status.PASSED);
        assertThat(checks.check(v22, "db/a.sql", null, "DELETE FROM digx_fw_config;\n").message()).contains("sql-delete-without-where");
        assertThat(checks.check(v22, "db/a.sql", null, "UPDATE t SET a = 1;\n").message()).contains("sql-update-without-where");
        assertThat(checks.check(v22, "db/a.sql", null, "UPDATE t SET a = 1 WHERE b = 2;\n").status()).isEqualTo(FileChecks.Status.PASSED);
    }

    @Test
    void teamFilesAddReplaceAndRemoveRules(@TempDir Path dir) throws IOException {
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
        Files.writeString(dir.resolve("22.x.yml"), "java: 11\n");
        VersionPacks packs = new VersionPacks(new PackProperties(dir.toString()));
        LocalChecks team = new LocalChecks(packs);

        assertThat(packs.find("22.x").orElseThrow().javaLevel()).isEqualTo(11);
        assertThat(packs.find("25.x").orElseThrow().rules()).extracting(PackRule::id).contains("bank-logger").doesNotContain("js-no-console");
        assertThat(team.check(v22, "A.java", null, "import java.util.logging.Logger;\nclass A {}\n").message()).contains("bank-logger");
        assertThat(team.describeRules(v22, "A.java")).contains("- Use com.bank.common.BankLogger. (required)");

        Files.writeString(dir.resolve("common.yml"), "rules:\n  - id: broken\n    severity: error\n    files: ['*']\n    forbid: '('\n    message: x\n");
        assertThatThrownBy(() -> new VersionPacks(new PackProperties(dir.toString())))
                .hasMessageContaining("rule broken: invalid regular expression");
    }

    @Test
    void globs() {
        assertThat(Glob.matches("**/*.js", "a.js")).isTrue();
        assertThat(Glob.matches("**/*.js", "ui/js/a.js")).isTrue();
        assertThat(Glob.matches("**/viewModels/**/*.js", "ui/js/viewModels/a.js")).isTrue();
        assertThat(Glob.matches("**/test/**", "backend/src/test/java/A.java")).isTrue();
        assertThat(Glob.matches("*.js", "ui/a.js")).isFalse();
    }
}
