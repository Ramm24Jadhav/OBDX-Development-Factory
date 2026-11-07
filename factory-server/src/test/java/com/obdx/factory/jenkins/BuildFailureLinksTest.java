package com.obdx.factory.jenkins;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Regression audit A3: a log line naming a file of the change after Maven's [ERROR] and without a column is read
 * with its file and line (so the build page links it), and a JUnit class reported by a JavaScript test is matched to
 * the change's test file.
 */
class BuildFailureLinksTest {

    @Test
    void anEslintLineAfterMavensErrorTagIsReadWithItsFileAndLine() {
        List<BuildLogParser.BuildError> errors = BuildLogParser.errors("Started by user factory\n"
                + "[ERROR] channel/components/modules/quick-transfer/quick-transfer.js:12: ESLint: no-undef 'rootParams'\n"
                + "Tests run: 2, Failures: 1\nFinished: FAILURE\n");
        assertThat(errors).containsExactly(new BuildLogParser.BuildError("channel/components/modules/quick-transfer/quick-transfer.js", 12,
                "ESLint: no-undef 'rootParams'"));
        // with a column, as before
        assertThat(BuildLogParser.errors("ui/js/a.js:10:5: error 'x' is not defined")).containsExactly(
                new BuildLogParser.BuildError("ui/js/a.js", 10, "error 'x' is not defined"));
    }

    @Test
    void linesThatOnlyMentionAFileAreNotErrors() {
        assertThat(BuildLogParser.errors("[INFO] Copying quick-transfer.js\nFinished: FAILURE\n[ERROR] see quick-transfer.js:12")).isEmpty();
    }

    @Test
    void aJavaScriptTestSuiteIsMatchedToTheChangesTestFile() {
        List<String> changed = List.of("channel/components/modules/quick-transfer/quick-transfer.js",
                "channel/components/modules/quick-transfer/quick-transfer.spec.js");
        assertThat(BuildLogParser.testFile("QuickTransferTest", changed)).isEqualTo("channel/components/modules/quick-transfer/quick-transfer.spec.js");
        assertThat(BuildLogParser.testFile("com.bank.QuickTransferSpec", List.of("ui/quickTransfer.test.js"))).isEqualTo("ui/quickTransfer.test.js");
        // not the code file of the same name, nor another suite
        assertThat(BuildLogParser.testFile("QuickTransferTest", List.of("ui/quick-transfer.js"))).isNull();
        assertThat(BuildLogParser.testFile("PayeesTest", changed)).isNull();
        assertThat(BuildLogParser.testFile("Test", changed)).isNull();
    }
}
