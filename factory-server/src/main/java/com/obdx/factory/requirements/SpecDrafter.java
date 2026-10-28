package com.obdx.factory.requirements;

import com.obdx.factory.model.ModelGateway;
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

    private static final String DRAFT_SYSTEM = """
            You are a senior business analyst for Oracle Banking Digital Experience (OBDX) customizations.
            Read a section of a requirement document (BRD, FSD or a short request) and write a structured specification.

            Rules:
            - Use only what the document says. Never invent screens, fields, rules, limits, codes or messages.
            - Keep names and labels as written in the document.
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
        List<String> sections = split(documentText, properties.maxCharsPerCall());
        String system = DRAFT_SYSTEM.formatted(context(systemContext), SPEC_FORMAT);
        List<RequirementSpec> drafts = new ArrayList<>();
        for (int i = 0; i < sections.size(); i++) {
            String user = "Document: " + title + "\nSection " + (i + 1) + " of " + sections.size() + ":\n\n" + sections.get(i);
            drafts.add(ask(system, user, title));
        }
        return SpecMerger.merge(drafts, title);
    }

    /** Applies decisions to the spec. The spec passed in already lists the decisions. */
    public RequirementSpec refine(RequirementSpec spec, String systemContext) {
        String system = REFINE_SYSTEM.formatted(context(systemContext), SPEC_FORMAT);
        StringBuilder user = new StringBuilder("Specification:\n").append(json.writeValueAsString(withoutDecisions(spec)))
                .append("\n\nDecisions:\n");
        for (RequirementSpec.Decision decision : spec.decisions()) {
            user.append("- Q: ").append(decision.question()).append("\n  A: ").append(decision.answer()).append('\n');
        }
        return ask(system, user.toString(), spec.title());
    }

    private RequirementSpec ask(String system, String user, String title) {
        RuntimeException last = null;
        String prompt = user;
        for (int attempt = 1; attempt <= Math.max(1, properties.maxAttempts()); attempt++) {
            ModelGateway.ChatResult result = modelGateway.chatJson(system, prompt);
            try {
                return SpecParser.parse(result.reply(), title);
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
        return new RequirementSpec(spec.title(), spec.summary(), spec.screens(), spec.businessRules(), spec.roles(),
                spec.apis(), spec.hostInteractions(), spec.messages(),
                spec.openQuestions().stream().filter(q -> q.answer() == null).toList(), List.of());
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
