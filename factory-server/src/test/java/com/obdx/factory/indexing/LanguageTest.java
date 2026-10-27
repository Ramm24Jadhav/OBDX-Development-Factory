package com.obdx.factory.indexing;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class LanguageTest {

    @Test
    void detectsSourceFilesAndSkipsMinifiedAndUnknownFiles() {
        assertThat(Language.of("FundTransfer.java")).contains("java");
        assertThat(Language.of("transfer.JS")).contains("javascript");
        assertThat(Language.of("transfer.html")).contains("html");
        assertThat(Language.of("resources.properties")).contains("properties");
        assertThat(Language.of("knockout.min.js")).isEmpty();
        assertThat(Language.of("logo.png")).isEmpty();
        assertThat(Language.of("Makefile")).isEmpty();
    }
}
