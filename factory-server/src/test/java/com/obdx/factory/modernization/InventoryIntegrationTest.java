package com.obdx.factory.modernization;

import com.obdx.factory.importing.ImportJob;
import com.obdx.factory.importing.ImportService;
import com.obdx.factory.svn.TestSvnRepository;
import com.obdx.factory.workspace.SvnSettingsRequest;
import com.obdx.factory.workspace.WorkspaceRequest;
import com.obdx.factory.workspace.WorkspaceService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

/** The inventory is scanned after an import, stored, and exported. Runs when FACTORY_TEST_DB_URL is set and svn is installed. */
@SpringBootTest(properties = "factory.indexing.embeddings-enabled=false")
@EnabledIfEnvironmentVariable(named = "FACTORY_TEST_DB_URL", matches = ".+")
class InventoryIntegrationTest {

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

    @Autowired
    private WorkspaceService workspaces;

    @Autowired
    private ImportService imports;

    @Autowired
    private InventoryService inventories;

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
    void scansAfterImportStoresAndExports() throws Exception {
        TestSvnRepository repo = TestSvnRepository.create(temp.resolve("svn"), InventoryScannerTest.CODEBASE);
        workspaceId = workspaces.create(new WorkspaceRequest("inventory-" + UUID.randomUUID(), "Bank D", "22.x", null)).id();
        workspaces.updateSvnSettings(workspaceId, new SvnSettingsRequest(repo.trunkUrl(), null, null));
        assertThat(inventories.find(workspaceId)).isEmpty();

        imports.start(workspaceId);
        Instant deadline = Instant.now().plus(Duration.ofSeconds(60));
        while (imports.recent(workspaceId, 1).getFirst().status() != ImportJob.Status.SUCCEEDED) {
            assertThat(Instant.now()).as("import").isBefore(deadline);
            assertThat(imports.recent(workspaceId, 1).getFirst().status()).isNotEqualTo(ImportJob.Status.FAILED);
            Thread.sleep(200);
        }
        assertThat(imports.recent(workspaceId, 1).getFirst().message()).contains("Inventory: 8 screen(s), 6 service(s).");

        // Stored and read back (the mobile/ folder is a normal folder here: the workspace's target is JET).
        Inventory stored = inventories.find(workspaceId).orElseThrow();
        assertThat(stored.revision()).isEqualTo(1L);
        assertThat(stored.summary().screens()).isEqualTo(8);
        assertThat(stored.flows()).hasSize(1);
        assertThat(stored.screens()).anySatisfy(s -> assertThat(s.fields()).hasSize(4));

        String csv = inventories.screensCsv(workspaceId);
        assertThat(csv).startsWith("\uFEFFModule,Screen,Kind,Complexity,Score,Fields,Actions,Services,Opens,Lines,Files\r\n")
                .contains("\"payments\",\"Transfer funds\",\"component\",\"M\",", "\"GET accounts/demandDeposit; GET limits/{}\"", "\"review-transfer\"");
    }
}
