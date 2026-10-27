package com.obdx.factory.indexing;

/**
 * A searchable piece of a source file. Lines are 1-based and inclusive.
 *
 * @param kind   "class", "method", "file" or "lines"
 * @param symbol a readable name, for example "FundTransferService.transfer(TransferRequest)"
 */
public record Chunk(String kind, String symbol, int startLine, int endLine, String content) {
}
