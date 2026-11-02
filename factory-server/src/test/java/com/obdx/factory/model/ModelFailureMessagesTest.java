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

    @org.junit.jupiter.api.BeforeEach
    @org.junit.jupiter.api.AfterEach
    void forget() {
        com.obdx.factory.common.KnownSecrets.clear();
    }

    /** Review of 57735c6: a request that is not allowed registers nothing (a word like "Unsupported" would then be hidden). */
    @Test
    void anUnauthorisedRequestRegistersNothing() {
        com.obdx.factory.auth.AccessGuard guard = org.mockito.Mockito.mock(com.obdx.factory.auth.AccessGuard.class);
        org.mockito.Mockito.when(guard.requireAdmin()).thenThrow(new org.springframework.security.access.AccessDeniedException("Only administrators"));
        ModelController controller = new ModelController(null, org.mockito.Mockito.mock(ModelSettings.class), null, guard, null, null, null);

        org.assertj.core.api.Assertions.assertThatThrownBy(() -> controller.models(new ModelController.ServerRequest("http://x/v1", "Unsupported-components")))
                .isInstanceOf(org.springframework.security.access.AccessDeniedException.class);
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> controller.save(new ModelSettings.Update("http://x/v1", "Failing-checks", "m", "e")))
                .isInstanceOf(org.springframework.security.access.AccessDeniedException.class);
        new com.obdx.factory.svn.SvnCredentials("u", "Incomplete-change");

        assertThat(com.obdx.factory.common.KnownSecrets.masked("Unsupported-components; Failing-checks; Incomplete-change"))
                .isEqualTo("Unsupported-components; Failing-checks; Incomplete-change");
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
