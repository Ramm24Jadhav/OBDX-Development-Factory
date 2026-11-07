package com.obdx.factory.change;

import org.junit.jupiter.api.Test;

import java.time.OffsetDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class ChangeVersionsTest {

    private static final OffsetDateTime T = OffsetDateTime.parse("2026-11-06T10:00:00Z");

    @Test
    void groupsTheWritesOfOneGenerationIntoOneVersion() {
        List<ChangeVersions.Version> versions = ChangeVersions.group(List.of(
                new ChangeFileStore.Revision(1, "a.tsx", false, T),
                new ChangeFileStore.Revision(2, "b.tsx", false, T.plusSeconds(40)),
                new ChangeFileStore.Revision(3, "a.tsx", false, T.plusMinutes(30)),
                new ChangeFileStore.Revision(4, "b.tsx", true, T.plusHours(2))));
        assertThat(versions).extracting(ChangeVersions.Version::label).containsExactly("first version", "written again", "edited");
        assertThat(versions.getFirst().files()).isEqualTo(2);
        assertThat(versions.getFirst().upTo()).isEqualTo(2);
        assertThat(versions.get(2).upTo()).isEqualTo(4);
    }

    @Test
    void countsTheLinesAddedAndRemoved() {
        ChangeVersions.FileDifference d = ChangeVersions.difference("a.tsx", "one\ntwo\nthree\n", "one\n2\nthree\nfour\n");
        assertThat(d.linesAdded()).isEqualTo(2);
        assertThat(d.linesRemoved()).isEqualTo(1);
        assertThat(d.added()).isFalse();
        assertThat(d.diff()).contains("+four");
        assertThat(ChangeVersions.difference("new.tsx", null, "x\n").added()).isTrue();
    }
}
