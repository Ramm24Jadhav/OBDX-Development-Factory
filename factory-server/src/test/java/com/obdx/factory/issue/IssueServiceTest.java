package com.obdx.factory.issue;

import com.obdx.factory.common.BadRequestException;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class IssueServiceTest {

    private static final byte[] PNG = {(byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A};
    private static final byte[] JPEG = {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, 0x00};

    @Test
    void acceptsLogsAndRealImagesOnly() {
        assertThat(IssueService.kindOf(new IssueService.Upload("server.LOG", "x".getBytes()))).containsExactly("LOG", "text/plain");
        assertThat(IssueService.kindOf(new IssueService.Upload("error.png", PNG))).containsExactly("SCREENSHOT", "image/png");
        assertThat(IssueService.kindOf(new IssueService.Upload("error.jpeg", JPEG))).containsExactly("SCREENSHOT", "image/jpeg");
        assertThatThrownBy(() -> IssueService.kindOf(new IssueService.Upload("error.png", "<html>".getBytes())))
                .isInstanceOf(BadRequestException.class).hasMessageContaining("attach logs");
        assertThatThrownBy(() -> IssueService.kindOf(new IssueService.Upload("payload.exe", PNG)))
                .isInstanceOf(BadRequestException.class);
        assertThatThrownBy(() -> IssueService.kindOf(new IssueService.Upload("big.log", new byte[IssueService.MAX_LOG_BYTES + 1])))
                .hasMessageContaining("larger than 5 MB");
    }

    @Test
    void looksUpErrorsInTheLibrary() {
        Evidence evidence = LogEvidenceParser.parse(java.util.List.of(
                new LogEvidenceParser.Source("server.log", """
                        ERROR Host returned DIGX_PY_0131
                        java.net.ConnectException: Connection refused
                            at com.bank.obdx.payments.FundTransferService.transfer(FundTransferService.java:142)
                            at com.bank.obdx.payments.Other.call(Other.java:1)
                        """, false),
                new LogEvidenceParser.Source("error.png", "Error message: Transfer could not be completed\nScreen: Own Account Transfer", true)));
        assertThat(IssueService.libraryQueries(evidence)).containsExactly("DIGX_PY_0131", "java.net.ConnectException: Connection refused",
                "FundTransferService transfer", "Transfer could not be completed");
    }

    @Test
    void limitsRequestsFromOneAddress() {
        IssueLinks links = new IssueLinks(null, null, null, null);
        for (int i = 0; i < IssueLinks.REQUESTS_PER_MINUTE; i++) {
            links.limit("10.0.0.1");
        }
        assertThatThrownBy(() -> links.limit("10.0.0.1")).hasMessageContaining("Too many requests");
        links.limit("10.0.0.2");
        assertThat(IssueLinks.hash("abc")).hasSize(64).isEqualTo(IssueLinks.hash("abc")).isNotEqualTo(IssueLinks.hash("abd"));
        assertThat(IssueLinks.newToken()).hasSize(32).isNotEqualTo(IssueLinks.newToken());
    }

    @Test
    void titlesAreTheFirstSentenceAndShort() {
        assertThat(IssueService.title("Customers in UAT cannot make transfers. After Submit they see an error.")).isEqualTo("Customers in UAT cannot make transfers.");
        assertThat(IssueService.title("Error 1.2 in version 22.2 when paying")).isEqualTo("Error 1.2 in version 22.2 when paying");
        String longLine = "word ".repeat(40).strip();
        assertThat(IssueService.title(longLine)).hasSizeLessThanOrEqualTo(103).endsWith("...");
    }

    @Test
    void turnsEvidenceIntoCodeSearches() {
        assertThat(IssueService.frameQuery("com.bank.obdx.payments.FundTransferService.transfer(FundTransferService.java:142)"))
                .isEqualTo("FundTransferService transfer");
        assertThat(IssueService.frameQuery("com.bank.Outer$Inner.lambda$run$0(Outer.java:5)")).isEqualTo("Outer$Inner lambda");
        assertThat(IssueService.host("http://payhost:8080/pay")).isEqualTo("payhost");
        assertThat(IssueService.host("not a url")).isNull();
    }
}
