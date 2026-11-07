package com.obdx.factory.model;

import java.time.Duration;

/**
 * The time one job (an analysis, a generation) may spend waiting on a model server's rate limits, all waits together.
 * The change jobs share one thread, so a server that keeps rate-limiting would otherwise hold every other job for hours;
 * past the budget the job stops as at a limit, and its files stay to be continued.
 */
public final class WaitBudget {

    /** How long one job may wait on rate limits in all. */
    public static final Duration PER_JOB = Duration.ofMinutes(10);

    private static final ThreadLocal<long[]> LEFT = new ThreadLocal<>();

    private WaitBudget() {
    }

    /** Starts the budget of the job running on this thread. */
    public static void start(Duration budget) {
        LEFT.set(new long[] {budget.toMillis()});
    }

    /** Ends it (the job is done). */
    public static void end() {
        LEFT.remove();
    }

    /**
     * Takes a wait from the budget of the job on this thread (none outside a job).
     *
     * @throws ModelLimitReachedException when the job has waited its budget already
     */
    public static void spend(Duration wait, String model) {
        long[] left = LEFT.get();
        if (left == null) {
            return;
        }
        left[0] -= wait.toMillis();
        if (left[0] < 0) {
            throw new ModelLimitReachedException("Chat model '" + model + "' kept rate-limiting (this job waited over "
                    + PER_JOB.toMinutes() + " minutes in all). The model's server kept rate-limiting; try again later or use a plan with "
                    + "higher limits.", false, "a few minutes", null);
        }
    }
}
