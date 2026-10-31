package com.obdx.factory.common;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** Paths and texts with a NUL or control character are refused with 400 before they reach SQL or the file system. */
class RequestTextTest {

    @Test
    void aPathWithAControlCharacterIsNotValid() {
        assertThat(RequestText.validPath("ui/js/viewModels/transfer.js")).isTrue();
        assertThat(RequestText.validPath("src/a b/Ü.java")).isTrue();
        assertThat(RequestText.validPath("")).as("an empty search lists everything").isTrue();
        assertThat(RequestText.validPath("a\0b.java")).isFalse();
        assertThat(RequestText.validPath("a\nb.java")).isFalse();
        assertThat(RequestText.validPath(null)).isFalse();
        assertThatThrownBy(() -> RequestText.requirePath("a\0b")).isInstanceOf(BadRequestException.class).hasMessageContaining("not valid");
    }

    @Test
    void textMayHaveLineBreaksButNoNul() {
        assertThatCode(() -> RequestText.requireText("line 1\nline 2\ttab")).doesNotThrowAnyException();
        assertThatCode(() -> RequestText.requireText(null)).doesNotThrowAnyException();
        assertThatThrownBy(() -> RequestText.requireText("a\0b")).isInstanceOf(BadRequestException.class);
    }
}
