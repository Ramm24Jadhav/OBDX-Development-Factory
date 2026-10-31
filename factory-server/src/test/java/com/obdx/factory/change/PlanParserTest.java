package com.obdx.factory.change;

import com.obdx.factory.common.BadRequestException;
import org.junit.jupiter.api.Test;

import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class PlanParserTest {

    private final Set<String> existing = Set.of("ui/js/viewModels/fund-transfer.js", "ui/js/views/fund-transfer.html",
            "backend/src/com/bank/payments/FundTransferService.java");

    @Test
    void makesPlansSafeAndConsistentWithTheCode() {
        ChangePlan plan = PlanParser.parse("""
                Here is the plan:
                {"summary": "Add remarks",
                 "items": [
                   {"path": "ui/js/viewModels/fund-transfer.js", "action": "create", "layer": "UI", "basedOn": ["missing.js"]},
                   {"path": "/backend/src/com/bank/payments/FundTransferService.java", "action": "modify", "layer": "service"},
                   {"path": "db/patches/REMARKS.sql", "action": "modify", "purpose": "column"},
                   {"path": "backend/src/com/bank/payments/RemarksValidator.java", "action": "create", "layer": "weird",
                    "basedOn": ["backend/src/com/bank/payments/FundTransferService.java"]},
                   {"path": "../../etc/passwd", "action": "create"},
                   {"path": "ui\\\\js\\\\viewModels\\\\fund-transfer.js"},
                   {"path": "ui/js/.svn/entries"},
                 ],
                 "risks": ["Remarks length unknown", ""]}
                """, existing::contains, 10);

        assertThat(plan.items()).extracting(ChangePlan.Item::path, ChangePlan.Item::action, ChangePlan.Item::layer).containsExactly(
                org.assertj.core.groups.Tuple.tuple("db/patches/REMARKS.sql", "create", "data"),
                org.assertj.core.groups.Tuple.tuple("backend/src/com/bank/payments/FundTransferService.java", "modify", "service"),
                org.assertj.core.groups.Tuple.tuple("backend/src/com/bank/payments/RemarksValidator.java", "create", "service"),
                org.assertj.core.groups.Tuple.tuple("ui/js/viewModels/fund-transfer.js", "modify", "ui"));
        assertThat(plan.items().get(2).basedOn()).containsExactly("backend/src/com/bank/payments/FundTransferService.java");
        assertThat(plan.items().get(3).basedOn()).isEmpty();
        assertThat(plan.risks()).containsExactly("Remarks length unknown");
    }

    @Test
    void buildAndCiFilesAreMarkedAndNamedAsARisk() {
        String json = """
                {"items": [
                   {"path": "backend/pom.xml", "purpose": "add a plugin"},
                   {"path": "Jenkinsfile"},
                   {"path": "scripts/deploy.sh"},
                   {"path": ".github/workflows/build.yml"},
                   {"path": "ui/package.json"},
                   {"path": "backend/src/com/bank/payments/RemarksValidator.java"}],
                 "risks": ["Remarks length unknown"]}
                """;
        ChangePlan plan = PlanParser.parse(json, existing::contains, 10);

        assertThat(plan.items()).filteredOn(i -> i.purpose() != null && i.purpose().startsWith("[Build or CI file]")).hasSize(5);
        assertThat(plan.items()).filteredOn(i -> i.path().endsWith("pom.xml")).singleElement()
                .satisfies(i -> assertThat(i.purpose()).isEqualTo("[Build or CI file] add a plugin"));
        assertThat(plan.risks()).hasSize(2);
        assertThat(plan.risks().get(1)).startsWith("The plan changes build or CI files: ").contains("Jenkinsfile", "scripts/deploy.sh", "ui/package.json")
                .doesNotContain("RemarksValidator");

        // normalising the approved plan again changes nothing
        ChangePlan again = PlanParser.normalize(plan, existing::contains, 10);
        assertThat(again.items()).isEqualTo(plan.items());
        assertThat(again.risks()).isEqualTo(plan.risks());
        assertThat(PlanParser.isBuildFile("ui/js/viewModels/fund-transfer.js")).isFalse();
        assertThat(PlanParser.isBuildFile("docker/Dockerfile.prod")).isTrue();
    }

    @Test
    void rejectsEmptyOrOversizedPlans() {
        assertThatThrownBy(() -> PlanParser.parse("{\"items\": []}", existing::contains, 10))
                .isInstanceOf(BadRequestException.class).hasMessageContaining("no files");
        assertThatThrownBy(() -> PlanParser.parse("{\"items\": [{\"path\": \"a.js\"}, {\"path\": \"b.js\"}]}", existing::contains, 1))
                .hasMessageContaining("at most 1");
        assertThatThrownBy(() -> PlanParser.parse("no plan", existing::contains, 10)).hasMessageContaining("No JSON");
    }
}
