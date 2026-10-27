package com.obdx.factory.model;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Lets an admin check the model connection from the UI before any real work depends on it.
 */
@RestController
@RequestMapping("/api/model")
public class ModelController {

    private static final String SYSTEM_PROMPT =
            "You are the assistant of OBDX Development Factory, a tool for building Oracle Banking Digital Experience "
                    + "customizations. Answer briefly and precisely.";

    private final ModelGateway gateway;
    private final ModelProperties properties;

    public ModelController(ModelGateway gateway, ModelProperties properties) {
        this.gateway = gateway;
        this.properties = properties;
    }

    @GetMapping("/status")
    public StatusResponse status() {
        return new StatusResponse(properties.baseUrl(), properties.chatModel(), properties.embeddingModel());
    }

    @PostMapping("/chat")
    public ModelGateway.ChatResult chat(@Valid @RequestBody ChatRequest request) {
        return gateway.chat(SYSTEM_PROMPT, request.prompt());
    }

    @PostMapping("/embed")
    public EmbedResponse embed(@Valid @RequestBody EmbedRequest request) {
        return new EmbedResponse(properties.embeddingModel(), gateway.embed(request.text()).length);
    }

    public record StatusResponse(String baseUrl, String chatModel, String embeddingModel) {
    }

    public record ChatRequest(@NotBlank @Size(max = 20_000) String prompt) {
    }

    public record EmbedRequest(@NotBlank @Size(max = 20_000) String text) {
    }

    public record EmbedResponse(String model, int dimensions) {
    }
}
