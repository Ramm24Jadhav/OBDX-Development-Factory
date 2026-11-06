package com.obdx.factory.requirements;

import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.util.stream.Collectors;
import java.util.stream.IntStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertTimeoutPreemptively;

/** A table cell of a thousand IDs and an API of thousands of path segments are read without a stack overflow. */
class LongInputRequirementsTest {

    private static final Duration QUICK = Duration.ofSeconds(2);

    @Test
    void aCellOfAThousandIdsIsAnIdList() {
        String ids = IntStream.rangeClosed(1, 1_000).mapToObj(i -> "AC-" + i).collect(Collectors.joining(", "));

        assertThat(assertTimeoutPreemptively(QUICK, () -> DocumentStructure.isIdList(ids))).isTrue();
        assertThat(DocumentStructure.isIdList("AC-001, AC-002 and TC-01; TC-02/TC-03")).isTrue();
        assertThat(DocumentStructure.isIdList("AC-001 shows the list")).isFalse();
        assertThat(DocumentStructure.isIdList("and")).isFalse();
        assertThat(DocumentStructure.isIdList(" ")).isFalse();
    }

    @Test
    void aPathOfThousandsOfSegmentsIsCut() {
        RequirementSpec.Api api = new RequirementSpec.Api("GET " + "/payments".repeat(5_000), "GET", null);

        // read quickly; only its start counts
        assertTimeoutPreemptively(QUICK, () -> SpecGrounding.pathNamed(api, " get payments "));
    }
}
