package com.obdx.factory.model;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** A model server counts as connected only after a test of it succeeded; a failed test keeps the last success and says why. */
class ProviderChecksTest {

    @Test
    void aFailedTestKeepsTheLastSuccessAndItsError() {
        ProviderChecks checks = new ProviderChecks();
        checks.succeeded("http://localhost:11434/v1/", 40, 3);
        checks.failed("http://localhost:11434/v1", 2000, "Connection refused");

        ProviderChecks.Check c = checks.all().get(0);
        assertThat(c.baseUrl()).isEqualTo("http://localhost:11434/v1");
        assertThat(c.ok()).isFalse();
        assertThat(c.lastOk()).isNotNull();
        assertThat(c.lastError()).isEqualTo("Connection refused");
        assertThat(c.models()).isEqualTo(3);
    }

    @Test
    void listingAServersModelsRecordsTheTest() {
        ProviderChecks checks = new ProviderChecks();
        ModelServers servers = new ModelServers(null) {
            @Override
            public List<Model> models(String baseUrl, String apiKey) {
                if (baseUrl.contains("down")) {
                    throw new ModelGatewayException("The server did not answer", null);
                }
                return List.of(new Model("llama3", false), new Model("nomic-embed-text", true));
            }
        };
        com.obdx.factory.auth.AccessGuard guard = org.mockito.Mockito.mock(com.obdx.factory.auth.AccessGuard.class);
        ModelSettings settings = org.mockito.Mockito.mock(ModelSettings.class);
        ModelController controller = new ModelController(null, settings, servers, guard, null, checks, null);

        assertThat(controller.models(new ModelController.ServerRequest("http://up:11434/v1", "key"))).hasSize(2);
        assertThatThrownBy(() -> controller.models(new ModelController.ServerRequest("http://down:11434/v1", "key")))
                .isInstanceOf(ModelGatewayException.class);

        assertThat(checks.all()).extracting(ProviderChecks.Check::baseUrl, ProviderChecks.Check::ok, ProviderChecks.Check::models)
                .containsExactly(org.assertj.core.groups.Tuple.tuple("http://down:11434/v1", false, 0),
                        org.assertj.core.groups.Tuple.tuple("http://up:11434/v1", true, 2));
    }
}
