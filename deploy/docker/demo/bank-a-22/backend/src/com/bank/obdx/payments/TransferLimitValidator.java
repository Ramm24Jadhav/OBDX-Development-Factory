package com.bank.obdx.payments;

import java.math.BigDecimal;

/** Checks the customer's daily and per-transaction transfer limits. */
public class TransferLimitValidator {

    private static final BigDecimal DAILY_LIMIT = new BigDecimal("500000");

    public void validateDailyLimit(String customerId, BigDecimal amount) {
        BigDecimal usedToday = LimitRepository.usedToday(customerId);
        if (usedToday.add(amount).compareTo(DAILY_LIMIT) > 0) {
            throw new LimitExceededException("DIGX_PY_0101", "Daily transfer limit exceeded");
        }
    }
}
