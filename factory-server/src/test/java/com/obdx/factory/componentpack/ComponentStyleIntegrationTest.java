package com.obdx.factory.componentpack;

import com.obdx.factory.componentpack.ComponentPackService.Choice;
import com.obdx.factory.componentpack.ComponentPackService.Motion;
import com.obdx.factory.componentpack.ComponentPackService.Style;
import com.obdx.factory.workspace.WorkspaceRequest;
import com.obdx.factory.workspace.WorkspaceService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import java.nio.file.Path;
import java.util.Base64;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/** A workspace's component style is the default until saved, then what was saved. Runs when FACTORY_TEST_DB_URL is set. */
@SpringBootTest(properties = "factory.indexing.embeddings-enabled=false")
@EnabledIfEnvironmentVariable(named = "FACTORY_TEST_DB_URL", matches = ".+")
@org.junit.jupiter.api.extension.ExtendWith(com.obdx.factory.common.ForgetSecrets.class)
class ComponentStyleIntegrationTest {

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
    private ComponentStyleStore styles;

    @Autowired
    private ComponentPackService service;

    private UUID workspaceId;

    @AfterEach
    void deleteWorkspace() {
        if (workspaceId != null) {
            workspaces.delete(workspaceId);
        }
    }

    @Test
    void theDefaultUntilSavedThenWhatWasSaved() {
        workspaceId = workspaces.create(new WorkspaceRequest("style-" + UUID.randomUUID(), "Bank S", "25.x", null)).id();
        ComponentStyleStore.SavedStyle first = styles.get(workspaceId);
        assertThat(first.savedAt()).isNull();
        assertThat(first.style().defaults().look()).isEqualTo("elevated");

        Style style = service.validate(new Style(new Choice("glass", new Motion("glow", "ripple", "none"), "dark", "emerald"),
                Map.of("button", new Choice("brutal", new Motion("shine", null, null), null, "gold"))));
        styles.save(workspaceId, style, "alex");
        ComponentStyleStore.SavedStyle saved = styles.get(workspaceId);
        assertThat(saved.savedBy()).isEqualTo("alex");
        assertThat(saved.savedAt()).isNotNull();
        assertThat(saved.style()).isEqualTo(style);

        // Saving again replaces it
        styles.save(workspaceId, ComponentPackService.defaultStyle(), "sam");
        assertThat(styles.get(workspaceId).style().components()).isEmpty();
        assertThat(styles.get(workspaceId).savedBy()).isEqualTo("sam");
    }
}
