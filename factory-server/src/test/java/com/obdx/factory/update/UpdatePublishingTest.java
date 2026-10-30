package com.obdx.factory.update;

import org.junit.jupiter.api.Test;

import java.io.IOException;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * While CI publishes a build, GitHub has no release files for a minute or two; the check then says so.
 */
class UpdatePublishingTest {

    @Test
    void aMissingReleaseFileMeansABuildIsBeingPublished() {
        assertThat(UpdateService.publishing(new IOException("curl: (22) The requested URL returned error: 404"))).isTrue();
        assertThat(UpdateService.publishing(new IOException("HTTP 404 from https://github.com/x/releases/download/latest/version.json"))).isTrue();
        assertThat(UpdateService.publishing(new IOException("curl: (6) Could not resolve host: github.com"))).isFalse();
    }
}
