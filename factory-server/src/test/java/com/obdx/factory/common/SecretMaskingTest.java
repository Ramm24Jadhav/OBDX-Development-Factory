package com.obdx.factory.common;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.LoggerContext;
import ch.qos.logback.classic.encoder.PatternLayoutEncoder;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.OutputStreamAppender;
import com.obdx.factory.jenkins.JenkinsException;
import com.obdx.factory.model.ModelGatewayException;
import java.util.List;
import com.obdx.factory.svn.SvnException;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Regression audit C1, C2, C4: the secret values the factory holds (an SVN password, an API key without a known
 * prefix) are masked by their value wherever messages, problem details, audit details and the log are written, not
 * only when they look like a secret.
 */
class SecretMaskingTest {

    @org.junit.jupiter.api.BeforeEach
    @AfterEach
    void forget() {
        KnownSecrets.clear();
    }

    @Test
    void aKnownValueIsMaskedWhereverItIsEchoed() {
        KnownSecrets.used("Winter-2026!");
        assertThat(KnownSecrets.masked("Repository broken for login svcx:Winter-2026! (500)"))
                .isEqualTo("Repository broken for login svcx:[hidden] (500)");
        // in a URL and in JSON, as servers echo it
        assertThat(KnownSecrets.masked("https://svcx:Winter-2026%21@svn/x and {\"pw\":\"Winter-2026!\"}"))
                .isEqualTo("https://svcx:[hidden]@svn/x and {\"pw\":\"[hidden]\"}");
        assertThat(Messages.redacted("login svcx:Winter-2026!")).isEqualTo("login svcx:[hidden]");
        assertThat(Messages.reason(new IllegalStateException("failed: Winter-2026!"))).isEqualTo("failed: [hidden]");
    }

    @Test
    void anApiKeyWithoutAKnownPrefixIsMasked() {
        KnownSecrets.setting("model.apiKey", "AzureKey7c1e9f00d4b2a8");
        String body = "{\"error\":{\"message\":\"Bad key AzureKey7c1e9f00d4b2a8 for deployment\"}}";
        assertThat(Messages.redacted(body)).doesNotContain("AzureKey7c1e").contains("[hidden]");
        assertThat(new ModelGatewayException("Chat model 'x' failed: " + body, null).getMessage()).doesNotContain("AzureKey7c1e");
    }

    @Test
    void shortValuesAreMaskedOnlyAsWholeWordsAndTinyOnesNotAtAll() {
        KnownSecrets.used("t3st");
        KnownSecrets.used("ab");
        assertThat(KnownSecrets.masked("Unit t3sts failed; password t3st was refused; ab"))
                .isEqualTo("Unit t3sts failed; password [hidden] was refused; ab");
        KnownSecrets.used(null);
        KnownSecrets.used("   ");
        assertThat(KnownSecrets.masked("x")).isEqualTo("x");
    }

    @Test
    void placeholderKeysAndShortPlainWordsAreNeverMasked() {
        for (String dummy : List.of("ollama", "EMPTY", "lm-studio", "test", "not-needed", "none", "dummy", "Failing", "revision")) {
            KnownSecrets.used(dummy);
            KnownSecrets.setting("model.apiKey", dummy);
        }
        String text = "Failing checks: revision 3; ollama none dummy test EMPTY lm-studio not-needed";
        assertThat(KnownSecrets.masked(text)).isEqualTo(text);
    }

    @Test
    void aSettingsSecretIsReplacedNotAddedAndNeverPushedOut() {
        KnownSecrets.setting("model.apiKey", "OldKey-0000-aaaa");
        KnownSecrets.setting("model.apiKey", "NewKey-1111-bbbb");
        assertThat(KnownSecrets.masked("OldKey-0000-aaaa NewKey-1111-bbbb")).isEqualTo("OldKey-0000-aaaa [hidden]");
        // values used at run time are capped; the settings' are not dropped
        for (int i = 0; i < KnownSecrets.MAX_KEPT + 50; i++) {
            KnownSecrets.used("UsedValue-" + i + "-x");
        }
        assertThat(KnownSecrets.masked("NewKey-1111-bbbb UsedValue-0-x")).isEqualTo("[hidden] UsedValue-0-x");
        KnownSecrets.setting("model.apiKey", "");
        assertThat(KnownSecrets.masked("NewKey-1111-bbbb")).isEqualTo("NewKey-1111-bbbb");
    }

    @Test
    void encodedFormsAndHeadersAreMasked() {
        KnownSecrets.used("Pa&ss<1>word");
        KnownSecrets.used(java.util.Base64.getEncoder().encodeToString("svc:Pa&ss<1>word".getBytes(java.nio.charset.StandardCharsets.UTF_8)));
        assertThat(KnownSecrets.masked("<m:human-readable>login Pa&amp;ss&lt;1&gt;word</m:human-readable>")).doesNotContain("Pa&amp;ss");
        assertThat(KnownSecrets.masked("Authorization: Basic " + java.util.Base64.getEncoder().encodeToString(
                "svc:Pa&ss<1>word".getBytes(java.nio.charset.StandardCharsets.UTF_8)))).isEqualTo("Authorization: Basic [hidden]");
        // by the patterns, whatever the value
        assertThat(Messages.redacted("Authorization: Basic c3ZjOnNlY3JldA== sent")).isEqualTo("Authorization: Basic [hidden] sent");
        assertThat(Messages.redacted("Cookie: JSESSIONID=ABCDEF0123456789; Path=/")).isEqualTo("Cookie: JSESSIONID=[hidden]; Path=/");
        assertThat(Messages.redacted("GET /api/review/Abc_def-0123456789xyzABCDEFGHIJ/comments"))
                .isEqualTo("GET /api/review/[hidden]/comments");
    }

