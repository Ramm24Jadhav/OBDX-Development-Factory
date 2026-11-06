package com.obdx.factory.issue;

import java.util.List;
import java.util.Set;
import java.util.UUID;

/**
 * The model's diagnosis of an issue, checked by {@link IssueAnalyzer}: known categories and states only, evidence ids,
 * files and Oracle notes that were actually given to the model.
 *
 * @param conflicts        where the screenshot and the logs disagree; null when they do not
 * @param similar          similar past issues, found by the factory (not the model)
 * @param oracleReferences Oracle notes and manual sections the diagnosis is based on (only ones the factory gave)
 * @param model            the chat model that wrote it
 */
public record Diagnosis(String category, String state, String summary, String rootCause, List<String> evidence,
                        List<Alternative> alternatives, List<String> missingInformation, List<Step> steps, String conflicts,
                        List<Similar> similar, List<OracleReference> oracleReferences, String model) {

    static final Set<String> CATEGORIES = Set.of("CONFIGURATION", "DEPENDENCY", "INFRASTRUCTURE", "SECURITY", "DATA",
            "INTEGRATION", "PRODUCT_DEFECT", "CUSTOMIZATION", "UNKNOWN");
    static final Set<String> STATES = Set.of("PROBABLE", "POSSIBLE", "INCONCLUSIVE");
    static final Set<String> RISKS = Set.of("LOW", "MEDIUM", "HIGH");
    static final String ADMIN = "ADMIN";
    static final String ENGINEER = "ENGINEER";

    public record Alternative(String cause, String why) {
    }

    /**
     * @param file     a file of the bank's code to look at or change; only files found by the code search
     * @param evidence ids of the evidence the step is based on
     * @param audience ADMIN: a bank administrator can do it (configuration screens, checks); ENGINEER: needs the code,
     *                 servers or logs. Bank administrators see only ADMIN steps.
     */
    public record Step(String action, String why, String file, String risk, List<String> evidence, String audience) {
    }

    /**
     * @param shared   true for shared product knowledge, false for an issue of this workspace
     * @param issueId  the past issue of this workspace; null for shared knowledge
     */
    public record Similar(String title, String category, String rootCause, String resolution, boolean shared, String issueId) {
    }

    /**
     * @param id          the evidence id (O1 for an Oracle note, M1 for a manual section)
     * @param kind        ORACLE_NOTE or MANUAL
     * @param reference   Oracle's reference of a note, as uploaded; null for manuals
     * @param version     the OBDX version and patchset the document is for
     * @param why         why it matches, in the model's words
     * @param versionNote set when the document is for another version or a patchset: what to check
     */
    public record OracleReference(String id, String kind, String title, String reference, String version, UUID documentId,
                                  String why, String versionNote) {
    }
}
