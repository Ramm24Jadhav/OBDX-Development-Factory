package com.obdx.factory.issue;

import org.junit.jupiter.api.Test;

import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

class SecretMaskerTest {

    @Test
    void masksPasswordsTokensAndHeaders() {
        String masked = SecretMasker.mask("""
                db.password=Welcome#123
                "apiKey": "sk-live-abc"
                Authorization: Bearer abc.def-ghi
                token is eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl
                """);
        assertThat(masked).doesNotContain("Welcome#123", "sk-live-abc", "abc.def-ghi", "eyJhbGci")
                .contains("db.password=****", "\"apiKey\": \"****", "Authorization: ****");
    }

    @Test
    void keepsTheLastFourDigitsOfCardAndAccountNumbers() {
        assertThat(SecretMasker.mask("card 4111 1111 1111 1111 and account 001234567890 failed"))
                .isEqualTo("card ****1111 and account ****7890 failed");
        // Short numbers, line numbers, times and versions stay
        assertThat(SecretMasker.mask("line 142 at 10:15:02, version 22.1.0.0, port 8080, code 12345678"))
                .isEqualTo("line 142 at 10:15:02, version 22.1.0.0, port 8080, code 12345678");
    }

    @Test
    void findsBankDataThatMustNotBeShared() {
        assertThat(SecretMasker.bankData("Set the endpoint to https://pay.bank-a.local/api on 10.1.2.3 for Bank A",
                Set.of("Bank A", "UAT ws")))
                .containsExactly("https://pay.bank-a.local/api", "10.1.2.3", "Bank A");
        assertThat(SecretMasker.bankData("Set the payment host endpoint in the system configuration", Set.of("Bank A"))).isEmpty();
    }
}
