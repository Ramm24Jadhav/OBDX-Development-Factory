package com.obdx.factory.change;

import com.obdx.factory.common.BadRequestException;
import com.obdx.factory.common.Messages;
import com.obdx.factory.requirements.RequirementSpec;
import org.junit.jupiter.api.Test;

import java.time.Duration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.junit.jupiter.api.Assertions.assertTimeoutPreemptively;

/** Adversarial input to the change's checks: long strings, long whitespace, long paths, large edits. */
class LongInputChangeTest {

    private static final Duration QUICK = Duration.ofSeconds(2);

    @Test
    void javaScriptWithLongStringsAndUnclosedCommentsIsCheckedQuickly() {
        String js = "define(['knockout'], function (ko) {\n  const s = \"" + "x".repeat(10_000) + "\";\n  const t = `" + "y".repeat(10_000)
                + "`;\n  return function () { this.s = ko.observable(s + t); };\n});\n";
        assertThat(assertTimeoutPreemptively(QUICK, () -> JavaScriptCheck.check(js)).status()).isEqualTo(FileChecks.Status.PASSED);
        assertThat(assertTimeoutPreemptively(QUICK, () -> JavaScriptCheck.codeOnly("a(); /*" + "z".repeat(400_000)))).hasSize(400_007);
    }

    @Test
    void theReactTestIsLinearOnLongWhitespace() {
        String spaces = "return (" + " ".repeat(80_000) + "x";
        assertThat(assertTimeoutPreemptively(QUICK, () -> FileChecks.looksLikeJsx(spaces))).isFalse();
        assertThat(assertTimeoutPreemptively(QUICK, () -> FileChecks.looksLikeJsx("(".repeat(80_000)))).isFalse();
        assertThat(FileChecks.looksLikeJsx("return (\n    <View>")).isTrue();
    }

    @Test
    void aVeryLongApiTextIsNotReadPastItsStart() {
        String segments = "/a".repeat(5_000);
        RequirementSpec.Api api = new RequirementSpec.Api("GET " + segments, "GET", null);
        String path = assertTimeoutPreemptively(QUICK, () -> PlanReview.pathOf(api));
        assertThat(path).startsWith("/a/a").hasSizeLessThanOrEqualTo(PlanReview.MAX_TEXT);
    }

    @Test
    void anEditLargerThanTheFactoryKeepsIsRefused() {
        assertThatCode(() -> ChangeService.requireEditable("x".repeat(ChangeService.MAX_EDIT_BYTES))).doesNotThrowAnyException();
        assertThatThrownBy(() -> ChangeService.requireEditable("x".repeat(ChangeService.MAX_EDIT_BYTES + 1)))
                .isInstanceOf(BadRequestException.class).hasMessageContaining("512 KB").hasMessageContaining("working copy");
        // characters of several bytes count as bytes
        assertThatThrownBy(() -> ChangeService.requireEditable("é".repeat(ChangeService.MAX_EDIT_BYTES / 2 + 1))).isInstanceOf(BadRequestException.class);
    }

    @Test
    void aFailureReasonIsOneShortLine() {
        assertThat(Messages.reason(new StackOverflowError())).contains("could not follow");
        assertThat(Messages.reason(new IllegalStateException("model said:\n\u0007" + "q".repeat(1_000)))).hasSize(300)
                .startsWith("model said: q").endsWith("...");
        assertThat(Messages.reason(new IllegalStateException((String) null))).isEqualTo("IllegalStateException");
    }
}
