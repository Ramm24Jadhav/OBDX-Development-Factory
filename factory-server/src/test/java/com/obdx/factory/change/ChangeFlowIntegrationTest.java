package com.obdx.factory.change;

import com.obdx.factory.common.BadRequestException;
import com.obdx.factory.design.ScreenDesignService;
import com.obdx.factory.importing.ImportJob;
import com.obdx.factory.jenkins.JenkinsSettings;
import com.obdx.factory.jenkins.JenkinsSettingsService;
import com.obdx.factory.jenkins.StubJenkins;
import com.obdx.factory.pack.RecipeService;
import com.obdx.factory.target.TargetPacks;
import com.obdx.factory.target.TargetService;
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
import org.junit.jupiter.api.BeforeEach;
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
        registry.add("factory.jenkins.poll-interval", () -> "50ms");
        registry.add("factory.change.branch-cleanup", () -> "-");
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

    static final String APP_PLAN = """
            {"summary": "Remarks in the mobile app's fund transfer screen.",
             "items": [
               {"path": "mobile/src/api/paymentsApi.ts", "action": "create", "layer": "ui", "purpose": "Transfer service"},
               {"path": "mobile/src/screens/payments/FundTransferScreen.tsx", "action": "create", "layer": "ui", "purpose": "Fund transfer screen"},
               {"path": "mobile/src/screens/payments/__tests__/FundTransferScreen.test.tsx", "action": "create", "layer": "test", "purpose": "Screen test"},
               {"path": "mobile/src/i18n/en.json", "action": "modify", "layer": "ui", "purpose": "Texts"},
               {"path": "mobile/src/navigation/AppNavigator.tsx", "action": "modify", "layer": "ui", "purpose": "Register the screen"}],
             "risks": []}
            """;

    static final AtomicInteger validatorAttempts = new AtomicInteger();
    static final AtomicInteger appScreenAttempts = new AtomicInteger();
    static final List<String> chatPrompts = new java.util.concurrent.CopyOnWriteArrayList<>();
    static final List<String> planPrompts = new java.util.concurrent.CopyOnWriteArrayList<>();

    static final String PAYEE_VIEW_MODEL = """
            define(['knockout', 'ojL10n!resources/nls/payee'], function (ko, nls) {
              'use strict';
              return function PayeeViewModel(params) {
                const self = this;
                self.nls = nls;
                self.payeeName = ko.observable();
                self.accountNumber = ko.observable();
                self.save = function () {
                  params.baseModel.save({ name: self.payeeName(), account: self.accountNumber() });
                };
              };
            });
            """;

    @TestConfiguration
    static class CannedModel {
        @Bean
        @Primary
        ModelGateway cannedModelGateway() {
            return new ModelGateway() {
                @Override
                public ChatResult chat(String systemPrompt, String userPrompt) {
                    chatPrompts.add(userPrompt);
                    String file = userPrompt.lines().findFirst().orElse("");
                    String reply;
                    if (file.startsWith("File to write: mobile/")) {
                        return new ChatResult(appFile(file, userPrompt), "canned", 0);
                    }
                    if (userPrompt.contains("The quick checks")) {
                        reply = "package com.bank.payments;\n\n// fixed after the quick checks\npublic class RemarksValidator {\n"
                                + "    void check(String remarks) {\n    }\n}\n";
                    } else if (userPrompt.contains("The Jenkins build failed")) {
                        reply = "package com.bank.payments;\n\n// fixed after the Jenkins build\npublic class RemarksValidator {\n"
                                + "    void check(String remarks) {\n    }\n}\n";
                    } else if (file.contains("RemarksValidator.java")) {
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
                    if (systemPrompt.contains("change plan")) {
                        planPrompts.add(userPrompt);
                    }
                    return new ChatResult(systemPrompt.contains("change plan") ? (userPrompt.contains("UI target:") ? APP_PLAN : PLAN) : SPEC,
                            "canned", 0);
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

    @Autowired
    private JenkinsSettingsService jenkinsSettings;

    @Autowired
    private ChangeBuildService changeBuilds;

    @Autowired
    private ChangeFileStore changeFiles;

    @Autowired
    private RecipeService recipes;

    @Autowired
    private ChangeBranchService changeBranches;

    @Autowired
    private TargetService targets;

    private UUID workspaceId;

    @BeforeAll
    static void requireSvn() {
        assumeTrue(TestSvnRepository.toolsAvailable(), "svn and svnadmin are not installed");
    }

    /** Files of the mobile app: the generated starting point, except that the screen's first version loses a field. */
    static String appFile(String file, String prompt) {
        String marker = prompt.contains("Starting point generated from the approved Screen Model")
                ? "Starting point generated from the approved Screen Model" : "The texts file with this change's screens added";
        if (prompt.contains(marker)) {
            String start = prompt.substring(prompt.indexOf('\n', prompt.indexOf(marker)) + 1);
            String scaffold = start.substring(0, start.lastIndexOf("\nWrite the complete content of"));
            if (file.contains("FundTransferScreen.tsx") && appScreenAttempts.incrementAndGet() == 1) {
                return scaffold.replace("testID=\"c-remarks\"", "testID=\"remarks-box\"");
            }
            return scaffold;
        }
        if (file.contains("paymentsApi.ts")) {
            return "import { api } from './client';\n\nexport interface TransferRequest {\n  remarks: string;\n}\n\n"
                    + "export function transfer(request: TransferRequest): Promise<void> {\n  return api.post<void>('/digx/v1/payments/transfers', request);\n}\n";
        }
        // Other files (navigation): the current content with one line added.
        int current = prompt.indexOf("Current content of ");
        if (current < 0) {
            return "export {};\n";
        }
        String content = prompt.substring(prompt.indexOf('\n', current) + 1);
        return "// Fund transfer added by the change\n" + content.substring(0, content.indexOf("\n\n"));
    }

    @BeforeEach
    void resetCannedModel() {
        validatorAttempts.set(0);
        appScreenAttempts.set(0);
        chatPrompts.clear();
        planPrompts.clear();
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
                "ui/js/viewModels/fund-transfer.js", "define(['knockout'], function (ko) {\n  function VM() {\n    this.amount = ko.observable();\n  }\n  return VM;\n});\n",
                "ui/ext/js/viewModels/payee.js", PAYEE_VIEW_MODEL));
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
        assertThat(planPrompts.getLast()).contains("Version pack recipes", "Enhance an existing UI screen",
                "follow, for example, ui/ext/js/viewModels/payee.js");

        // Reference examples: found in the bank's customization folder, and pinned by a developer.
        RecipeService.PartView enhanceViewModel = recipes.get(workspaceId).recipes().stream().filter(r -> r.id().equals("ui-enhance-screen"))
                .findFirst().orElseThrow().parts().getFirst();
        assertThat(enhanceViewModel.examples()).extracting(RecipeService.Example::path, RecipeService.Example::reason)
                .contains(org.assertj.core.groups.Tuple.tuple("ui/ext/js/viewModels/payee.js", "In the customization folder ui/ext/"));
        RecipeService.WorkspaceRecipes pinned = recipes.pin(workspaceId, "service-new", "java", "backend/src/com/bank/payments/FundTransferService.java", "dev1");
        assertThat(pinned.recipes().stream().filter(r -> r.id().equals("service-new")).findFirst().orElseThrow().parts().getFirst().examples().getFirst())
                .isEqualTo(new RecipeService.Example("backend/src/com/bank/payments/FundTransferService.java", true, "Pinned by dev1"));
        assertThatThrownBy(() -> recipes.pin(workspaceId, "service-new", "java", "backend/Missing.java", "dev1"))
                .hasMessageContaining("No file backend/Missing.java");
        assertThat(planned.plan().risks()).containsExactly("Host narrative length is assumed to be 35");

        changes.approvePlan(changeId, "Lead");
        waitFor(() -> changes.get(changeId).status() == ChangeRequest.Status.GENERATED, "generation");
        ChangeService.ChangeDetail generated = changes.get(changeId);
        assertThat(generated.planApprovedBy()).isEqualTo("Lead");
        assertThat(generated.files()).extracting(ChangeService.FileView::path, ChangeService.FileView::status, ChangeService.FileView::checkStatus)
                .containsExactly(
                        org.assertj.core.groups.Tuple.tuple("db/patches/remarks/ADD_REMARKS.sql", ChangeFileStore.Status.GENERATED, FileChecks.Status.PASSED),
                        org.assertj.core.groups.Tuple.tuple("backend/src/com/bank/payments/RemarksValidator.java", ChangeFileStore.Status.GENERATED, FileChecks.Status.PASSED),
                        org.assertj.core.groups.Tuple.tuple("backend/src/com/bank/payments/FundTransferService.java", ChangeFileStore.Status.GENERATED, FileChecks.Status.PASSED),
                        org.assertj.core.groups.Tuple.tuple("ui/js/viewModels/fund-transfer.js", ChangeFileStore.Status.GENERATED, FileChecks.Status.PASSED));
        assertThat(generated.files().get(1).attempts()).as("broken validator fixed once").isEqualTo(2);
        String viewModelPrompt = chatPrompts.stream().filter(p -> p.startsWith("File to write: ui/js/viewModels/fund-transfer.js")).findFirst().orElseThrow();
        assertThat(viewModelPrompt).contains("How this is built in OBDX (version pack recipe \"Enhance an existing UI screen\", View model)",
                "Example file to follow, ui/ext/js/viewModels/payee.js").doesNotContain("Template to start from");
        String validatorPrompt = chatPrompts.stream().filter(p -> p.startsWith("File to write: backend/src/com/bank/payments/RemarksValidator.java")).findFirst().orElseThrow();
        assertThat(validatorPrompt).contains("version pack recipe \"New backend service or class\"", "Template to start from", "public class <<ClassName>>");
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

        // Jenkins, branch mode: the backend job fails in a generated file, the model fixes it, round 2 passes.
        try (StubJenkins stub = new StubJenkins()) {
            stub.script("obdx/backend build",
                    new StubJenkins.Outcome("FAILURE", "[INFO] Compiling 3 source files\n[ERROR] /var/jenkins/workspace/obdx/"
                            + "backend/src/com/bank/payments/RemarksValidator.java:[5,9] cannot find symbol\nBUILD FAILURE", List.of()),
                    StubJenkins.Outcome.success());
            jenkinsSettings.save(workspaceId, new JenkinsSettingsService.SettingsRequest(stub.url(), "obdx/backend build, obdx/ui",
                    JenkinsSettings.Mode.BRANCH, "BRANCH", JenkinsSettings.BranchValue.PATH, null, "factory", "api-token"));
            assertThat(jenkinsSettings.test(workspaceId).warnings()).isEmpty();

            changeBuilds.start(changeId);
            waitFor(() -> !"BUILDING".equals(changes.get(changeId).buildStatus()), "build");
            ChangeService.ChangeDetail built = changes.get(changeId);
            assertThat(built.buildStatus()).as(built.buildMessage()).isEqualTo("PASSED");
            assertThat(built.buildMessage()).startsWith("Build passed in round 2");
            assertThat(built.builds()).extracting(ChangeBuildStore.Build::round, ChangeBuildStore.Build::job, ChangeBuildStore.Build::result)
                    .containsExactly(
                            org.assertj.core.groups.Tuple.tuple(1, "obdx/backend build", "FAILURE"),
                            org.assertj.core.groups.Tuple.tuple(1, "obdx/ui", "SUCCESS"),
                            org.assertj.core.groups.Tuple.tuple(2, "obdx/backend build", "SUCCESS"),
                            org.assertj.core.groups.Tuple.tuple(2, "obdx/ui", "SUCCESS"));
            ChangeBuildStore.Build failed = built.builds().getFirst();
            assertThat(failed.errors()).singleElement().asString().contains("RemarksValidator.java:5 cannot find symbol");
            assertThat(failed.fixedFiles()).containsExactly("backend/src/com/bank/payments/RemarksValidator.java");
            assertThat(failed.buildNumber()).isNotNull();
            assertThat(stub.triggers).allSatisfy(trigger ->
                    assertThat(trigger.body()).isEqualTo("BRANCH=branches%2Ffactory%2Fcr-" + changeId.toString().substring(0, 8)));

            Path fixedCheckout = temp.resolve("branch-after-fix");
            svn.checkout(delivered.branchUrl(), fixedCheckout, SvnCredentials.NONE);
            assertThat(fixedCheckout.resolve("backend/src/com/bank/payments/RemarksValidator.java")).content()
                    .contains("fixed after the Jenkins build");
            assertThat(svn.info(delivered.branchUrl(), SvnCredentials.NONE).revision()).isEqualTo(3);
        }

        // Jenkins, patch mode: the patch goes as a file; an error outside the change is reported, not "fixed".
        try (StubJenkins stub = new StubJenkins()) {
            stub.parameters.add("PATCH");
            stub.script("obdx/backend build", new StubJenkins.Outcome("FAILURE",
                    "[ERROR] /var/jenkins/workspace/obdx/backend/src/com/bank/Legacy.java:[1,1] class, interface, or enum expected", List.of()));
            jenkinsSettings.save(workspaceId, new JenkinsSettingsService.SettingsRequest(stub.url(), "obdx/backend build",
                    JenkinsSettings.Mode.PATCH, null, null, "PATCH", "factory", null));

            changeBuilds.start(changeId);
            waitFor(() -> !"BUILDING".equals(changes.get(changeId).buildStatus()), "patch build");
            ChangeService.ChangeDetail built = changes.get(changeId);
            assertThat(built.buildStatus()).isEqualTo("FAILED");
            assertThat(built.buildMessage()).contains("no errors in the files of this change", "Legacy.java:1");
            assertThat(stub.triggers.getFirst().contentType()).startsWith("multipart/form-data");
            assertThat(stub.triggers.getFirst().body()).contains("filename=\"change-", "Index: backend/src/com/bank/payments/RemarksValidator.java",
                    "+// fixed after the Jenkins build");
        }

        // Quick checks before Jenkins: a version pack error in a file of the change is fixed before Jenkins builds.
        String validatorPath = "backend/src/com/bank/payments/RemarksValidator.java";
        ChangeFileStore.ChangeFile validator = changeFiles.file(changeId, validatorPath).orElseThrow();
        changeFiles.saveResult(changeId, validatorPath, ChangeFileStore.Status.GENERATED, validator.original(),
                validator.generated().replace("void check(String remarks) {", "void check(String remarks) {\n        System.out.println(remarks);"),
                false, null, validator.attempts());
        ChangeService.FileView checked = changes.checkAgain(changeId).files().stream().filter(f -> f.path().equals(validatorPath)).findFirst().orElseThrow();
        assertThat(checked.checkStatus()).isEqualTo(FileChecks.Status.FAILED);
        assertThat(checked.checkMessage()).startsWith("Line 6 (java-no-system-out, error)");
        try (StubJenkins stub = new StubJenkins()) {
            stub.parameters.add("PATCH");
            stub.script("obdx/backend build", StubJenkins.Outcome.success());
            jenkinsSettings.save(workspaceId, new JenkinsSettingsService.SettingsRequest(stub.url(), "obdx/backend build",
                    JenkinsSettings.Mode.PATCH, null, null, "PATCH", "factory", null));

            changeBuilds.start(changeId);
            waitFor(() -> !"BUILDING".equals(changes.get(changeId).buildStatus()), "build after quick checks");
            ChangeService.ChangeDetail built = changes.get(changeId);
            assertThat(built.buildStatus()).as(built.buildMessage()).isEqualTo("PASSED");
            assertThat(built.buildMessage()).startsWith("Build passed in round 2");
            List<ChangeBuildStore.Build> latest = built.builds().subList(built.builds().size() - 2, built.builds().size());
            assertThat(latest).extracting(ChangeBuildStore.Build::round, ChangeBuildStore.Build::job, ChangeBuildStore.Build::result)
                    .containsExactly(org.assertj.core.groups.Tuple.tuple(1, ChangeBuildService.QUICK_CHECKS, "FAILURE"),
                            org.assertj.core.groups.Tuple.tuple(2, "obdx/backend build", "SUCCESS"));
            assertThat(latest.getFirst().errors()).singleElement().asString().contains(validatorPath, "java-no-system-out");
            assertThat(latest.getFirst().fixedFiles()).containsExactly(validatorPath);
            assertThat(stub.triggers).hasSize(1);
            assertThat(stub.triggers.getFirst().body()).contains("+// fixed after the quick checks").doesNotContain("System.out");
            assertThat(changes.get(changeId).files()).filteredOn(f -> f.path().equals(validatorPath))
                    .extracting(ChangeService.FileView::checkStatus).containsExactly(FileChecks.Status.PASSED);
        }

        // Closing: the branch must be merged first (or closed anyway); a merged branch is found and removed by the cleanup.
        assertThatThrownBy(() -> changes.delete(changeId)).hasMessageContaining("Close it first");
        assertThatThrownBy(() -> changeBranches.close(changeId, ChangeRequest.CloseReason.MERGED, false, "Lead"))
                .hasMessageContaining("of the branch are not merged into " + repo.trunkUrl());
        changeBranches.removeMergedBranches();
        assertThat(changes.get(changeId).status()).isEqualTo(ChangeRequest.Status.DELIVERED);

        repo.mergeIntoTrunk(delivered.branchUrl());
        changeBranches.removeMergedBranches();
        ChangeService.ChangeDetail closed = changes.get(changeId);
        assertThat(closed.status()).isEqualTo(ChangeRequest.Status.CLOSED);
        assertThat(closed.closedReason()).isEqualTo(ChangeRequest.CloseReason.MERGED);
        assertThat(closed.closedBy()).isEqualTo(ChangeBranchService.AUTOMATIC);
        assertThat(closed.branchDeletedRevision()).isNotNull();
        assertThat(closed.message()).contains("branch was removed in revision " + closed.branchDeletedRevision());
        assertThat(svn.exists(delivered.branchUrl(), SvnCredentials.NONE)).isFalse();
        assertThat(svn.exists(repo.trunkUrl().replace("/trunk", "/branches/factory"), SvnCredentials.NONE)).isTrue();
        assertThatThrownBy(() -> changeBranches.close(changeId, ChangeRequest.CloseReason.ABANDONED, false, "Lead"))
                .hasMessageContaining("is closed");
        changes.delete(changeId);
    }

    @Test
    void buildsScreensOfAReactNativeAppFromTheApprovedDesign() throws Exception {
        Map<String, String> repoFiles = new java.util.LinkedHashMap<>(Map.of("backend/src/com/bank/payments/FundTransferService.java", SERVICE));
        TargetPacks.builtIn().find("react-native").orElseThrow().starter().forEach((path, content) -> repoFiles.put("mobile/" + path, content));
        TestSvnRepository repo = TestSvnRepository.create(temp.resolve("svn-app"), repoFiles);
        workspaceId = workspaces.create(new WorkspaceRequest("app-" + UUID.randomUUID(), "Bank C", "25.x", null)).id();
        workspaces.updateSvnSettings(workspaceId, new SvnSettingsRequest(repo.trunkUrl(), null, null));
        UUID job = imports.start(workspaceId).id();
        waitFor(() -> imports.recent(workspaceId, 1).getFirst().status() == ImportJob.Status.SUCCEEDED, "import of " + job);
        assertThatThrownBy(() -> targets.update(workspaceId, new TargetService.TargetRequest("react-native", "../outside")))
                .hasMessageContaining("relative path");
        TargetService.WorkspaceTarget target = targets.update(workspaceId, new TargetService.TargetRequest("react-native", null));
        assertThat(target.appFolder()).isEqualTo("mobile");
        assertThat(target.appFolderExists()).isTrue();

        UUID requirementId = requirements.fromText(workspaceId, "Transfer remarks", "Add remarks to transfers.").id();
        waitFor(() -> requirements.get(requirementId).status() == Requirement.Status.READY, "spec");
        requirements.approve(requirementId, "Lead");
        UUID designId = designs.fromRequirement(requirementId).getFirst().id();
        String token = designs.openReview(designId, 7).reviewToken();
        assertThat(designs.review(token).preview()).as("customers review with the app's components").isEqualTo("react-native");
        designs.approve(designId, "Lead");
        assertThat(targets.code(workspaceId, designs.get(designId).model(), "payments")).extracting(TargetService.CodeFile::path)
                .containsExactly("mobile/src/screens/payments/FundTransferScreen.tsx",
                        "mobile/src/screens/payments/__tests__/FundTransferScreen.test.tsx", "mobile/src/i18n/en.json");

        UUID changeId = changes.create(requirementId, "Dev").id();
        waitFor(() -> changes.get(changeId).status() == ChangeRequest.Status.PLAN_READY, "plan");
        assertThat(planPrompts.getLast()).contains("UI target:", "a new React Native (iOS and Android) app in the folder mobile/",
                "- screen: mobile/src/screens/{module}/{Screen}Screen.tsx", "Screen in the React Native app [new app, in mobile/]");
        assertThat(changes.get(changeId).plan().items()).hasSize(5);

        changes.approvePlan(changeId, "Lead");
        waitFor(() -> changes.get(changeId).status() == ChangeRequest.Status.GENERATED, "code");
        ChangeService.ChangeDetail generated = changes.get(changeId);
        assertThat(generated.files()).extracting(ChangeService.FileView::path, ChangeService.FileView::checkStatus).contains(
                org.assertj.core.groups.Tuple.tuple("mobile/src/screens/payments/FundTransferScreen.tsx", FileChecks.Status.PASSED),
                org.assertj.core.groups.Tuple.tuple("mobile/src/api/paymentsApi.ts", FileChecks.Status.PASSED));
        ChangeService.FileView screen = generated.files().stream().filter(f -> f.path().endsWith("FundTransferScreen.tsx")).findFirst().orElseThrow();
        assertThat(screen.attempts()).as("the screen lost a field once and was fixed").isEqualTo(2);

        String screenPrompt = chatPrompts.stream().filter(p -> p.startsWith("File to write: mobile/src/screens/payments/FundTransferScreen.tsx"))
                .findFirst().orElseThrow();
        assertThat(screenPrompt).contains("How the new app is built (target pack):", "target pack recipe \"Screen in the React Native app\"",
                "Starting point generated from the approved Screen Model", "export function FundTransferScreen(", "testID=\"c-remarks\"")
                .doesNotContain("version pack recipe", "OBDX base service");
        String fixPrompt = chatPrompts.stream().filter(p -> p.startsWith("File to write: mobile/src/screens/payments/FundTransferScreen.tsx")
                && p.contains("Parity with the approved Screen Model")).findFirst().orElseThrow();
        assertThat(fixPrompt).contains("no testID for c-remarks");
        String apiPrompt = chatPrompts.stream().filter(p -> p.startsWith("File to write: mobile/src/api/paymentsApi.ts")).findFirst().orElseThrow();
        assertThat(apiPrompt).contains("Template to start from", "<<Name>>Request");

        assertThat(changes.fileContent(changeId, "mobile/src/i18n/en.json").generated()).contains("\"fundTransfer\": {", "\"common\": {");
        assertThat(changes.fileContent(changeId, "mobile/src/screens/payments/__tests__/FundTransferScreen.test.tsx").generated())
                .contains("const ids = ['c-remarks'");

        // Quick checks of the app follow the target pack, not the JET version pack.
        changes.editFile(changeId, "mobile/src/screens/payments/FundTransferScreen.tsx",
                changes.fileContent(changeId, "mobile/src/screens/payments/FundTransferScreen.tsx").generated()
                        .replace("export function", "const legacy = ko.observable('ojs/ojknockout');\nconsole.log(legacy);\nexport function"));
        ChangeService.FileView edited = changes.checkAgain(changeId).files().stream().filter(f -> f.path().endsWith("FundTransferScreen.tsx"))
                .findFirst().orElseThrow();
        assertThat(edited.checkStatus()).isEqualTo(FileChecks.Status.FAILED);
        assertThat(edited.checkMessage()).contains("(app-no-jet, error)", "(app-no-console, warning)").doesNotContain("js-no-console");
    }

    @Test
    void abandonedChangesLoseTheirBranchButOnlyFactoryBranches() throws Exception {
        TestSvnRepository repo = TestSvnRepository.create(temp.resolve("svn-abandon"), Map.of(
                "backend/src/com/bank/payments/FundTransferService.java", SERVICE,
                "ui/js/viewModels/fund-transfer.js", "define(['knockout'], function (ko) {\n  return function VM() {\n    this.amount = ko.observable();\n  };\n});\n"));
        workspaceId = workspaces.create(new WorkspaceRequest("abandon-" + UUID.randomUUID(), "Bank B", "25.x", null)).id();
        workspaces.updateSvnSettings(workspaceId, new SvnSettingsRequest(repo.trunkUrl(), null, null));
        UUID job = imports.start(workspaceId).id();
        waitFor(() -> imports.recent(workspaceId, 1).getFirst().status() == ImportJob.Status.SUCCEEDED, "import of " + job);
        UUID requirementId = requirements.fromText(workspaceId, "Transfer remarks", "Add remarks to transfers.").id();
        waitFor(() -> requirements.get(requirementId).status() == Requirement.Status.READY, "spec");
        requirements.approve(requirementId, "Lead");
        designs.fromRequirement(requirementId).forEach(d -> designs.approve(d.id(), "Lead"));

        // Without a branch, closing just ends the change.
        UUID planOnly = changes.create(requirementId, "Dev").id();
        waitFor(() -> changes.get(planOnly).status() == ChangeRequest.Status.PLAN_READY, "plan");
        ChangeService.ChangeDetail abandonedPlan = changeBranches.close(planOnly, ChangeRequest.CloseReason.ABANDONED, false, "Lead");
        assertThat(abandonedPlan.status()).isEqualTo(ChangeRequest.Status.CLOSED);
        assertThat(abandonedPlan.branchDeletedRevision()).isNull();

        UUID changeId = changes.create(requirementId, "Dev").id();
        waitFor(() -> changes.get(changeId).status() == ChangeRequest.Status.PLAN_READY, "plan");
        changes.approvePlan(changeId, "Lead");
        waitFor(() -> changes.get(changeId).status() == ChangeRequest.Status.GENERATED, "code");
        ChangeService.ChangeDetail delivered = changes.deliverToBranch(changeId);

        ChangeService.ChangeDetail abandoned = changeBranches.close(changeId, ChangeRequest.CloseReason.ABANDONED, false, "Lead");
        assertThat(abandoned.status()).isEqualTo(ChangeRequest.Status.CLOSED);
        assertThat(abandoned.closedReason()).isEqualTo(ChangeRequest.CloseReason.ABANDONED);
        assertThat(abandoned.closedBy()).isEqualTo("Lead");
        assertThat(abandoned.branchDeletedRevision()).isEqualTo(delivered.deliveredRevision() + 1);
        assertThat(svn.exists(delivered.branchUrl(), SvnCredentials.NONE)).isFalse();
        // The branch is still in the history, at the revision it was delivered.
        assertThat(svn.exists(delivered.branchUrl() + "@" + delivered.deliveredRevision(), SvnCredentials.NONE)).isTrue();
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
