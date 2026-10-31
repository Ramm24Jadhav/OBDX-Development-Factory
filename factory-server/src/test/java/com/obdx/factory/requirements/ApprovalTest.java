package com.obdx.factory.requirements;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/** A backend-only spec (a REST API without screens) can be approved; messages end with one period. */
class ApprovalTest {

    @Test
    void aBackendOnlySpecCanBeApproved() {
        assertThat(RequirementService.buildable(SpecParser.parse("""
                {"title": "Standing instructions API", "apis": [{"name": "POST /payments/standingInstructions", "method": "POST"}]}
                """, "x"))).isTrue();
        assertThat(RequirementService.buildable(SpecParser.parse("""
                {"title": "API", "requirements": [{"id": "FR-001", "description": "The service shall list instructions"}]}
                """, "x"))).isTrue();
        assertThat(RequirementService.buildable(SpecParser.parse("{\"title\": \"x\", \"screens\": [{\"name\": \"Transfer\"}]}", "x"))).isTrue();
        assertThat(RequirementService.buildable(SpecParser.parse("{\"title\": \"Nothing\"}", "x"))).isFalse();
    }

    @Test
    void aFailureMessageEndsWithOnePeriod() {
        assertThat(RequirementService.sentence("Try again in about 2 minutes.")).isEqualTo("Try again in about 2 minutes.");
        assertThat(RequirementService.sentence("model not loaded")).isEqualTo("model not loaded.");
        assertThat(RequirementService.sentence(null)).isEqualTo("unknown error.");
    }
}
