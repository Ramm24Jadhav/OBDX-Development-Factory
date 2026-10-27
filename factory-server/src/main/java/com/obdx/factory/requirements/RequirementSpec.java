package com.obdx.factory.requirements;

import java.util.List;

/**
 * The structured specification drafted from a requirement document. Everything a developer needs to build the
 * feature, plus open questions where the document is incomplete. Optional values are null when the document does
 * not say.
 */
public record RequirementSpec(
        String title,
        String summary,
        List<Screen> screens,
        List<BusinessRule> businessRules,
        List<Role> roles,
        List<Api> apis,
        List<HostInteraction> hostInteractions,
        List<Message> messages,
        List<OpenQuestion> openQuestions,
        List<Decision> decisions) {

    /** changeType: "new", "enhance" or "unknown". relatedCode: likely existing files, found by code search. */
    public record Screen(String name, String changeType, String description, String reference, List<Field> fields,
                         List<Action> actions, List<String> relatedCode) {
    }

    /** mandatory: true, false, or null when the document does not say. */
    public record Field(String name, String label, String type, Boolean mandatory, List<String> validations,
                        String defaultValue, String source, String notes) {
    }

    public record Action(String name, String description) {
    }

    public record BusinessRule(String id, String description, List<String> screens, String reference) {
    }

    public record Role(String name, String access) {
    }

    public record Api(String name, String method, String description) {
    }

    public record HostInteraction(String system, String description) {
    }

    /** type: "error", "warning", "info" or "confirmation". */
    public record Message(String code, String text, String type) {
    }

    /** answer is filled in by an analyst; answered questions become decisions when the spec is updated. */
    public record OpenQuestion(String question, String reason, String reference, String answer) {
    }

    public record Decision(String question, String answer) {
    }

    public static RequirementSpec empty(String title) {
        return new RequirementSpec(title, null, List.of(), List.of(), List.of(), List.of(), List.of(), List.of(),
                List.of(), List.of());
    }
}
