package com.obdx.factory.requirements;

import com.obdx.factory.model.ModelGateway;
import com.obdx.factory.model.PromptTooLargeException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;

import java.util.ArrayList;
import java.util.List;

/**
 * Asks the model to draft a specification from a requirement document, and to update a specification with the
 * analyst's answers to open questions.
 */
@Component
public class SpecDrafter {

    private static final Logger log = LoggerFactory.getLogger(SpecDrafter.class);

    static final String SPEC_FORMAT = """
            {
              "title": "short name of the requirement",
              "summary": "two or three sentences: what is being built and why",
              "scope": ["what is in scope, as the document lists it"],
              "outOfScope": ["what the document excludes"],
              "assumptions": ["what the document assumes rather than requires"],
              "requirements": [{"id": "FR-001 as in the document", "title": "short name", "description": "what the system shall do",
                "priority": "Must | Should | Could | null", "screens": ["screen name"]}],
              "acceptanceCriteria": [{"id": "AC-001", "description": "Given ... when ... then ...", "requirements": ["FR-001"]}],
              "nonFunctional": [{"id": "NFR-001", "category": "Performance", "description": "requirement"}],
              "screens": [{
                "name": "screen name as in the document",
                "changeType": "new | enhance | unknown",
                "description": "what the screen does",
                "reference": "section number or heading",
                "fields": [{
                  "name": "fieldName", "label": "label shown to the user",
                  "type": "text | number | amount | date | dropdown | radio | checkbox | textarea | account | other",
                  "mandatory": true, "validations": ["max length 35"], "defaultValue": null,
                  "source": "where values come from, for example a host call or a list", "notes": null
                }],
                "actions": [{"name": "Submit", "description": "what happens"}]
              }],
              "businessRules": [{"id": "BR-1", "description": "rule", "screens": ["screen name"], "reference": "section"}],
              "roles": [{"name": "user type or role", "access": "what they can do"}],
              "apis": [{"name": "service or endpoint", "method": "GET | POST | PUT | DELETE", "description": "purpose"}],
              "hostInteractions": [{"system": "host system", "description": "what is sent or read"}],
              "messages": [{"code": "error code if given", "text": "message text", "type": "error | warning | info | confirmation"}],
              "openQuestions": [{"question": "one specific question in plain words", "reason": "why it matters for building",
                "reference": "section", "options": ["short answer", "another answer"], "suggestedAnswer": "the usual choice"}]
            }""";

    /** The format without the document's own lists, for updating a spec with answers (see refine). */
    static final String CORE_FORMAT = SPEC_FORMAT.replaceAll("(?s)\\n\\s*\"scope\":.*?\"nonFunctional\":[^\\n]*", "");

    private static final String DRAFT_SYSTEM = """
            You are a senior business analyst for Oracle Banking Digital Experience (OBDX) customizations.
            Read a section of a requirement document (BRD, FSD or a short request) and write a structured specification.

            Rules:
            - Use only what the document says. Never invent screens, fields, rules, limits, codes or messages.
            - Keep names and labels as written in the document, and its own IDs exactly (FR-001, BR-001, AC-001, NFR-001);
              number only items that have none.
            - screens: one per screen or step the user sees, named for what it does ("Beneficiary List", "Add
              Beneficiary", "Transfer Review"), including the review and acknowledgement steps the document describes.
              Link each functional requirement to the screens it needs.
            - fields: only those the document names. When it leaves fields to be defined ("bank-defined fields"), list
              the ones it names and ask an open question for the rest.
            - The document's own open questions (an "Open questions" section) are open questions of the spec too.
            - roles: the people who use the screens (a retail customer, a bank administrator), not the document's
              stakeholders, owners or approvers. apis and hostInteractions: only those the document names; when it
              names none, leave them empty and ask which services to use.
            - changeType is "enhance" when the document changes an existing screen, "new" for a new screen, otherwise "unknown".
            - mandatory is true or false only when the document says so; otherwise null.
            - Add an open question for everything a developer would need but the document leaves missing or unclear:
              field types and lengths, validations, mandatory fields, error messages, limits, user roles and access,
              host system behaviour, what happens on failure. Be specific; one question per gap.
            - Write each question so a business user can answer it with a click: ask about one thing, in plain words,
              naming the screen or field it is about. Not "What fields are needed?" but "Which order types can a
              customer place?". Give 2 to 4 short options (a few words each) that are usual for a bank, and set
              suggestedAnswer to the option most banks choose (null if there is no usual choice).
            - Ask the most important questions first; at most 10.
            - Leave lists empty when the section has nothing for them.
            %s
            Answer with one JSON object in exactly this format, and nothing else:
            %s
            """;

