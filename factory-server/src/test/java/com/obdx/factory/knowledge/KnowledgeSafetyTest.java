package com.obdx.factory.knowledge;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;

/** Note sources link only to web pages or the factory's documents; the factory's data folder cannot be imported. */
class KnowledgeSafetyTest {

    @TempDir
    Path temp;

    @Test
    void noteSourcesLinkOnlyToWebPagesOrTheFactorysDocuments() {
        assertThat(KnowledgeService.safeUrl("https://docs.oracle.com/cd/F1/obdx.pdf#page=4")).isEqualTo("https://docs.oracle.com/cd/F1/obdx.pdf#page=4");
        assertThat(KnowledgeService.safeUrl("api/knowledge/documents/5c1d/file#page=2")).isEqualTo("api/knowledge/documents/5c1d/file#page=2");
        assertThat(KnowledgeService.safeUrl("/api/knowledge/documents/5c1d/file")).isNotNull();
        assertThat(KnowledgeService.safeUrl("javascript:alert(document.cookie)")).isNull();
        assertThat(KnowledgeService.safeUrl(" JavaScript:alert(1)")).isNull();
        assertThat(KnowledgeService.safeUrl("data:text/html,<script>alert(1)</script>")).isNull();
        assertThat(KnowledgeService.safeUrl("https://x.example/\"onmouseover=alert(1)")).isNull();
        assertThat(KnowledgeService.safeUrl("/api/knowledge/documents/../../admin/users")).isNull();
        assertThat(KnowledgeService.safeUrl("")).isNull();
    }

    @Test
    void theFactorysDataFolderIsOutOfBounds() throws Exception {
        Path data = Files.createDirectories(temp.resolve("data"));
        Path requirements = Files.createDirectories(data.resolve("requirements/abc"));
        Path documents = Files.createDirectories(temp.resolve("bank-docs"));

        assertThat(KnowledgeImporter.inside(requirements, data)).isTrue();
        assertThat(KnowledgeImporter.inside(data, data)).isTrue();
        assertThat(KnowledgeImporter.inside(documents, data)).isFalse();
        assertThat(KnowledgeImporter.inside(data.resolve("requirements/../../bank-docs"), data)).isFalse();
    }
}
