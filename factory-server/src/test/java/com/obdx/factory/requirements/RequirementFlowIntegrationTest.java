package com.obdx.factory.requirements;

import com.obdx.factory.common.BadRequestException;
import com.obdx.factory.model.ModelGateway;
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
import java.util.Base64;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Requirement workflow against a real PostgreSQL: draft from text, answer questions, update the spec with the
 * answers, edit, approve. The model is replaced by canned answers.
 * Runs when FACTORY_TEST_DB_URL is set.
 */
@SpringBootTest
@EnabledIfEnvironmentVariable(named = "FACTORY_TEST_DB_URL", matches = ".+")
class RequirementFlowIntegrationTest {

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

    static final String DRAFT = """
            {"title": "Transfer remarks", "summary": "Add remarks to own-account transfers.",
             "screens": [{"name": "Own Account Transfer", "changeType": "enhance",
               "fields": [{"name": "remarks", "label": "Remarks", "type": "text"}]}],
             "openQuestions": [
               {"question": "What is the maximum length of remarks?", "reason": "Needed for validation"},
               {"question": "Is remarks mandatory?"}]}
            """;

    static final String REFINED = """
            {"title": "Transfer remarks", "summary": "Add remarks to own-account transfers.",
             "screens": [{"name": "Own Account Transfer", "changeType": "enhance",
               "fields": [{"name": "remarks", "label": "Remarks", "type": "text", "validations": ["max length 35"]}]}],
             "openQuestions": [
               {"question": "What is the maximum length of remarks?"},
               {"question": "Is remarks mandatory?"},
               {"question": "Should remarks be sent to the host?"}]}
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
                    return new ChatResult(userPrompt.contains("Decisions:") ? REFINED : DRAFT, "canned", 0);
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

    private UUID workspaceId;

    @AfterEach
    void deleteWorkspace() {
        if (workspaceId != null) {
            workspaces.delete(workspaceId);
        }
    }

    @Test
    void draftsAnswersRefinesEditsAndApproves() throws Exception {
        workspaceId = workspaces.create(new WorkspaceRequest("req-" + UUID.randomUUID(), "Test Bank", "22.x", null)).id();

        RequirementService.RequirementDetail created = requirements.fromText(workspaceId, null,
                "Add a remarks field to the own account transfer screen.\nShow it on the confirmation page too.");
        assertThat(created.status()).isEqualTo(Requirement.Status.PROCESSING);
        assertThat(created.title()).isEqualTo("Add a remarks field to the own account transfer screen.");

        RequirementService.RequirementDetail drafted = waitUntilReady(created.id());
        assertThat(drafted.currentVersion()).isEqualTo(1);
        assertThat(drafted.spec().screens()).singleElement().extracting(RequirementSpec.Screen::changeType).isEqualTo("enhance");
        assertThat(drafted.spec().openQuestions()).hasSize(2);
        assertThat(requirements.list(workspaceId)).singleElement().satisfies(summary -> {
            assertThat(summary.screens()).isEqualTo(1);
            assertThat(summary.openQuestions()).isEqualTo(2);
        });

        assertThatThrownBy(() -> requirements.approve(created.id(), "Lead"))
                .isInstanceOf(BadRequestException.class).hasMessageContaining("2 open question(s)");
        assertThatThrownBy(() -> requirements.refine(created.id()))
                .hasMessageContaining("Answer at least one open question");

        RequirementService.RequirementDetail answered = requirements.saveAnswers(created.id(),
                List.of(new RequirementService.Answer(0, "35 characters")));
        assertThat(answered.currentVersion()).isEqualTo(2);
        assertThat(answered.spec().openQuestions().getFirst().answer()).isEqualTo("35 characters");

        requirements.refine(created.id());
        RequirementService.RequirementDetail refined = waitUntilReady(created.id());
        assertThat(refined.currentVersion()).isEqualTo(3);
        assertThat(refined.spec().decisions()).singleElement()
                .isEqualTo(new RequirementSpec.Decision("What is the maximum length of remarks?", "35 characters"));
        assertThat(refined.spec().openQuestions()).as("answered question does not come back")
                .extracting(RequirementSpec.OpenQuestion::question)
                .containsExactly("Is remarks mandatory?", "Should remarks be sent to the host?");
        assertThat(refined.spec().screens().getFirst().fields().getFirst().validations()).containsExactly("max length 35");

        String edited = """
                {"title": "Transfer remarks", "screens": [{"name": "Own Account Transfer", "changeType": "enhance",
                  "fields": [{"name": "remarks", "type": "text", "mandatory": false, "validations": ["max length 35"]}]}],
                 "decisions": [{"question": "What is the maximum length of remarks?", "answer": "35 characters"}],
                 "openQuestions": []}
                """;
        assertThat(requirements.updateSpec(created.id(), edited).currentVersion()).isEqualTo(4);

        RequirementService.RequirementDetail approved = requirements.approve(created.id(), "Lead");
        assertThat(approved.status()).isEqualTo(Requirement.Status.APPROVED);
        assertThat(approved.approvedAt()).isNotNull();
        assertThat(approved.approvedBy()).isEqualTo("Lead");
        assertThatThrownBy(() -> requirements.updateSpec(created.id(), edited)).hasMessageContaining("is approved");
    }

    private RequirementService.RequirementDetail waitUntilReady(UUID id) throws InterruptedException {
        Instant deadline = Instant.now().plus(Duration.ofSeconds(30));
        while (Instant.now().isBefore(deadline)) {
            RequirementService.RequirementDetail detail = requirements.get(id);
            if (detail.status() != Requirement.Status.PROCESSING) {
                assertThat(detail.status()).as(detail.message()).isEqualTo(Requirement.Status.READY);
                return detail;
            }
            Thread.sleep(100);
        }
        throw new AssertionError("Requirement did not finish in time");
    }
}
