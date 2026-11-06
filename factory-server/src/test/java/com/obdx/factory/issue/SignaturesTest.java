package com.obdx.factory.issue;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class SignaturesTest {

    private static Evidence parse(String log) {
        return LogEvidenceParser.parse(List.of(new LogEvidenceParser.Source("server.log", log, false)));
    }

    private static final Evidence ORIGINAL = parse("""
            2026-11-06 10:15:02 ERROR Transfer failed
            java.net.ConnectException: Connection refused
                at com.bank.obdx.payments.FundTransferService.transfer(FundTransferService.java:142)
            """);

    @Test
    void seesTheOriginalErrorStillThere() {
        Signatures.Comparison c = Signatures.compare(ORIGINAL, parse("ERROR again\njava.net.ConnectException: Connection refused"));
        assertThat(c.result()).isEqualTo("STILL_FAILING");
        assertThat(c.summary()).contains("java.net.connectexception");
    }

    @Test
    void seesADifferentError() {
        Signatures.Comparison c = Signatures.compare(ORIGINAL, parse("""
                2026-11-06 11:00:00 ERROR Token service answered HTTP 401
                javax.net.ssl.SSLHandshakeException: PKIX path building failed
                """));
        assertThat(c.result()).isEqualTo("DIFFERENT_ERROR");
        assertThat(c.summary()).contains("SSLHandshakeException");
    }

    @Test
    void seesTheErrorGone() {
        Signatures.Comparison c = Signatures.compare(ORIGINAL, parse("2026-11-06 11:00:00 INFO Transfer TX-1 completed"));
        assertThat(c.result()).isEqualTo("ERROR_GONE");
    }

    @Test
    void cannotCompareWithoutAnOriginalError() {
        assertThat(Signatures.compare(parse("INFO started"), parse("ERROR boom")).result()).isEqualTo("NOT_COMPARABLE");
    }

    @Test
    void sameErrorNeedsTwoTokensOrAnErrorCode() {
        assertThat(Signatures.sameError("java.net.connectexception com.bank.a.b", "java.net.connectexception com.bank.a.b")).isTrue();
        assertThat(Signatures.sameError("java.lang.nullpointerexception com.bank.a.b", "java.lang.nullpointerexception com.bank.c.d")).isFalse();
        assertThat(Signatures.sameError("digx_py_0131", "java.lang.illegalstateexception digx_py_0131")).isTrue();
        assertThat(Signatures.sameError("", "digx_py_0131")).isFalse();
    }
}