    @Test
    void withoutKnownValuesTextIsUnchanged() {
        assertThat(KnownSecrets.masked("svn: E170013: Unable to connect")).isEqualTo("svn: E170013: Unable to connect");
        assertThat(KnownSecrets.masked(null)).isNull();
        KnownSecrets.used("Winter-2026!");
        assertThat(KnownSecrets.masked("nothing secret here")).isEqualTo("nothing secret here");
    }

    @Test
    void svnJenkinsAndModelErrorsNeverCarryTheValue() {
        KnownSecrets.used("S3cret-Svn-Pass");
        assertThat(new SvnException("svn info failed: svn: E160013: Repository broken for login svcx:S3cret-Svn-Pass").getMessage())
                .doesNotContain("S3cret-Svn-Pass").contains("svcx:[hidden]");
        new com.obdx.factory.jenkins.JenkinsClient("http://127.0.0.1:1", "u", "jenkinsTok3n-777", new com.obdx.factory.jenkins.JenkinsProperties(
                java.time.Duration.ofSeconds(1), java.time.Duration.ofSeconds(1), java.time.Duration.ofSeconds(1), java.time.Duration.ofSeconds(1),
                1, org.springframework.util.unit.DataSize.ofKilobytes(10)));
        assertThat(new JenkinsException("Jenkins answered 500: token jenkinsTok3n-777").getMessage()).doesNotContain("jenkinsTok3n-777");
        // the problem detail the UI shows
        assertThat(ApiExceptionHandler.problem(HttpStatus.BAD_GATEWAY, "echo S3cret-Svn-Pass").getDetail()).isEqualTo("echo [hidden]");
    }

    @Test
    void theLogIsRedactedStackTracesIncluded() {
        KnownSecrets.setting("model.apiKey", "AzureKey7c1e9f00d4b2a8");
        LoggerContext context = (LoggerContext) org.slf4j.LoggerFactory.getILoggerFactory();
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        PatternLayoutEncoder encoder = new PatternLayoutEncoder();
        encoder.setContext(context);
        encoder.setPattern("%m%n%ex");
        encoder.setCharset(StandardCharsets.UTF_8);
        encoder.start();
        OutputStreamAppender<ILoggingEvent> appender = new OutputStreamAppender<>();
        appender.setContext(context);
        appender.setEncoder(encoder);
        appender.setOutputStream(out);
        appender.start();
        Logger logger = context.getLogger("audit-c4-test");
        logger.setAdditive(false);
        logger.addAppender(appender);
        try {
            RedactedLog.install();
            RedactedLog.install();
            assertThat(appender.getEncoder()).isInstanceOf(RedactedLog.RedactingEncoder.class);
            RuntimeException cause = new RuntimeException("{\"error\":{\"message\":\"key AzureKey7c1e9f00d4b2a8 and Bearer abc123\"}}");
            logger.warn("Could not write a file", new ModelGatewayException("Chat model failed", cause));
            String written = out.toString(StandardCharsets.UTF_8);
            assertThat(written).contains("Could not write a file").contains("Caused by: java.lang.RuntimeException")
                    .doesNotContain("AzureKey7c1e").doesNotContain("abc123");
            // the first administrator's random password is written as it is only to the console, never to a log file
            logger.warn(RedactedLog.SHOWN_ONCE, "Username: admin  Password: {}  (shown once)", "Rand0m-Pass-x");
            assertThat(out.toString(StandardCharsets.UTF_8)).doesNotContain("Rand0m-Pass-x");
            // a marker of the same name made elsewhere does not count
            logger.warn(org.slf4j.MarkerFactory.getMarker("SHOWN_ONCE"), "Password: {}", "Rand0m-Pass-y");
            assertThat(out.toString(StandardCharsets.UTF_8)).doesNotContain("Rand0m-Pass-y");
        } finally {
            logger.detachAppender(appender);
            appender.stop();
        }
    }

    @Test
    void theFirstAdministratorsPasswordIsShownOnTheConsole() {
        LoggerContext context = (LoggerContext) org.slf4j.LoggerFactory.getILoggerFactory();
        java.io.PrintStream before = System.out;
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        PatternLayoutEncoder encoder = new PatternLayoutEncoder();
        encoder.setContext(context);
        encoder.setPattern("%m%n");
        encoder.setCharset(StandardCharsets.UTF_8);
        encoder.start();
        ch.qos.logback.core.ConsoleAppender<ILoggingEvent> console = new ch.qos.logback.core.ConsoleAppender<>();
        console.setContext(context);
        console.setEncoder(encoder);
        Logger logger = context.getLogger("audit-shown-once-test");
        logger.setAdditive(false);
        System.setOut(new java.io.PrintStream(out, true, StandardCharsets.UTF_8));
        try {
            console.start();
            logger.addAppender(console);
            RedactedLog.install();
            logger.warn(RedactedLog.SHOWN_ONCE, "Username: admin  Password: {}  (shown once)", "Rand0m-Pass-z");
            logger.warn("Username: admin  Password: {}", "Rand0m-Pass-w");
            assertThat(out.toString(StandardCharsets.UTF_8)).contains("Password: Rand0m-Pass-z").doesNotContain("Rand0m-Pass-w");
        } finally {
            System.setOut(before);
            logger.detachAppender(console);
            console.stop();
        }
    }
}
