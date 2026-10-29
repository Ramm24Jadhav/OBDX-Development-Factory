package com.obdx.factory.knowledge;

import com.obdx.factory.model.ModelGateway;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Base64;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Keeping the knowledge current: a newer file of a document replaces the older revision, the notes citing it move to
 * the newer one, and those whose cited section changed go back to review; watched folders pick up changed files.
 * Runs when FACTORY_TEST_DB_URL is set.
 */
@SpringBootTest
@EnabledIfEnvironmentVariable(named = "FACTORY_TEST_DB_URL", matches = ".+")
class KnowledgeRevisionsIntegrationTest {

    @TempDir
    static Path temp;

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", () -> System.getenv("FACTORY_TEST_DB_URL"));
        registry.add("spring.datasource.username", () -> System.getenv().getOrDefault("FACTORY_TEST_DB_USER", "factory"));
        registry.add("spring.datasource.password", () -> System.getenv().getOrDefault("FACTORY_TEST_DB_PASSWORD", "factory"));
        registry.add("factory.storage.root", () -> temp.resolve("data").toString());
        registry.add("factory.security.secret-key", () -> Base64.getEncoder().encodeToString(new byte[32]));
        registry.add("factory.local-folders.enabled", () -> "true");
    }

    @TestConfiguration
    static class FixedEmbeddings {
        @Bean
        @Primary
        ModelGateway fixedEmbeddingGateway() {
            return new ModelGateway() {
                @Override
                public ChatResult chat(String systemPrompt, String userPrompt) {
                    return new ChatResult("answer", "test-model", 1);
                }

                @Override
                public ChatResult chatJson(String systemPrompt, String userPrompt) {
                    return chat(systemPrompt, userPrompt);
                }

                @Override
                public float[] embed(String text) {
                    return new float[]{text.length() % 7 + 1, text.length() % 5 + 1, 1};
                }

                @Override
                public List<float[]> embedAll(List<String> texts) {
                    return texts.stream().map(this::embed).toList();
                }
            };
        }
    }

    @Autowired
    KnowledgeImporter importer;

    @Autowired
    KnowledgeRepository repository;

    @Autowired
    JdbcTemplate jdbc;

    private static String guide(String run, String limits) {
        return "# Transfer limits\n\n" + limits + " Limits are set per customer segment and channel, and the bank can lower them "
                + "for a user on request. Run " + run + ".\n\n"
                + "# Approvals\n\nA transfer above the limit goes to a checker for approval before it is sent to the host. Run " + run + ".\n";
    }

    private KnowledgeRepository.Document ready(UUID id) throws InterruptedException {
        for (int i = 0; i < 300; i++) {
            var d = repository.findDocument(id).orElseThrow();
            if ("READY".equals(d.status()) || "FAILED".equals(d.status())) {
                return d;
            }
            Thread.sleep(100);
        }
        throw new AssertionError("The document was not imported in time");
    }

    private UUID note(String status, String sources) {
        UUID id = UUID.randomUUID();
        repository.insertNote(new KnowledgeRepository.Note(id, null, "25", "limits", "How limits work", "Body", status, "USER",
                sources, "test", null, null, null, null, null));
        return id;
    }

    @Test
    void aNewerRevisionReplacesTheOlderAndSendsNotesOnChangedSectionsBackToReview() throws Exception {
        String run = UUID.randomUUID().toString();
        String file = "payments-guide-" + run + ".md";
        var first = importer.importFile(file, guide(run, "The daily limit is 5 lakh.").getBytes(StandardCharsets.UTF_8), "25.2", null, null, "test")
                .queued().getFirst();
        assertThat(ready(first.id()).status()).isEqualTo("READY");

        UUID onLimits = note("TRUSTED", "[{\"heading\":\"Transfer limits\",\"documentId\":\"" + first.id() + "\",\"pageFrom\":0}]");
        // A note saved before document ids were kept: only its link names the document
        UUID onApprovals = note("TRUSTED", "[{\"heading\":\"Approvals\",\"url\":\"api/knowledge/documents/" + first.id() + "/file\",\"pageFrom\":0}]");

        var second = importer.importFile(file, guide(run, "The daily limit is 10 lakh.").getBytes(StandardCharsets.UTF_8), "25.2", null,
                "25.2.0.1", "test").queued().getFirst();
        var newer = ready(second.id());
        assertThat(newer.status()).isEqualTo("READY");
        assertThat(newer.patchset()).isEqualTo("25.2.0.1");
        assertThat(newer.message()).contains("1 note(s)");

        var older = repository.findDocument(first.id()).orElseThrow();
        assertThat(older.status()).isEqualTo("SUPERSEDED");
        assertThat(older.supersededBy()).isEqualTo(second.id());
        assertThat(jdbc.queryForObject("SELECT count(*) FROM knowledge_chunk WHERE document_id = ?", Integer.class, first.id())).isZero();

        var changed = repository.findNote(onLimits).orElseThrow();
        assertThat(changed.status()).isEqualTo("SUGGESTED");
        assertThat(changed.needsReview()).contains("Transfer limits");
        assertThat(changed.sources()).contains(second.id().toString()).doesNotContain(first.id().toString());

        var unchanged = repository.findNote(onApprovals).orElseThrow();
        assertThat(unchanged.status()).isEqualTo("TRUSTED");
        assertThat(unchanged.needsReview()).isNull();
        assertThat(unchanged.sources()).contains(second.id().toString());

        // The older file again is not imported a second time
        var again = importer.importFile(file, guide(run, "The daily limit is 5 lakh.").getBytes(StandardCharsets.UTF_8), "25.2", null, null, "test");
        assertThat(again.queued()).isEmpty();
        assertThat(again.skipped().getFirst()).contains("already replaced");

        // Approving the note again clears the flag
        repository.reviewNote(onLimits, "TRUSTED", "reviewer");
        assertThat(repository.findNote(onLimits).orElseThrow().needsReview()).isNull();
    }

    @Test
    void aWatchedFolderPicksUpNewAndChangedDocuments() throws Exception {
        String run = UUID.randomUUID().toString();
        Path folder = Files.createDirectories(temp.resolve("bank-docs-" + run));
        Files.writeString(folder.resolve("customisation.md"), guide(run, "Our limit is 2 lakh."));
        UUID workspace = jdbc.queryForObject("INSERT INTO workspace (id, name, bank_name, obdx_version, svn_url, created_at) "
                + "VALUES (gen_random_uuid(), ?, 'Bank', '25.2', 'file:///repo', now()) RETURNING id", UUID.class, "Docs " + run);

        var first = importer.importFolder(folder, "25.2", workspace, "25.2.0.1", "test").queued().getFirst();
        assertThat(ready(first.id()).status()).isEqualTo("READY");
        var source = repository.sources(List.of(workspace)).stream().filter(s -> workspace.equals(s.workspaceId())).findFirst().orElseThrow();
        assertThat(source.lastResult()).isEqualTo("1 new or changed, 0 unchanged");

        assertThat(importer.rescan(source.id()).queued()).isEmpty();
        assertThat(repository.findSource(source.id()).orElseThrow().lastResult()).isEqualTo("0 new or changed, 1 unchanged");

        Files.writeString(folder.resolve("customisation.md"), guide(run, "Our limit is 3 lakh."));
        Files.writeString(folder.resolve("patch-notes.txt"), "# Patch 25.2.0.1\n\nFixes the limit check on scheduled transfers: a transfer "
                + "scheduled before a limit change is checked against the new limit when it runs. Run " + run + ".");
        var changed = importer.rescan(source.id());
        assertThat(changed.queued()).hasSize(2);
        for (var d : changed.queued()) {
            assertThat(ready(d.id()).status()).isEqualTo("READY");
            assertThat(d.workspaceId()).isEqualTo(workspace);
            assertThat(d.patchset()).isEqualTo("25.2.0.1");
        }
        assertThat(repository.findDocument(first.id()).orElseThrow().status()).isEqualTo("SUPERSEDED");
    }
}