    private static final String REFINE_SYSTEM = """
            You are a senior business analyst for Oracle Banking Digital Experience (OBDX) customizations.
            You get a specification as JSON and the analyst's decisions (answers to earlier open questions).
            Update the specification so it reflects every decision: change fields, types, validations, mandatory flags,
            rules, roles, messages and host interactions as the answers say. Do not change anything the decisions do not
            touch. Keep open questions that are still unanswered, and add new ones only if a decision raises one; a new
            question asks about one thing in plain words, with 2 to 4 short options and the usual one as suggestedAnswer.
            %s
            Answer with the complete updated specification as one JSON object in exactly this format, and nothing else:
            %s
            """;

    private final ModelGateway modelGateway;
    private final RequirementsProperties properties;
    private final ObjectMapper json;

    public SpecDrafter(ModelGateway modelGateway, RequirementsProperties properties, ObjectMapper json) {
        this.modelGateway = modelGateway;
        this.properties = properties;
        this.json = json;
    }

    /** Drafts a spec section by section and merges the results. */
    public RequirementSpec draft(String title, String documentText, String systemContext) {
        return draft(title, documentText, systemContext, progress -> { });
    }

    /** The same, telling {@code progress} which section is being read ("Reading section 2 of 5 ..."). */
    public RequirementSpec draft(String title, String documentText, String systemContext, java.util.function.Consumer<String> progress) {
        String system = DRAFT_SYSTEM.formatted(context(systemContext), SPEC_FORMAT);
        int maxChars = properties.maxCharsPerCall();
        for (int round = 0; ; round++) {
            maxChars = Math.min(maxChars, fitting(system));
            try {
                return draft(title, split(documentText, maxChars), system, progress);
            } catch (PromptTooLargeException e) {
                // The server takes less than one section: start again with sections that fit its limit
                if (round >= 2 || fitting(system) < 2000) {
                    throw e;
                }
                log.info("The model's server takes at most {} tokens at once; drafting again in smaller sections", e.limit());
            }
        }
    }

    /** The longest section that fits the server's input limit, once known (see ModelGateway.inputLimit). */
    private int fitting(String system) {
        int limit = modelGateway.inputLimit();
        return limit <= 0 ? Integer.MAX_VALUE : (int) (limit * 0.85 * modelGateway.charsPerToken()) - system.length() - 300;
    }

    private RequirementSpec draft(String title, List<String> sections, String system, java.util.function.Consumer<String> progress) {
        List<RequirementSpec> drafts = new ArrayList<>();
        for (int i = 0; i < sections.size(); i++) {
            if (sections.size() > 1) {
                progress.accept("Drafting the spec: reading section " + (i + 1) + " of " + sections.size() + " of the document...");
            }
            String user = "Document: " + title + "\nSection " + (i + 1) + " of " + sections.size() + ":\n\n" + sections.get(i);
            drafts.add(ask(system, user, title));
        }
        return SpecMerger.merge(drafts, title);
    }

