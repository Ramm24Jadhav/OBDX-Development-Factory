package com.obdx.factory.design;

import com.obdx.factory.common.BadRequestException;
import com.obdx.factory.model.ModelGateway;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;

import java.util.stream.Collectors;

/**
 * Changes a Screen Model from a plain-language instruction, such as "move remarks to the end and make it optional".
 */
@Component
public class ScreenModelEditor {

    private static final String SYSTEM = """
            You edit screen designs for Oracle Banking Digital Experience (OBDX). A design is a JSON screen model with
            sections of components and a list of action buttons.
            Apply the user's instruction and answer with the complete updated screen model as one JSON object, nothing else.

            Rules:
            - Change only what the instruction asks for. Keep everything else, including every "id", exactly as it is.
            - New sections, components and actions get no "id"; it is assigned later.
            - Component "type" must be one of: %s.
            - Components of type select, account, radio and checkbox need "options".
            - "required" is true, false or null. "maxLength" is a number or null. "columns" is 1, 2 or 3.
            - Action "kind" is primary, secondary or link.
            """;

    private final ModelGateway modelGateway;
    private final ObjectMapper json;

    public ScreenModelEditor(ModelGateway modelGateway, ObjectMapper json) {
        this.modelGateway = modelGateway;
        this.json = json;
    }

    public ScreenModel apply(ScreenModel model, String instruction) {
        String types = ComponentCatalog.TYPES.stream()
                .map(t -> t.type() + " (" + t.label() + ")").collect(Collectors.joining(", "));
        String system = SYSTEM.formatted(types);
        String user = "Screen model:\n" + json.writeValueAsString(model) + "\n\nInstruction: " + instruction;
        BadRequestException last = null;
        for (int attempt = 0; attempt < 2; attempt++) {
            String reply = modelGateway.chatJson(system, user).reply();
            try {
                return ScreenModels.parse(reply);
            } catch (BadRequestException e) {
                last = e;
                user = user + "\n\nYour previous answer could not be used (" + e.getMessage() + "). Answer with only the JSON object.";
            }
        }
        throw new BadRequestException("The model did not return a usable screen model: " + last.getMessage());
    }
}
