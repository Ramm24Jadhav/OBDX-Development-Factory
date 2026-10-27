package com.obdx.factory.importing;

import com.obdx.factory.model.ModelGateway;
import com.obdx.factory.profile.ProjectProfileService;
import com.obdx.factory.search.CodeSearchService;
import com.obdx.factory.svn.TestSvnRepository;
import com.obdx.factory.workspace.SvnSettingsRequest;
import com.obdx.factory.workspace.WorkspaceRequest;
import com.obdx.factory.workspace.WorkspaceResponse;
import com.obdx.factory.workspace.WorkspaceService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

/**
 * Full flow against a real PostgreSQL (with pgvector) and a local SVN repository: import, index, search,
 * then change the code in SVN and check that the next import re-indexes only what changed.
 * Runs when FACTORY_TEST_DB_URL is set, for example jdbc:postgresql://localhost:5432/factory_test.
 */
@SpringBootTest
@EnabledIfEnvironmentVariable(named = "FACTORY_TEST_DB_URL", matches = ".+")
class ImportAndSearchIntegrationTest {

    @TempDir
    static Path temp;

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", () -> System.getenv("FACTORY_TEST_DB_URL"));
        registry.add("spring.datasource.username", () -> System.getenv().getOrDefault("FACTORY_TEST_DB_USER", "factory"));
        registry.add("spring.datasource.password", () -> System.getenv().getOrDefault("FACTORY_TEST_DB_PASSWORD", "factory"));
        registry.add("factory.storage.root", () -> temp.resolve("data").toString());
        registry.add("factory.security.secret-key", () -> Base64.getEncoder().encodeToString(new byte[32]));
    }

    /** Embeds text as a hashed bag of words, so texts sharing words are close together. Stands in for a real model. */
    @TestConfiguration
    static class FakeModels {
        @Bean
        @Primary
        ModelGateway fakeModelGateway() {
            return new ModelGateway() {
                @Override
                public ChatResult chat(String systemPrompt, String userPrompt) {
                    return new ChatResult("", "fake", 0);
                }

                @Override
                public ChatResult chatJson(String systemPrompt, String userPrompt) {
                    return new ChatResult("{}", "fake", 0);
                }

                @Override
                public float[] embed(String text) {
                    float[] vector = new float[64];
                    for (String word : text.toLowerCase(Locale.ROOT).split("[^a-z]+")) {
                        if (word.length() > 2) {
                            vector[Math.floorMod(word.hashCode(), 64)] += 1;
                        }
                    }
                    vector[0] += 0.01f;
                    return vector;
                }

                @Override
                public List<float[]> embedAll(List<String> texts) {
                    return texts.stream().map(this::embed).toList();
                }
            };
        }
    }

    @Autowired
    private WorkspaceService workspaces;

    @Autowired
    private ImportService imports;

    @Autowired
    private CodeSearchService search;

    @Autowired
    private ProjectProfileService profiles;

    private UUID workspaceId;

    @BeforeAll
    static void requireSvn() {
        assumeTrue(TestSvnRepository.toolsAvailable(), "svn and svnadmin are not installed");
    }

    @AfterEach
    void deleteWorkspace() {
        if (workspaceId != null) {
            workspaces.delete(workspaceId);
        }
    }

    @Test
    void importsIndexesSearchesAndUpdatesIncrementally() throws Exception {
        TestSvnRepository repo = TestSvnRepository.create(temp.resolve("svn"), Map.of(
                "backend/src/com/bank/payments/FundTransferService.java", """
                        package com.bank.payments;

                        /** Own-account and third-party fund transfers. */
                        public class FundTransferService {
                            public TransferResult transfer(TransferRequest request) {
                                checkDailyLimit(request);
                                return TransferResult.ok();
                            }

                            private void checkDailyLimit(TransferRequest request) {
                            }
                        }
                        """,
                "ui/js/viewModels/account-summary.js", """
                        define(['knockout'], function (ko) {
                          function AccountSummaryViewModel() {
                            this.balance = ko.observable();
                          }
                          return AccountSummaryViewModel;
                        });
                        """,
                "ui/node_modules/lib/ignored.js", "function ignored() {}",
                "ui/css/logo.png", "not really a png"));

        WorkspaceResponse workspace = workspaces.create(new WorkspaceRequest("it-" + UUID.randomUUID(), "Test Bank", "22.x", null));
        workspaceId = workspace.id();
        workspaces.updateSvnSettings(workspaceId, new SvnSettingsRequest(repo.trunkUrl(), null, null));

        ImportJobResponse first = runImport();
        assertThat(first.status()).isEqualTo(ImportJob.Status.SUCCEEDED);
        assertThat(first.toRevision()).isEqualTo(1);
        assertThat(first.filesScanned()).isEqualTo(2);
        assertThat(first.filesIndexed()).isEqualTo(2);
        assertThat(first.embeddingsCreated()).isEqualTo(first.chunksIndexed());

        CodeSearchService.SearchResponse found = search.search(workspaceId, "where is the daily limit for fund transfers checked?", 5);
        assertThat(found.semanticUsed()).isTrue();
        assertThat(found.results()).isNotEmpty();
        assertThat(found.results().getFirst().path()).isEqualTo("backend/src/com/bank/payments/FundTransferService.java");
        assertThat(found.results().getFirst().matchedBy()).isEqualTo("keyword + semantic");
        assertThat(found.results().stream().limit(3).map(CodeSearchService.SearchResult::symbol))
                .contains("FundTransferService.checkDailyLimit(TransferRequest)");

        ProjectProfileService.ProfileResponse profile = profiles.get(workspaceId);
        assertThat(profile.revision()).isEqualTo(1);
        assertThat(fact(profile, "ui.moduleSystem").value()).startsWith("RequireJS");
        assertThat(fact(profile, "ui.moduleSystem").status()).isEqualTo("detected");
        assertThat(fact(profile, "backend.javaVersion").status()).isEqualTo("missing");

        profiles.setValue(workspaceId, "backend.javaVersion", "Java 8");
        profiles.setValue(workspaceId, "ui.moduleSystem", fact(profile, "ui.moduleSystem").value());
        profile = profiles.get(workspaceId);
        assertThat(fact(profile, "backend.javaVersion").status()).isEqualTo("corrected");
        assertThat(fact(profile, "backend.javaVersion").value()).isEqualTo("Java 8");
        assertThat(fact(profile, "ui.moduleSystem").status()).isEqualTo("confirmed");

        repo.commit(Map.of("ui/js/viewModels/beneficiary.js", "define([], function () { function BeneficiaryViewModel() {} });"),
                List.of("ui/js/viewModels/account-summary.js"));

        ImportJobResponse second = runImport();
        assertThat(second.status()).isEqualTo(ImportJob.Status.SUCCEEDED);
        assertThat(second.fromRevision()).isEqualTo(1);
        assertThat(second.toRevision()).isEqualTo(2);
        assertThat(second.filesIndexed()).isEqualTo(1);
        assertThat(second.filesRemoved()).isEqualTo(1);

        ImportService.IndexStatusResponse status = imports.indexStatus(workspaceId);
        assertThat(status.indexedRevision()).isEqualTo(2);
        assertThat(status.files()).isEqualTo(2);
        assertThat(status.filesByLanguage()).containsEntry("java", 1L).containsEntry("javascript", 1L);
        assertThat(search.search(workspaceId, "AccountSummaryViewModel", 5).results())
                .noneMatch(result -> result.path().contains("account-summary"));

        ProjectProfileService.ProfileResponse updated = profiles.get(workspaceId);
        assertThat(updated.revision()).isEqualTo(2);
        assertThat(fact(updated, "backend.javaVersion").value()).as("corrections survive a re-scan").isEqualTo("Java 8");
        assertThat(fact(profiles.reset(workspaceId, "backend.javaVersion"), "backend.javaVersion").status()).isEqualTo("missing");
    }

    private static ProjectProfileService.FactView fact(ProjectProfileService.ProfileResponse profile, String key) {
        return profile.facts().stream().filter(f -> f.key().equals(key)).findFirst().orElseThrow();
    }

    private ImportJobResponse runImport() throws InterruptedException {
        ImportJobResponse job = imports.start(workspaceId);
        Instant deadline = Instant.now().plus(Duration.ofSeconds(60));
        while (Instant.now().isBefore(deadline)) {
            ImportJobResponse current = imports.recent(workspaceId, 1).getFirst();
            if (current.id().equals(job.id()) && (current.status() == ImportJob.Status.SUCCEEDED || current.status() == ImportJob.Status.FAILED)) {
                return current;
            }
            Thread.sleep(200);
        }
        throw new AssertionError("Import did not finish in time");
    }
}
