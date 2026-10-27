package com.obdx.factory.design;

import com.obdx.factory.common.ConflictException;
import com.obdx.factory.common.NotFoundException;
import com.obdx.factory.model.ModelGateway;
import com.obdx.factory.requirements.Requirement;
import com.obdx.factory.requirements.RequirementService;
import com.obdx.factory.workspace.WorkspaceRequest;
import com.obdx.factory.workspace.WorkspaceService;
import org.junit.jupiter.api.AfterEach;
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
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * From an approved requirement to an approved screen design: generate designs, edit, change by instruction,
 * share a review link, comment and approve as the customer. Runs when FACTORY_TEST_DB_URL is set.
 */
@SpringBootTest
@EnabledIfEnvironmentVariable(named = "FACTORY_TEST_DB_URL", matches = ".+")
class DesignFlowIntegrationTest {

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

    static final String SPEC = """
            {"title": "Remarks", "screens": [
              {"name": "Own Account Transfer", "changeType": "enhance",
               "fields": [{"name": "amount", "type": "amount", "mandatory": true}, {"name": "remarks", "type": "text", "validations": ["max length 35"]}],
               "actions": [{"name": "Submit"}]},
              {"name": "Transfer Confirmation", "changeType": "enhance", "fields": [{"name": "remarks", "type": "display"}]}],
             "openQuestions": []}
            """;

    static final String CHANGED = """
            {"name": "Own Account Transfer", "changeType": "enhance", "sections": [{"id": "s-1", "title": "Details", "columns": 1,
              "components": [{"id": "c-remarks", "type": "textarea", "name": "remarks", "label": "Remarks", "maxLength": 35},
                             {"id": "c-amount", "type": "amount", "name": "amount", "label": "Amount", "required": true}]}],
             "actions": [{"id": "a-submit", "label": "Submit", "kind": "primary"}]}
            """;

    @TestConfiguration
    static class CannedModel {
        @Bean
        @Primary
        ModelGateway cannedModelGateway() {
            return new ModelGateway() {
                @Override
                public ChatResult chat(String systemPrompt, String userPrompt) {
                    return new ChatResult("", "canned", 0);
                }

                @Override
                public ChatResult chatJson(String systemPrompt, String userPrompt) {
                    return new ChatResult(userPrompt.contains("Instruction:") ? CHANGED : SPEC, "canned", 0);
                }

                @Override
                public float[] embed(String text) {
                    return new float[]{1, 0};
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
    private RequirementService requirements;

    @Autowired
    private ScreenDesignService designs;

    private UUID workspaceId;

    @AfterEach
    void deleteWorkspace() {
        if (workspaceId != null) {
            workspaces.delete(workspaceId);
        }
    }

    @Test
    void designsReviewsAndApprovesScreens() throws Exception {
        workspaceId = workspaces.create(new WorkspaceRequest("design-" + UUID.randomUUID(), "Test Bank", "22.x", null)).id();
        UUID requirementId = requirements.fromText(workspaceId, "Remarks", "Add remarks to transfers.").id();
        waitForStatus(requirementId, Requirement.Status.READY);

        assertThatThrownBy(() -> designs.fromRequirement(requirementId)).hasMessageContaining("Approve the requirement");
        requirements.approve(requirementId);

        List<ScreenDesignService.DesignSummary> created = designs.fromRequirement(requirementId);
        assertThat(created).extracting(ScreenDesignService.DesignSummary::name).containsExactly("Own Account Transfer", "Transfer Confirmation");
        assertThat(created.getFirst().components()).isEqualTo(2);
        assertThatThrownBy(() -> designs.fromRequirement(requirementId)).isInstanceOf(ConflictException.class);

        UUID designId = created.getFirst().id();
        ScreenDesignService.DesignDetail generated = designs.get(designId);
        assertThat(generated.currentVersion()).isEqualTo(1);
        assertThat(generated.model().sections().getFirst().components().get(1).maxLength()).isEqualTo(35);

        List<ScreenModel.Component> reordered = new ArrayList<>(generated.model().sections().getFirst().components());
        reordered.add(reordered.removeFirst());
        ScreenModel edited = new ScreenModel(generated.model().name(), "Transfer between my accounts", null, "enhance",
                List.of(new ScreenModel.Section("s-1", "Details", 2, reordered)), generated.model().actions());
        ScreenDesignService.DesignDetail saved = designs.save(designId, edited, "Remarks first");
        assertThat(saved.currentVersion()).isEqualTo(2);
        assertThat(saved.model().title()).isEqualTo("Transfer between my accounts");

        ScreenDesignService.DesignDetail changed = designs.aiChange(designId, "make remarks a multi-line text and one column");
        assertThat(changed.currentVersion()).isEqualTo(3);
        assertThat(changed.model().sections().getFirst().components().getFirst().type()).isEqualTo("textarea");
        assertThat(changed.versions()).extracting(DesignStore.VersionInfo::origin)
                .containsExactly(DesignStore.Origin.AI, DesignStore.Origin.EDITED, DesignStore.Origin.GENERATED);
        assertThat(designs.version(designId, 1).sections().getFirst().components().getFirst().name()).isEqualTo("amount");

        String token = designs.openReview(designId, 7).reviewToken();
        assertThat(token).hasSizeGreaterThan(20);
        ScreenDesignService.ReviewView review = designs.review(token);
        assertThat(review.version()).isEqualTo(3);
        assertThat(review.status()).isEqualTo(ScreenDesign.Status.IN_REVIEW);

        designs.reviewComment(token, "Priya (Bank A)", "Please show the remaining characters for remarks.", "c-remarks");
        ScreenDesignService.ReviewView approved = designs.reviewApprove(token, "Priya (Bank A)");
        assertThat(approved.status()).isEqualTo(ScreenDesign.Status.APPROVED);
        assertThat(approved.comments()).extracting(DesignStore.Comment::text)
                .containsExactly("Please show the remaining characters for remarks.", "Approved version 3.");

        assertThatThrownBy(() -> designs.review(token)).isInstanceOf(NotFoundException.class);
        assertThatThrownBy(() -> designs.save(designId, edited, null)).hasMessageContaining("Reopen it");
        ScreenDesignService.DesignDetail detail = designs.get(designId);
        assertThat(detail.approvedVersion()).isEqualTo(3);
        assertThat(detail.approvedBy()).isEqualTo("Priya (Bank A)");
        assertThat(designs.reopen(designId).status()).isEqualTo(ScreenDesign.Status.DRAFT);
    }

    private void waitForStatus(UUID id, Requirement.Status status) throws InterruptedException {
        Instant deadline = Instant.now().plus(Duration.ofSeconds(30));
        while (Instant.now().isBefore(deadline)) {
            if (requirements.get(id).status() == status) {
                return;
            }
            Thread.sleep(100);
        }
        throw new AssertionError("Requirement did not reach " + status);
    }
}
