package com.obdx.factory.search;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class CodeSearchServiceTest {

    @Test
    void buildsOrQueryFromMeaningfulWords() {
        assertThat(CodeSearchService.toTsQuery("Where is the fund transfer limit implemented?"))
                .isEqualTo("fund:* | transfer:* | limit:*");
    }

    @Test
    void splitsIdentifiersInTheQuery() {
        assertThat(CodeSearchService.toTsQuery("FundTransferService"))
                .isEqualTo("fundtransferservice:* | fund:* | transfer:* | service:*");
    }

    @Test
    void returnsEmptyQueryForStopWordsOnly() {
        assertThat(CodeSearchService.toTsQuery("where is it?")).isEmpty();
    }
}
