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
@org.junit.jupiter.api.extension.ExtendWith(com.obdx.factory.common.ForgetSecrets.class)
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
        requirements.approve(requirementId, "Lead");

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
        assertThat(approved.comments()).extracting(ScreenDesignService.ReviewComment::text)
                .containsExactly("Please show the remaining characters for remarks.", "Approved version 3.");
        assertThat(approved.comments()).extracting(ScreenDesignService.ReviewComment::kind)
                .containsExactly(DesignStore.Kind.COMMENT, DesignStore.Kind.APPROVAL);

        assertThatThrownBy(() -> designs.review(token)).isInstanceOf(NotFoundException.class);
        assertThatThrownBy(() -> designs.save(designId, edited, null)).hasMessageContaining("Reopen it");
        ScreenDesignService.DesignDetail detail = designs.get(designId);
        assertThat(detail.approvedVersion()).isEqualTo(3);
        assertThat(detail.approvedBy()).isEqualTo("Priya (Bank A)");
        assertThat(designs.reopen(designId).status()).isEqualTo(ScreenDesign.Status.DRAFT);
    }

    @Autowired
    private org.springframework.jdbc.core.JdbcTemplate jdbc;

    /**
     * A review link shows only its screen and what reviewers said; revoking or expiry ends it on the server; a new link
     * replaces the old address; comments are about a part of the current screen, and the team can resolve them.
     */
    @Test
    void reviewLinksShowOnlyTheSharedScreenAndEndWhenRevokedOrExpired() {
        workspaceId = workspaces.create(new WorkspaceRequest("review-" + UUID.randomUUID(), "Test Bank", "22.x", null)).id();
        UUID otherWorkspace = workspaces.create(new WorkspaceRequest("review-other-" + UUID.randomUUID(), "Other Bank", "22.x", null)).id();
        try {
            UUID designId = designs.blank(workspaceId, "Transfer").id();
            ScreenModel.Component accounts = new ScreenModel.Component("c-from", "select", "fromAccount", "From account", true, null, null,
                    null, null, List.of(), List.of(), false, null, java.util.Map.of(), null, null, null,
                    new ScreenModel.DataSource("GET /digx/v1/accounts/demandDeposit", "accounts", "id.value", "displayName"), null, null);
            designs.save(designId, new ScreenModel("Transfer", "Transfer", null, "new",
                    List.of(new ScreenModel.Section("s-1", "Details", 1, List.of(accounts))),
                    List.of(new ScreenModel.ActionButton("a-submit", "Submit", "primary"))), null);
            designs.comment(designId, "Asha (team)", "Internal: check the limits service first", null);
            UUID otherDesign = designs.blank(otherWorkspace, "Other bank screen").id();
            designs.comment(otherDesign, "Ravi (other)", "Other workspace note", null);

            String first = designs.openReview(designId, 7).reviewToken();
            String token = designs.openReview(designId, 7).reviewToken();
            assertThat(token).isNotEqualTo(first);
            assertThatThrownBy(() -> designs.review(first)).isInstanceOf(NotFoundException.class);

            ScreenDesignService.ReviewView view = designs.review(token);
            assertThat(view.name()).isEqualTo("Transfer");
            assertThat(view.comments()).isEmpty();
            assertThat(view.model().sections().getFirst().components().getFirst().dataSource()).isNull();
            assertThat(view.toString()).doesNotContain("Asha", "Internal", "/digx/", "Other workspace note", workspaceId.toString(), designId.toString());

            assertThatThrownBy(() -> designs.reviewComment(token, "Priya", "About a field", "c-missing"))
                    .hasMessageContaining("no longer there");
            assertThatThrownBy(() -> designs.reviewComment(token, "Priya", "x".repeat(ScreenDesignService.MAX_COMMENT + 1), null))
                    .hasMessageContaining("too long");
            ScreenDesignService.ReviewView commented = designs.reviewComment(token, "Priya (Bank A)", "Show the balance", "c-from");
            assertThat(commented.comments()).singleElement().satisfies(c -> {
                assertThat(c.componentId()).isEqualTo("c-from");
                assertThat(c.resolved()).isFalse();
            });

            UUID commentId = designs.get(designId).comments().stream().filter(DesignStore.Comment::fromReview).findFirst().orElseThrow().id();
            DesignStore.Comment resolved = designs.resolveComment(designId, commentId, true, "Asha (team)").comments().stream()
                    .filter(c -> c.id().equals(commentId)).findFirst().orElseThrow();
            assertThat(resolved.resolvedBy()).isEqualTo("Asha (team)");
            assertThat(resolved.resolvedAt()).isNotNull();
            assertThat(designs.review(token).comments().getFirst().resolved()).isTrue();
            assertThat(designs.review(token).toString()).doesNotContain("Asha");
            assertThatThrownBy(() -> designs.resolveComment(otherDesign, commentId, true, "Asha")).isInstanceOf(NotFoundException.class);
            assertThat(designs.resolveComment(designId, commentId, false, null).comments().stream()
                    .filter(c -> c.id().equals(commentId)).findFirst().orElseThrow().resolvedAt()).isNull();

            // Revoked: the link stops working at once
            designs.closeReview(designId);
            assertThatThrownBy(() -> designs.review(token)).isInstanceOf(NotFoundException.class);
            assertThatThrownBy(() -> designs.reviewComment(token, "Priya", "Late", null)).isInstanceOf(NotFoundException.class);
            assertThatThrownBy(() -> designs.reviewApprove(token, "Priya")).isInstanceOf(NotFoundException.class);

            // Expired: refused although the address is still stored
            String later = designs.openReview(designId, 1).reviewToken();
            jdbc.update("UPDATE screen_design SET review_expires_at = now() - interval '1 minute' WHERE id = ?", designId);
            assertThatThrownBy(() -> designs.review(later)).hasMessageContaining("expired");
            assertThatThrownBy(() -> designs.reviewApprove(later, "Priya")).hasMessageContaining("expired");
            assertThat(designs.get(designId).status()).isEqualTo(ScreenDesign.Status.IN_REVIEW);
        } finally {
            workspaces.delete(otherWorkspace);
        }
    }

    @Autowired
    private DesignFlowService flows;

    @Test
    void approvesARequirementsScreensTogether() throws Exception {
        workspaceId = workspaces.create(new WorkspaceRequest("studio-" + UUID.randomUUID(), "Test Bank", "22.x", null)).id();
        UUID requirementId = requirements.fromText(workspaceId, "Remarks", "Add remarks to transfers.").id();
        waitForStatus(requirementId, Requirement.Status.READY);
        requirements.approve(requirementId, "Lead");
        assertThatThrownBy(() -> flows.approve(requirementId, null, "Lead")).hasMessageContaining("Generate the screens");
        List<ScreenDesignService.DesignSummary> created = designs.fromRequirement(requirementId);

        DesignFlowService.DesignFlow flow = flows.flow(requirementId);
        assertThat(flow.screens()).extracting(DesignFlowService.FlowScreen::name).containsExactly("Own Account Transfer", "Transfer Confirmation");
        assertThat(flow.screens().getFirst().model().sections()).isNotEmpty();
        // A text request has no functional requirements: every screen is an "other" one
        assertThat(flow.others()).hasSize(2);

        DesignFlowService.Approval one = flows.approve(requirementId, List.of(created.getFirst().id()), "Lead");
        assertThat(one.approved()).containsExactly("Own Account Transfer");
        DesignFlowService.Approval rest = flows.approve(requirementId, null, "Lead");
        assertThat(rest.approved()).containsExactly("Transfer Confirmation");
        assertThat(rest.flow().screens()).allMatch(s -> s.status() == ScreenDesign.Status.APPROVED && s.approvedVersion() == 1);
        assertThatThrownBy(() -> flows.approve(requirementId, List.of(UUID.randomUUID()), "Lead")).hasMessageContaining("not part of");
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