    /** Applies decisions to the spec. The spec passed in already lists the decisions. */
    public RequirementSpec refine(RequirementSpec spec, String systemContext) {
        String system = REFINE_SYSTEM.formatted(context(systemContext), CORE_FORMAT);
        // The document's own lists (scope, requirements, criteria, non-functional) are not sent and come back as they
        // were: answers change screens, fields and rules, and writing those lists out again only made the call slow
        RequirementSpec working = withoutDecisions(spec);
        RequirementSpec sent = new RequirementSpec(working.title(), working.summary(), working.screens(), working.businessRules(),
                working.roles(), working.apis(), working.hostInteractions(), working.messages(), working.openQuestions(), List.of());
        StringBuilder user = new StringBuilder("Specification:\n").append(json.writeValueAsString(sent))
                .append("\n\nDecisions:\n");
        for (RequirementSpec.Decision decision : spec.decisions()) {
            user.append("- Q: ").append(decision.question()).append("\n  A: ").append(decision.answer()).append('\n');
        }
        RequirementSpec refined = ask(system, user.toString(), spec.title());
        return new RequirementSpec(refined.title(), refined.summary(), refined.screens(), refined.businessRules(), refined.roles(), refined.apis(),
                refined.hostInteractions(), refined.messages(), refined.openQuestions(), refined.decisions(), spec.scope(), spec.outOfScope(),
                spec.assumptions(), spec.requirements(), spec.acceptanceCriteria(), spec.nonFunctional());
    }

    private RequirementSpec ask(String system, String user, String title) {
        RuntimeException last = null;
        String prompt = user;
        for (int attempt = 1; attempt <= Math.max(1, properties.maxAttempts()); attempt++) {
            ModelGateway.ChatResult result = modelGateway.chatJson(system, prompt);
            try {
                RequirementSpec spec = SpecParser.parse(result.reply(), title);
                if (result.cutOff() && attempt < Math.max(1, properties.maxAttempts())) {
                    // Stopped at the output limit: the last parts of the spec are missing. Ask for a shorter one.
                    log.warn("The spec was cut off at the model's output limit (attempt {}); asking for a shorter one", attempt);
                    prompt = user + "\n\nYour previous answer was cut off at your output limit. Answer again with the complete JSON "
                            + "object, shorter: descriptions in one short sentence, no notes or defaults that are null.";
                    continue;
                }
                return spec;
            } catch (SpecParser.InvalidSpecException e) {
                log.warn("Model answer was not a usable spec (attempt {}): {}", attempt, e.getMessage());
                last = e;
                prompt = user + "\n\nYour previous answer could not be used (" + e.getMessage()
                        + "). Answer again with only the JSON object.";
            }
        }
        throw new IllegalStateException("The model did not return a usable specification: " + last.getMessage(), last);
    }

    private static String context(String systemContext) {
        return systemContext == null || systemContext.isBlank() ? ""
                : "\nThe bank's system, for context when writing questions (do not copy it into the spec):\n" + systemContext + "\n";
    }

    private static RequirementSpec withoutDecisions(RequirementSpec spec) {
        return spec.withQuestions(spec.openQuestions().stream().filter(q -> q.answer() == null).toList(), List.of());
    }

    /** Splits at paragraph boundaries into pieces of at most maxChars; a single longer paragraph is cut. */
    static List<String> split(String text, int maxChars) {
        List<String> sections = new ArrayList<>();
        StringBuilder current = new StringBuilder();
        for (String paragraph : text.split("\n\n")) {
            if (current.length() > 0 && current.length() + paragraph.length() + 2 > maxChars) {
                sections.add(current.toString());
                current.setLength(0);
            }
            while (paragraph.length() > maxChars) {
                sections.add(paragraph.substring(0, maxChars));
                paragraph = paragraph.substring(maxChars);
            }
            if (current.length() > 0) {
                current.append("\n\n");
            }
            current.append(paragraph);
        }
        if (current.length() > 0) {
            sections.add(current.toString());
        }
        return sections;
    }
}
