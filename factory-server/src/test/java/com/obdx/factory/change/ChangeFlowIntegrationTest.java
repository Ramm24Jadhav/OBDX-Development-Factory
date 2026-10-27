package com.obdx.factory.change;

import com.obdx.factory.common.BadRequestException;
import com.obdx.factory.design.ScreenDesignService;
import com.obdx.factory.importing.ImportJob;
import com.obdx.factory.importing.ImportService;
import com.obdx.factory.model.ModelGateway;
import com.obdx.factory.requirements.Requirement;
import com.obdx.factory.requirements.RequirementService;
import com.obdx.factory.svn.SvnClient;
import com.obdx.factory.svn.SvnCredentials;
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
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Supplier;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

/**
 * From an approved requirement and design to code on an SVN branch: impact analysis, plan approval, generation
 * with a fix of a broken file, review edit, patch and delivery. The model is replaced by canned answers; the code
 * comes from a real (local) SVN repository. Runs when FACTORY_TEST_DB_URL is set.
 */
@SpringBootTest
@EnabledIfEnvironmentVariable(named = "FACTORY_TEST_DB_URL", matches = ".+")
class ChangeFlowIntegrationTest {

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

    static final String SERVICE = """
            package com.bank.payments;

            public class FundTransferService {
                public void transfer(TransferRequest request) {
                    host.book(request);
                }
            }
            """;

    static final String SPEC = """
            {"title": "Transfer remarks", "screens": [{"name": "Fund Transfer", "changeType": "enhance",
              "fields": [{"name": "remarks", "type": "text", "mandatory": false, "validations": ["max length 35"]}]}],
             "businessRules": [{"description": "Remarks are sent to the host as the narrative"}], "openQuestions": []}
            """;

    static final String PLAN = """
            {"summary": "Add remarks to fund transfers.",
             "items": [
               {"path": "ui/js/viewModels/fund-transfer.js", "action": "modify", "layer": "ui", "purpose": "Remarks field"},
               {"path": "backend/src/com/bank/payments/RemarksValidator.java", "action": "create", "layer": "service",
                "purpose": "Validate remarks", "basedOn": ["backend/src/com/bank/payments/FundTransferService.java"]},
               {"path": "backend/src/com/bank/payments/FundTransferService.java", "action": "modify", "layer": "service",
                "purpose": "Pass remarks to the host"},
               {"path": "db/patches/remarks/ADD_REMARKS.sql", "action": "create", "layer": "data"}],
             "risks": ["Host narrative length is assumed to be 35"]}
            """;

    static final AtomicInteger validatorAttempts = new AtomicInteger();

