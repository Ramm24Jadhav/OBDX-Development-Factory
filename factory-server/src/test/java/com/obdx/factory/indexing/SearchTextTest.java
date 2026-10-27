package com.obdx.factory.indexing;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class SearchTextTest {

    @Test
    void splitsCamelSnakeAndKebabCaseIdentifiers() {
        assertThat(SearchText.splitIdentifiers("getFundTransferDTO fund_transfer_limit own-account-transfer"))
                .containsExactly("get", "fund", "transfer", "dto", "limit", "own", "account");
    }

    @Test
    void searchTextContainsPathSymbolContentAndWords() {
        String text = SearchText.build("payments/FundTransferService.java", "FundTransferService.transfer()", "return ok;");

        assertThat(text).contains("payments FundTransferService java", "FundTransferService.transfer()", "return ok;", "fund", "transfer");
    }
}
