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
    void turnsEvidenceIntoCodeSearches() {
        assertThat(IssueService.frameQuery("com.bank.obdx.payments.FundTransferService.transfer(FundTransferService.java:142)"))
                .isEqualTo("FundTransferService transfer");
        assertThat(IssueService.frameQuery("com.bank.Outer$Inner.lambda$run$0(Outer.java:5)")).isEqualTo("Outer$Inner lambda");
        assertThat(IssueService.host("http://payhost:8080/pay")).isEqualTo("payhost");
        assertThat(IssueService.host("not a url")).isNull();
    }
}
