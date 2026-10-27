package com.bank.obdx.accounts;

/** Reads balances of current and savings accounts for the dashboard. */
public class AccountSummaryService {

    public AccountSummary fetchSummary(String customerId) {
        return HostAccountAdapter.readBalances(customerId);
    }
}
