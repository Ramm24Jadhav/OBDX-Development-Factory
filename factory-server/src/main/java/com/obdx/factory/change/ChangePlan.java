package com.obdx.factory.change;

import java.util.List;

/**
 * The files a change will create or modify, decided by impact analysis and approved by a lead before any code is
 * generated.
 *
 * @param incomplete set only by the impact analysis when files may be missing from the plan (the model's limit stopped
 *                   it, its answer stayed cut off, or it planned more files than one change may have); null when the
 *                   plan is whole. Never read from a plan sent in (an edit, a model's answer): see PlanParser.
 */
public record ChangePlan(String summary, List<Item> items, List<String> risks, Incomplete incomplete) {

    public ChangePlan(String summary, List<Item> items, List<String> risks) {
        this(summary, items, risks, null);
    }

    /** The same plan with other risks, keeping whether it is incomplete. */
    public ChangePlan withRisks(List<String> risks) {
        return new ChangePlan(summary, items, risks, incomplete);
    }

    /**
     * @param action  "create" or "modify"
     * @param layer   "data", "integration", "service", "ui", "test" or "config"
     * @param basedOn existing files whose patterns the new code should follow
     */
    public record Item(String path, String action, String layer, String purpose, List<String> basedOn, String details) {
    }

    /**
     * Why files may be missing from a plan, recorded by the server.
     *
     * @param kind     LIMIT (the model's daily or per-minute limit stopped it: Analyze again continues it), CUT_OFF
     *                 (still cut off at the output limit after its continuations) or TOO_MANY (the last files were left out)
     * @param risk     the risk the plan shows for it
     * @param revision the code revision the plan was made at (a continuation needs the same)
     * @param context  a fingerprint of the spec and designs it was made from (a continuation needs the same)
     */
    public record Incomplete(String kind, String risk, Long revision, String context) {

        public static final String LIMIT = "LIMIT";
        public static final String CUT_OFF = "CUT_OFF";
        public static final String TOO_MANY = "TOO_MANY";

        Incomplete at(Long revision, String context) {
            return new Incomplete(kind, risk, revision, context);
        }
    }
}