    @TestConfiguration
    static class CannedModel {
        @Bean
        @Primary
        ModelGateway cannedModelGateway() {
            return new ModelGateway() {
                @Override
                public ChatResult chat(String systemPrompt, String userPrompt) {
                    String file = userPrompt.lines().findFirst().orElse("");
                    String reply;
                    if (file.contains("RemarksValidator.java")) {
                        reply = validatorAttempts.incrementAndGet() == 1
                                ? "package com.bank.payments;\npublic class RemarksValidator { void check( }"
                                : "```java\npackage com.bank.payments;\n\npublic class RemarksValidator {\n    void check(String remarks) {\n    }\n}\n```";
                    } else if (file.contains("FundTransferService.java")) {
                        reply = SERVICE.replace("host.book(request);", "host.book(request, request.getRemarks());");
                    } else if (file.contains("fund-transfer.js")) {
                        reply = "define(['knockout'], function (ko) {\n  function VM() {\n    this.amount = ko.observable();\n"
                                + "    this.remarks = ko.observable('');\n  }\n  return VM;\n});\n";
                    } else {
                        reply = "ALTER TABLE DIGX_PY_TRANSFER ADD (REMARKS VARCHAR2(35));\n";
                    }
                    return new ChatResult(reply, "canned", 0);
                }

                @Override
                public ChatResult chatJson(String systemPrompt, String userPrompt) {
                    return new ChatResult(systemPrompt.contains("change plan") ? PLAN : SPEC, "canned", 0);
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
    private ImportService imports;

    @Autowired
    private RequirementService requirements;

    @Autowired
    private ScreenDesignService designs;

    @Autowired
    private ChangeService changes;

    @Autowired
    private SvnClient svn;

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
    void plansGeneratesReviewsAndDeliversCode() throws Exception {
        TestSvnRepository repo = TestSvnRepository.create(temp.resolve("svn"), Map.of(
                "backend/src/com/bank/payments/FundTransferService.java", SERVICE,
                "ui/js/viewModels/fund-transfer.js", "define(['knockout'], function (ko) {\n  function VM() {\n    this.amount = ko.observable();\n  }\n  return VM;\n});\n"));
        workspaceId = workspaces.create(new WorkspaceRequest("change-" + UUID.randomUUID(), "Bank A", "22.x", null)).id();
        workspaces.updateSvnSettings(workspaceId, new SvnSettingsRequest(repo.trunkUrl(), null, null));
        UUID job = imports.start(workspaceId).id();
        waitFor(() -> imports.recent(workspaceId, 1).getFirst().status() == ImportJob.Status.SUCCEEDED, "import of " + job);

        UUID requirementId = requirements.fromText(workspaceId, "Transfer remarks", "Add remarks to transfers.").id();
        waitFor(() -> requirements.get(requirementId).status() == Requirement.Status.READY, "spec");
        requirements.approve(requirementId, "Lead");
        UUID designId = designs.fromRequirement(requirementId).getFirst().id();

        assertThatThrownBy(() -> changes.create(requirementId, "Dev"))
                .isInstanceOf(BadRequestException.class).hasMessageContaining("Approve the screen designs first: Fund Transfer");
        designs.approve(designId, "Lead");

        UUID changeId = changes.create(requirementId, "Dev").id();
        waitFor(() -> changes.get(changeId).status() == ChangeRequest.Status.PLAN_READY, "plan");
        ChangeService.ChangeDetail planned = changes.get(changeId);
        assertThat(planned.plan().items()).extracting(ChangePlan.Item::path).containsExactly(
                "db/patches/remarks/ADD_REMARKS.sql",
                "backend/src/com/bank/payments/RemarksValidator.java",
                "backend/src/com/bank/payments/FundTransferService.java",
                "ui/js/viewModels/fund-transfer.js");
        assertThat(planned.baseRevision()).isEqualTo(1);
        assertThat(planned.plan().risks()).containsExactly("Host narrative length is assumed to be 35");

        changes.approvePlan(changeId, "Lead");
        waitFor(() -> changes.get(changeId).status() == ChangeRequest.Status.GENERATED, "generation");
        ChangeService.ChangeDetail generated = changes.get(changeId);
        assertThat(generated.planApprovedBy()).isEqualTo("Lead");
        assertThat(generated.files()).extracting(ChangeService.FileView::path, ChangeService.FileView::status, ChangeService.FileView::checkStatus)
                .containsExactly(
                        org.assertj.core.groups.Tuple.tuple("db/patches/remarks/ADD_REMARKS.sql", ChangeFileStore.Status.GENERATED, FileChecks.Status.NOT_CHECKED),
                        org.assertj.core.groups.Tuple.tuple("backend/src/com/bank/payments/RemarksValidator.java", ChangeFileStore.Status.GENERATED, FileChecks.Status.PASSED),
                        org.assertj.core.groups.Tuple.tuple("backend/src/com/bank/payments/FundTransferService.java", ChangeFileStore.Status.GENERATED, FileChecks.Status.PASSED),
                        org.assertj.core.groups.Tuple.tuple("ui/js/viewModels/fund-transfer.js", ChangeFileStore.Status.GENERATED, FileChecks.Status.PASSED));
        assertThat(generated.files().get(1).attempts()).as("broken validator fixed once").isEqualTo(2);
        assertThat(generated.files().get(2).linesAdded()).isEqualTo(1);
        assertThat(generated.files().get(2).linesRemoved()).isEqualTo(1);

        ChangeService.FileContent service = changes.fileContent(changeId, "backend/src/com/bank/payments/FundTransferService.java");
        assertThat(service.diff()).contains("-        host.book(request);", "+        host.book(request, request.getRemarks());");

        changes.editFile(changeId, "db/patches/remarks/ADD_REMARKS.sql", "ALTER TABLE DIGX_PY_TRANSFER ADD (REMARKS VARCHAR2(35 CHAR));");
        assertThat(changes.get(changeId).files().getFirst().edited()).isTrue();

        String patch = changes.patch(changeId);
        assertThat(patch).contains("Index: backend/src/com/bank/payments/RemarksValidator.java",
                "--- db/patches/remarks/ADD_REMARKS.sql\t(nonexistent)", "+ALTER TABLE DIGX_PY_TRANSFER ADD (REMARKS VARCHAR2(35 CHAR));",
                "--- ui/js/viewModels/fund-transfer.js\t(revision 1)");

        ChangeService.ChangeDetail delivered = changes.deliverToBranch(changeId);
        assertThat(delivered.status()).isEqualTo(ChangeRequest.Status.DELIVERED);
        assertThat(delivered.branchUrl()).endsWith("/branches/factory/cr-" + changeId.toString().substring(0, 8));
        assertThat(delivered.deliveredRevision()).isEqualTo(2);

        Path branch = temp.resolve("branch-checkout");
        svn.checkout(delivered.branchUrl(), branch, SvnCredentials.NONE);
        assertThat(branch.resolve("backend/src/com/bank/payments/FundTransferService.java")).content().contains("request.getRemarks()");
        assertThat(branch.resolve("backend/src/com/bank/payments/RemarksValidator.java")).content().contains("class RemarksValidator");
        assertThat(branch.resolve("db/patches/remarks/ADD_REMARKS.sql")).content().contains("35 CHAR");
        assertThatThrownBy(() -> changes.deliverToBranch(changeId)).hasMessageContaining("is delivered");
    }

    private static void waitFor(Supplier<Boolean> condition, String what) throws InterruptedException {
        Instant deadline = Instant.now().plus(Duration.ofSeconds(60));
        while (Instant.now().isBefore(deadline)) {
            if (condition.get()) {
                return;
            }
            Thread.sleep(150);
        }
        throw new AssertionError("Timed out waiting for " + what);
    }
}
