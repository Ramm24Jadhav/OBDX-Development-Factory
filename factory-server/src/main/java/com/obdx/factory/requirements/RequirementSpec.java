package com.obdx.factory.requirements;

import java.util.List;

/**
 * The structured specification drafted from a requirement document. Everything a developer needs to build the
 * feature, plus open questions where the document is incomplete. Optional values are null when the document does
 * not say. The document's own structure is kept for traceability: its scope, assumptions, functional requirements,
 * acceptance criteria and non-functional requirements, each with the document's own ID (FR-001, AC-001, NFR-001).
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
        List<Decision> decisions,
        List<String> scope,
        List<String> outOfScope,
        List<String> assumptions,
        List<FunctionalRequirement> requirements,
        List<AcceptanceCriterion> acceptanceCriteria,
        List<NonFunctional> nonFunctional) {

    public RequirementSpec {
        // Specs stored before these lists existed read as empty ones
        scope = scope == null ? List.of() : scope;
        outOfScope = outOfScope == null ? List.of() : outOfScope;
        assumptions = assumptions == null ? List.of() : assumptions;
        requirements = requirements == null ? List.of() : requirements;
        acceptanceCriteria = acceptanceCriteria == null ? List.of() : acceptanceCriteria;
        nonFunctional = nonFunctional == null ? List.of() : nonFunctional;
    }

    /** A spec without the document's scope, requirements and criteria (a short request in text). */
    public RequirementSpec(String title, String summary, List<Screen> screens, List<BusinessRule> businessRules, List<Role> roles,
                           List<Api> apis, List<HostInteraction> hostInteractions, List<Message> messages,
                           List<OpenQuestion> openQuestions, List<Decision> decisions) {
        this(title, summary, screens, businessRules, roles, apis, hostInteractions, messages, openQuestions, decisions,
                List.of(), List.of(), List.of(), List.of(), List.of(), List.of());
    }

    public RequirementSpec withScreens(List<Screen> screens) {
        return new RequirementSpec(title, summary, screens, businessRules, roles, apis, hostInteractions, messages, openQuestions,
                decisions, scope, outOfScope, assumptions, requirements, acceptanceCriteria, nonFunctional);
    }

    public RequirementSpec withQuestions(List<OpenQuestion> openQuestions, List<Decision> decisions) {
        return new RequirementSpec(title, summary, screens, businessRules, roles, apis, hostInteractions, messages, openQuestions,
                decisions, scope, outOfScope, assumptions, requirements, acceptanceCriteria, nonFunctional);
    }

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

    /**
     * options: short answers the analyst can pick from; suggestedAnswer: the usual choice, or null. answer is filled in
     * by an analyst; answered questions become decisions when the spec is updated.
     */
    public record OpenQuestion(String question, String reason, String reference, List<String> options,
                               String suggestedAnswer, String answer) {
        public OpenQuestion {
            options = options == null ? List.of() : options;
        }

        public OpenQuestion withAnswer(String answer) {
            return new OpenQuestion(question, reason, reference, options, suggestedAnswer, answer);
        }
    }

    public record Decision(String question, String answer) {
    }

    /** A functional requirement of the document: its ID (FR-001), what it requires, its priority, the screens it needs. */
    public record FunctionalRequirement(String id, String title, String description, String priority, List<String> screens) {
        public FunctionalRequirement {
            screens = screens == null ? List.of() : screens;
        }
    }

    /** An acceptance criterion (AC-001, often Given/When/Then) and the requirements it verifies. */
    public record AcceptanceCriterion(String id, String description, List<String> requirements) {
        public AcceptanceCriterion {
            requirements = requirements == null ? List.of() : requirements;
        }
    }

    /** A non-functional requirement: performance, security, availability, accessibility ... */
    public record NonFunctional(String id, String category, String description) {
    }

    public static RequirementSpec empty(String title) {
        return new RequirementSpec(title, null, List.of(), List.of(), List.of(), List.of(), List.of(), List.of(),
                List.of(), List.of());
    }
}
