package com.obdx.factory.trial;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class DemoWorkspacesTest {

    @Test
    void namesTheBankAfterTheRepository() {
        assertThat(DemoWorkspaces.bankName("bank-a")).isEqualTo("Bank A");
        assertThat(DemoWorkspaces.bankName("acme")).isEqualTo("Acme");
    }
}
