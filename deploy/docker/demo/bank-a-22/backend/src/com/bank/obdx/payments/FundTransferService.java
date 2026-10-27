package com.bank.obdx.payments;

import java.math.BigDecimal;

/**
 * Own-account and third-party fund transfers for retail customers.
 */
public class FundTransferService {

    private final TransferLimitValidator limitValidator;
    private final HostTransferAdapter hostAdapter;

    public FundTransferService(TransferLimitValidator limitValidator, HostTransferAdapter hostAdapter) {
        this.limitValidator = limitValidator;
        this.hostAdapter = hostAdapter;
    }

    /** Validates limits and books the transfer in the core banking host. */
    public TransferResponse initiateTransfer(TransferRequest request) {
        limitValidator.validateDailyLimit(request.getCustomerId(), request.getAmount());
        return hostAdapter.bookTransfer(request);
    }
}
