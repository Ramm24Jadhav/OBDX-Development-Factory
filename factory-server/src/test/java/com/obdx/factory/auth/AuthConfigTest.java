package com.obdx.factory.auth;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.info.BuildProperties;

import java.time.Duration;
import java.util.List;
import java.util.Properties;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/** What the public sign-in configuration tells the sign-in page, in particular the optional environment label. */
class AuthConfigTest {

    private static AuthController controller(String mode, String environmentName) {
        Properties info = new Properties();
        info.setProperty("version", "1.4.2");
        @SuppressWarnings("unchecked")
        ObjectProvider<BuildProperties> build = mock(ObjectProvider.class);
        when(build.getIfAvailable()).thenReturn(new BuildProperties(info));
        AuthProperties properties = new AuthProperties(mode, List.of(), "", 5, Duration.ofMinutes(15), 20, null,
                new AuthProperties.Oidc("sso", "preferred_username", "name"), null);
        return new AuthController(null, null, null, null, null, null, null, properties, build, environmentName);
    }

    @Test
    void showsTheConfiguredEnvironmentName() {
        AuthController.AuthConfig config = controller("local", "  UAT  ").config();
        assertThat(config.environment()).isEqualTo("UAT");
        assertThat(config.mode()).isEqualTo("local");
        assertThat(config.ssoLoginUrl()).isNull();
        assertThat(config.version()).isEqualTo("1.4.2");
    }

    @Test
    void hasNoEnvironmentWhenNoneIsSet() {
        assertThat(controller("local", "").config().environment()).isNull();
        assertThat(controller("local", "   ").config().environment()).isNull();
        assertThat(controller("local", null).config().environment()).isNull();
    }

    @Test
    void keepsTheLabelShortAndOnOneLine() {
        assertThat(controller("local", "Pre\n production").config().environment()).isEqualTo("Pre production");
        assertThat(controller("local", "x".repeat(50)).config().environment()).hasSize(30);
    }

    @Test
    void singleSignOnStillGetsItsLink() {
        AuthController.AuthConfig config = controller("oidc", "Development").config();
        assertThat(config.ssoLoginUrl()).isEqualTo("oauth2/authorization/sso");
        assertThat(config.environment()).isEqualTo("Development");
    }
}
