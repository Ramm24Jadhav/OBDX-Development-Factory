package com.obdx.factory.design;

import com.obdx.factory.common.BadRequestException;
import com.obdx.factory.model.ModelGateway;
import com.obdx.factory.model.ModelGatewayException;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;

import java.util.List;
import java.util.stream.Collectors;

/**
 * Changes a Screen Model from a plain-language instruction, such as "move remarks to the end and make it optional",
 * or from a design made in a design tool (Figma, a PDF or an image).
 */
@Component
public class ScreenModelEditor {

    private static final String SYSTEM = """
            You edit screen designs for Oracle Banking Digital Experience (OBDX). A design is a JSON screen model with
            sections of components and a list of action buttons.
            Apply the user's instruction and answer with the complete updated screen model as one JSON object, nothing else.

            Rules:
            - Change only what the instruction asks for. Keep everything else, including every "id", exactly as it is.
            """;

    private static final String IMPORT_SYSTEM = """
            You turn a screen designed in a design tool (Figma, a PDF or an image of a mock-up) into a screen model for
            Oracle Banking Digital Experience (OBDX). A screen model is JSON with sections of components and a list of
            action buttons. You also get the screen's current model, which may come from the approved requirement.
            Answer with the complete screen model as one JSON object, nothing else.

            Rules:
            - Follow the design: its sections and their titles, the order of fields, labels as written, columns when
              fields sit side by side, and its buttons as actions (the main button is primary).
            - Choose each component's type from what the design shows: text box, multi-line text, number, amount,
              date, dropdown, account selector, radio buttons, checkboxes, switch, read-only value, or a table with its
              column headers as options. Where the design uses one of the bank's components, use type "component".
            - When a design element means the same as a component of the current model, keep that component's "id",
              "name", validations and mandatory flag, and take the label from the design.
            - Keep components of the current model that the design does not show, at the end of the last section:
              they come from the requirement.
            - Leave out decoration: logos, menus, headers, footers, status bars, images and icons.
            """;

    private static final String SHARED_RULES = """
            - New sections, components and actions get no "id"; it is assigned later.
            - Component "type" must be one of: %s.
            - Components of type select, account, radio and checkbox need "options"; a table's "options" are its columns.
            - Type "component" places an existing component of the bank's code: set "component" to its name and
              "params" to an object of parameter values. Use one only from this list: %s.
            - "required" is true, false or null. "maxLength" is a number or null. "columns" is 1, 2 or 3.
            - Action "kind" is primary, secondary or link.
            - "html", "css" and "script" of a component are the designer's own code: keep them exactly as they are
              unless the instruction is about them.
            - "dataSource" says an element's values come from an API: {"api": "GET /path", "path": "list in the
              response", "valueField": "...", "labelField": "..."}; null for fixed options.
            - "visibleWhen" and "requiredWhen" make an element shown or mandatory only while another element meets a
              condition: {"field": "id of that element", "operator": "filled | empty | equals | notEquals", "value": "..."}.
            - The screen's "stage" is initiate, review, confirm or inquiry; "channels" lists desktop, tablet,
              mobile-web and mobile-app (empty: all). Keep them unless the instruction is about them.
            """;

    private static final int MAX_COMPONENTS = 60;

    private final ModelGateway modelGateway;
    private final ObjectMapper json;

    public ScreenModelEditor(ModelGateway modelGateway, ObjectMapper json) {
        this.modelGateway = modelGateway;
        this.json = json;
    }

    public ScreenModel apply(ScreenModel model, String instruction) {
        return apply(model, instruction, List.of());
    }

    public ScreenModel apply(ScreenModel model, String instruction, List<ComponentPalette.Item> components) {
        return apply(model, instruction, components, null);
    }

    /**
     * @param components the components of the bank's code the design may use (from the palette)
     * @param targetId   the selected component, section or action the instruction is about, or null for the screen
     */
    public ScreenModel apply(ScreenModel model, String instruction, List<ComponentPalette.Item> components, String targetId) {
        String scope = targetId == null ? "" : "\n\nThe instruction is about the element with id \"" + targetId
                + "\" only. Change that element (a component, a section or a button) and nothing else; you may add new components"
                + " right after it if the instruction asks for them.";
        String user = "Screen model:\n" + json.writeValueAsString(model) + "\n\nInstruction: " + instruction + scope;
        return ask(SYSTEM + rules(components), user, null);
    }

    /** A screen model that follows an imported design, keeping what matches the current model. */
    public ScreenModel fromDesign(ScreenModel current, DesignImporter.Design design, List<ComponentPalette.Item> components) {
        String user = "Current screen model:\n" + json.writeValueAsString(current) + "\n\nDesign (" + design.source() + "):\n"
                + (design.outline() != null ? design.outline() : "the attached image");
        try {
            return ask(IMPORT_SYSTEM + rules(components), user, design);
        } catch (ModelGatewayException e) {
            if (design.image() == null) {
                throw e;
            }
            throw new BadRequestException("The chat model could not read the image (" + e.getMessage() + "). Choose a model that"
                    + " reads images on the Models page, or import a PDF or a Figma link instead.");
        }
    }

    private static String rules(List<ComponentPalette.Item> components) {
        String types = ComponentCatalog.TYPES.stream()
                .map(t -> t.type() + " (" + t.label() + ")").collect(Collectors.joining(", "));
        String available = components.stream().filter(c -> c.tag() != null).limit(MAX_COMPONENTS)
                .map(c -> c.tag() + (c.params().isEmpty() ? "" : " (params: " + String.join(", ", c.params()) + ")"))
                .collect(Collectors.joining("; "));
        return SHARED_RULES.formatted(types, available.isEmpty() ? "(none found in the code)" : available);
    }

    private ScreenModel ask(String system, String user, DesignImporter.Design design) {
        BadRequestException last = null;
        String prompt = user;
        for (int attempt = 0; attempt < 2; attempt++) {
            String reply = design != null && design.image() != null
                    ? modelGateway.chatJsonWithImage(system, prompt, design.image(), design.imageType()).reply()
                    : modelGateway.chatJson(system, prompt).reply();
            try {
                return ScreenModels.parse(reply);
            } catch (BadRequestException e) {
                last = e;
                prompt = user + "\n\nYour previous answer could not be used (" + e.getMessage() + "). Answer with only the JSON object.";
            }
        }
        throw new BadRequestException("The model did not return a usable screen model: " + last.getMessage());
    }
}
