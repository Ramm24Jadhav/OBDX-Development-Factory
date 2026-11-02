package com.obdx.factory.model;

import dev.langchain4j.exception.HttpException;
import dev.langchain4j.exception.InternalServerException;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Regression audit A7 and C7: a model call that fails says why in plain words with what to do (no raw JSON, no
 * exception class names), and the audit of a settings change says whether the API key changed.
 */
class ModelFailureMessagesTest {

    @Test
    void aRefusedConnectionSaysToStartTheServer() {
        RuntimeException e = new IllegalStateException(new java.net.ConnectException());
        assertThat(OpenAiCompatibleModelGateway.failureReason(e)).startsWith("the model server is not reachable")
                .contains("Models page").doesNotContain("java.net");
    }

    @Test
    void aServerErrorGivesTheServersSentenceNotItsJson() {
        String body = "{\"error\":{\"message\":\"Stub upstream failure 503\",\"type\":\"server_error\"}}";
        RuntimeException e = new InternalServerException(body, new HttpException(503, body));
        String reason = OpenAiCompatibleModelGateway.failureReason(e);
        assertThat(reason).isEqualTo("the model server answered with an error (HTTP 503): Stub upstream failure 503. Try again in a few "
                + "minutes; if it keeps failing, check the model server.");
        assertThat(reason).doesNotContain("{").doesNotContain("server_error");
    }

    @Test
    void otherErrorsKeepTheirMessageWithSecretsHidden() {
        assertThat(OpenAiCompatibleModelGateway.failureReason(new HttpException(400, "model 'x' not found")))
                .isEqualTo("model 'x' not found");
        assertThat(OpenAiCompatibleModelGateway.failureReason(new IllegalStateException("401: Bearer abc.def refused")))
                .isEqualTo("401: Bearer [hidden] refused");
        assertThat(OpenAiCompatibleModelGateway.failureReason(new IllegalStateException("{\"error\":{\"message\":\"Invalid model. Use another\"}}")))
                .isEqualTo("Invalid model");
    }

    @Test
    void theAuditSaysWhetherTheKeyChangedNeverTheKey() {
        assertThat(ModelController.keyChange("API key", null, "AzureKey7c1e")).isEqualTo("; API key set");
        assertThat(ModelController.keyChange("API key", "old-key-1", "new-key-2")).isEqualTo("; API key changed");
        assertThat(ModelController.keyChange("API key", "old-key-1", null)).isEqualTo("; API key removed");
        assertThat(ModelController.keyChange("API key", "same-key", "same-key")).isEmpty();
        assertThat(ModelController.keyChange("API key", null, "not-needed")).isEmpty();
        assertThat(ModelController.keyChange("API key", "old-key-1", "new-key-2")).doesNotContain("old-key").doesNotContain("new-key");
    }
}
