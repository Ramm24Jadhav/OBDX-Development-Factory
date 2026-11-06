package com.obdx.factory.issue;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class LogEvidenceParserTest {

    private static Evidence parse(String text) {
        return LogEvidenceParser.parse(List.of(new LogEvidenceParser.Source("server.log", text, false)));
    }

    private static List<String> texts(Evidence evidence, String kind) {
        return evidence.items().stream().filter(i -> i.kind().equals(kind)).map(Evidence.Item::text).toList();
    }

    @Test
    void findsExceptionsCausesAndCodeFramesButNotPlatformFrames() {
        Evidence evidence = parse("""
                2026-11-06 10:15:02 ERROR [payments] Transfer failed
                java.lang.IllegalStateException: Transfer could not be initiated
                    at com.bank.obdx.payments.FundTransferService.transfer(FundTransferService.java:142)
                    at com.ofss.digx.app.payment.service.PaymentService.initiate(PaymentService.java:88)
                    at java.base/java.lang.Thread.run(Thread.java:1583)
                    at org.springframework.web.servlet.FrameworkServlet.service(FrameworkServlet.java:885)
                Caused by: java.lang.NullPointerException: Cannot invoke "String.length()" because "remarks" is null
                    at com.bank.obdx.payments.TransferLimitValidator.validate(TransferLimitValidator.java:31)
                """);

        assertThat(texts(evidence, "EXCEPTION")).containsExactly("java.lang.IllegalStateException: Transfer could not be initiated");
        assertThat(texts(evidence, "CAUSE")).singleElement().asString().startsWith("java.lang.NullPointerException");
        assertThat(texts(evidence, "FRAME")).containsExactly(
                "com.bank.obdx.payments.FundTransferService.transfer(FundTransferService.java:142)",
                "com.ofss.digx.app.payment.service.PaymentService.initiate(PaymentService.java:88)",
                "com.bank.obdx.payments.TransferLimitValidator.validate(TransferLimitValidator.java:31)");
        assertThat(evidence.items()).filteredOn(i -> i.kind().equals("FRAME")).first().extracting(Evidence.Item::line).isEqualTo(3);
        assertThat(texts(evidence, "ERROR_LINE")).hasSize(1);
        assertThat(evidence.signature()).isEqualTo("java.lang.illegalstateexception java.lang.nullpointerexception "
                + "com.bank.obdx.payments.fundtransferservice.transfer");
        assertThat(evidence.items()).extracting(Evidence.Item::id).startsWith("E1", "E2");
    }

    @Test
    void findsUrlsConfigurationKeysHttpStatusesAndErrorCodes() {
        Evidence evidence = parse("""
                <Error> Property payments.host.url not configured, using default; calling http://payhost:8080/pay
                java.net.ConnectException: Connection refused
                Response code: 401 from token service, correlationId=7f3a9c21-b6
                Host returned DIGX_PY_0131 and ORA-12541: TNS no listener; status 403
                Missing PAYMENT_HOST_TIMEOUT in config
                """);

        assertThat(texts(evidence, "URL")).containsExactly("http://payhost:8080/pay");
        assertThat(texts(evidence, "KEY")).extracting(t -> t.split(" in: ")[0]).containsExactly("payments.host.url", "PAYMENT_HOST_TIMEOUT");
        assertThat(texts(evidence, "HTTP_STATUS")).extracting(t -> t.substring(0, 8)).containsExactly("HTTP 401", "HTTP 403");
        assertThat(texts(evidence, "ERROR_CODE")).extracting(t -> t.split(" in: ")[0]).containsExactly("DIGX_PY_0131", "ORA-12541");
        assertThat(texts(evidence, "CORRELATION_ID")).containsExactly("7f3a9c21-b6");
        assertThat(texts(evidence, "EXCEPTION")).containsExactly("java.net.ConnectException: Connection refused");
        assertThat(evidence.signature()).contains("java.net.connectexception", "digx_py_0131", "ora-12541");
    }

    @Test
    void keysAreNotClassesFilesOrPackages() {
        assertThat(LogEvidenceParser.keys("Missing property obdx.payments.limit in com.bank.Config and app.properties"))
                .containsExactly("obdx.payments.limit");
    }

    @Test
    void findsNothingInALogWithoutErrors() {
        Evidence evidence = parse("""
                2026-11-06 10:00:00 INFO Server started in 12 seconds
                2026-11-06 10:00:01 INFO Deployed obdx.ear
                """);
        assertThat(evidence.items()).isEmpty();
        assertThat(evidence.signature()).isEmpty();
    }

    @Test
    void keepsScreenshotTextWithoutLineNumbers() {
        Evidence evidence = LogEvidenceParser.parse(List.of(new LogEvidenceParser.Source("error.png",
                "Error message: Transfer could not be completed\nError code: DIGX_PY_0131", true)));
        assertThat(evidence.items()).first().satisfies(item -> {
            assertThat(item.kind()).isEqualTo("SCREENSHOT");
            assertThat(item.line()).isNull();
            assertThat(item.text()).contains("Transfer could not be completed");
        });
        assertThat(texts(evidence, "ERROR_CODE")).hasSize(1);
    }
}
