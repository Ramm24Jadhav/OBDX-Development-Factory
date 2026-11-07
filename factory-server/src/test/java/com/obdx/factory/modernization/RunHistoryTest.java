package com.obdx.factory.modernization;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class RunHistoryTest {

    @Test
    void putsEachRunInOneResultCategory() {
        assertThat(RunHistory.category("delivered", "DELIVERED", "SUCCESS", 0, 0)).isEqualTo("completed");
        assertThat(RunHistory.category("delivered", "DELIVERED", "SUCCESS", 3, 0)).isEqualTo("problems");
        assertThat(RunHistory.category("delivered", "DELIVERED", null, 0, 2)).isEqualTo("problems");
        assertThat(RunHistory.category("rejected", "CLOSED", null, 0, 0)).isEqualTo("failed");
        assertThat(RunHistory.category("validating", "GENERATED", "FAILURE", 0, 0)).isEqualTo("failed");
        assertThat(RunHistory.category("validating", "GENERATED", "UNSTABLE", 2, 0)).isEqualTo("running");
        assertThat(RunHistory.category("writing", "GENERATING", null, 0, 0)).isEqualTo("running");
    }
}
