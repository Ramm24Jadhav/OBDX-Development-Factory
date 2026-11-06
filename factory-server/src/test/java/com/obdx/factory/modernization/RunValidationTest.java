package com.obdx.factory.modernization;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class RunValidationTest {

    @Test
    void typesEachSuiteFromItsName() {
        assertThat(RunValidation.typeOf("FundTransferPage.spec com.bank.FundTransferPageTest")).isEqualTo("unit");
        assertThat(RunValidation.typeOf("journeys/transfer.e2e")).isEqualTo("functional");
        assertThat(RunValidation.typeOf("Playwright transfer journey")).isEqualTo("functional");
        assertThat(RunValidation.typeOf("axe accessibility checks")).isEqualTo("accessibility");
        assertThat(RunValidation.typeOf("OWASP ZAP baseline")).isEqualTo("security");
        assertThat(RunValidation.typeOf("Lighthouse page load")).isEqualTo("performance");
        assertThat(RunValidation.typeOf("TransferApiContractTest")).isEqualTo("api");
        assertThat(RunValidation.typeOf("visual snapshots")).isEqualTo("ui");
        assertThat(RunValidation.typeOf(null)).isEqualTo("unit");
        assertThat(RunValidation.TYPES).contains("unit", "functional", "api", "security", "accessibility", "ui", "performance");
    }
}
