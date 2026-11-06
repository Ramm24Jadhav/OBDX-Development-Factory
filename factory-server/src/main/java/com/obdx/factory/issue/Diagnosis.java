package com.obdx.factory.issue;

import java.util.List;
import java.util.Set;

/**
 * The model's diagnosis of an issue, checked by {@link IssueAnalyzer}: known categories and states only, evidence ids
 * and files that were actually given to the model.
 *
 * @param conflicts where the screenshot and the logs disagree; null when they do not
 * @param similar   similar past issues, found by the factory (not the model)
 * @param model     the chat model that wrote it
 */
public record Diagnosis(String category, String state, String summary, String rootCause, List<String> evidence,
                        List<Alternative> alternatives, List<String> missingInformation, List<Step> steps, String conflicts,
                        List<Similar> similar, String model) {

    static final Set<String> CATEGORIES = Set.of("CONFIGURATION", "DEPENDENCY", "INFRASTRUCTURE", "SECURITY", "DATA",
            "INTEGRATION", "PRODUCT_DEFECT", "CUSTOMIZATION", "UNKNOWN");
    static final Set<String> STATES = Set.of("PROBABLE", "POSSIBLE", "INCONCLUSIVE");
    static final Set<String> RISKS = Set.of("LOW", "MEDIUM", "HIGH");

    public record Alternative(String cause, String why) {
    }

    /**
     * @param file     a file of the bank's code to look at or change; only files found by the code search
     * @param evidence ids of the evidence the step is based on
     */
    public record Step(String action, String why, String file, String risk, List<String> evidence) {
    }

    /**
     * @param shared   true for shared product knowledge, false for an issue of this workspace
     * @param issueId  the past issue of this workspace; null for shared knowledge
     */
    public record Similar(String title, String category, String rootCause, String resolution, boolean shared, String issueId) {
    }
}
