package com.obdx.factory.jenkins;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class BuildLogParserTest {

    @Test
    void findsCompilerAndToolErrors() {
        String log = """
                [INFO] --- maven-compiler-plugin:3.11.0:compile (default-compile) ---
                [ERROR] /var/jenkins/workspace/obdx/backend/src/com/bank/payments/RemarksValidator.java:[14,13] cannot find symbol
                \u001B[1;31m[ERROR]\u001B[m /var/jenkins/workspace/obdx/backend/src/com/bank/payments/FundTransferService.java:[22,9] ';' expected
                    [javac] src\\com\\bank\\Legacy.java:7: error: incompatible types
                ui/js/viewModels/fund-transfer.js:12:5: Parsing error: Unexpected token )
                ui/ts/remarks.ts(3,10): error TS2304: Cannot find name 'ko'.
                [ERROR] Failed to execute goal org.apache.maven.plugins:maven-compiler-plugin
                """;

        List<BuildLogParser.BuildError> errors = BuildLogParser.errors(log);

        assertThat(errors).extracting(BuildLogParser.BuildError::file, BuildLogParser.BuildError::line, BuildLogParser.BuildError::message)
                .containsExactly(
                        org.assertj.core.groups.Tuple.tuple("/var/jenkins/workspace/obdx/backend/src/com/bank/payments/RemarksValidator.java", 14, "cannot find symbol"),
                        org.assertj.core.groups.Tuple.tuple("/var/jenkins/workspace/obdx/backend/src/com/bank/payments/FundTransferService.java", 22, "';' expected"),
                        org.assertj.core.groups.Tuple.tuple("src/com/bank/Legacy.java", 7, "incompatible types"),
                        org.assertj.core.groups.Tuple.tuple("ui/js/viewModels/fund-transfer.js", 12, "Parsing error: Unexpected token )"),
                        org.assertj.core.groups.Tuple.tuple("ui/ts/remarks.ts", 3, "error TS2304: Cannot find name 'ko'."));
    }

    @Test
    void matchesBuildPathsToChangedFiles() {
        List<String> changed = List.of("backend/src/com/bank/payments/RemarksValidator.java", "ui/js/viewModels/fund-transfer.js");

        assertThat(BuildLogParser.matchFile("/var/jenkins/workspace/x/backend/src/com/bank/payments/RemarksValidator.java", changed))
                .isEqualTo("backend/src/com/bank/payments/RemarksValidator.java");
        assertThat(BuildLogParser.matchFile("com/bank/payments/RemarksValidator.java", changed))
                .isEqualTo("backend/src/com/bank/payments/RemarksValidator.java");
        assertThat(BuildLogParser.matchFile("ui/js/viewModels/fund-transfer.js", changed)).isEqualTo("ui/js/viewModels/fund-transfer.js");
        assertThat(BuildLogParser.matchFile("/w/backend/src/com/bank/Other.java", changed)).isNull();
        assertThat(BuildLogParser.matchFile("Validator.java", changed)).as("only whole path segments match").isNull();
        assertThat(BuildLogParser.tail("a\nb\nc\nd", 2)).isEqualTo("c\nd");
    }
}
