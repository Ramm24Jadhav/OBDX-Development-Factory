package com.obdx.factory.change;

import org.junit.jupiter.api.Test;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/** What a file being written is shown of the change's other files, and how Java is outlined. */
class ContextAndOutlineTest {

    private static final String RESOURCE = """
            package com.bank.si;
            import javax.ws.rs.*;
            @Path("/payments/standingInstructions")
            @SuppressWarnings({"unused"})
            public class StandingInstructionResource extends BaseResource implements Audited {
                @GET
                @Path("/{instructionId}")
                @Produces("application/json")
                public Response read(@PathParam("instructionId") String id) { return null; }
                private void helper() { }
            }
            """;

    @Test
    void theOutlineHeaderComesFromTheSyntaxTreeNotTheText() {
        String outline = JavaOutline.of(RESOURCE);

        assertThat(outline).contains("public class StandingInstructionResource extends BaseResource implements Audited {")
                .doesNotContain("@Path(").doesNotContain("SuppressWarnings");
        assertThat(JavaOutline.of("package x;\npublic @interface Audited { String value() default \"\"; }\n")).contains("public @interface Audited");
        assertThat(JavaOutline.of("package x;\npublic record SiView(String amount, int count) implements Shown { }\n"))
                .contains("public record SiView(String amount, int count) implements Shown");
    }

    @Test
    void aScreensScriptSeesTheResourcesPathsAndAResourceTheBundleKeys() {
        Map<String, String> earlier = new LinkedHashMap<>();
        earlier.put("backend/si/StandingInstructionResource.java", RESOURCE);
        earlier.put("ui/resources/nls/standing-instruction.js", "define({ root: { title: 'Standing instructions', amount: 'Amount' } });");
        earlier.put("ui/js/viewModels/other.js", "define([], function () {});");

        ChangePlan.Item script = new ChangePlan.Item("ui/js/viewModels/standing-instruction.js", "create", "ui", "List screen", List.of(), null);
        Map<String, String> forScript = CodeGenerator.related(script, earlier, 1);
        assertThat(forScript.get("backend/si/StandingInstructionResource.java"))
                .contains("@Path(\"/payments/standingInstructions\")", "@GET @Path(\"/{instructionId}\")", "Response read(")
                .doesNotContain("helper");

        ChangePlan.Item resource = new ChangePlan.Item("backend/si/SiQueryResource.java", "create", "service", "Query resource", List.of(), null);
        assertThat(CodeGenerator.related(resource, earlier, 1).get("ui/resources/nls/standing-instruction.js"))
                .isEqualTo("Keys: title, amount");

        // a file the plan item names is shown whatever its language
        ChangePlan.Item service = new ChangePlan.Item("backend/si/SiService.java", "create", "service",
                "Uses the labels of ui/js/viewModels/other.js", List.of(), null);
        assertThat(CodeGenerator.related(service, earlier, 1)).containsKey("ui/js/viewModels/other.js");
    }

    @Test
    void theContextShrinksWithTheScaleNotByACount() {
        Map<String, String> earlier = new LinkedHashMap<>();
        for (int i = 0; i < 20; i++) {
            earlier.put("backend/si/Si" + i + "Dto.java", "package com.bank.si;\npublic class Si" + i + "Dto {\n" + "    private String field;\n".repeat(30) + "}\n");
        }
        ChangePlan.Item item = new ChangePlan.Item("backend/si/SiService.java", "create", "service", null, List.of(), null);

        int full = CodeGenerator.related(item, earlier, 1).values().stream().mapToInt(String::length).sum();
        int small = CodeGenerator.related(item, earlier, 0.1).values().stream().mapToInt(String::length).sum();

        assertThat(CodeGenerator.related(item, earlier, 1)).hasSizeGreaterThan(6);
        assertThat(small).isLessThan(full).isLessThanOrEqualTo(2000);
    }

    @Test
    void resourcesFoldersAndImportedClassesAreToldApart() {
        assertThat(PlanReview.isResource("backend/si/SiRestApi.java")).isTrue();
        assertThat(PlanReview.isResource("backend/si/SiControllerImpl.java")).isTrue();
        assertThat(PlanReview.isResource("backend/si/SiService.java")).isFalse();
        assertThat(PlanReview.sameFolder("src/com/bank/si", "com/bank/si")).isTrue();
        assertThat(PlanReview.sameFolder("src/com/bank/xsi", "si")).isFalse();

        // Validator is imported from another package than the written one: its methods are not checked against it
        Map<String, String> classes = Map.of("Validator", "package com.bank.si;\npublic class Validator { public void check(String s) { } }");
        String service = "package com.bank.si;\nimport org.lib.Validator;\nclass S { void run() { Validator.validate(\"x\"); } }";
        assertThat(CrossFileJava.missingMethods(service, classes)).isEmpty();
        assertThat(CrossFileJava.missingMethods("package com.bank.si;\nclass S { void run() { Validator.validate(\"x\"); } }", classes))
                .hasSize(1);
    }

    @Test
    void aMissingPackageUnderTheBanksRootCountsOnlyWhenItIsTheBanks() {
        List<String> planned = List.of("backend/src/com/bank/obdx/common/HostIntegrationException.java");

        // the change creates it
        assertThat(ChangeService.bankFolder("com/bank/obdx/common", planned, parent -> false)).isTrue();
        // a sibling package is indexed
        assertThat(ChangeService.bankFolder("com/bank/obdx/audit", List.of(), parent -> parent.equals("com/bank/obdx"))).isTrue();
        // generated code, or nothing of the bank beside it: a library's package
        assertThat(ChangeService.bankFolder("com/bank/obdx/generated", List.of(), parent -> true)).isFalse();
        assertThat(ChangeService.bankFolder("com/bank/obdx/stub", List.of(), parent -> true)).isFalse();
        assertThat(ChangeService.bankFolder("com/bank/obdx/audit", List.of(), parent -> false)).isFalse();

        String service = "package com.bank.obdx.payments;\nimport com.bank.obdx.generated.HostClient;\nimport com.bank.obdx.audit.AuditTrail;\nclass S {}";
        assertThat(ChangeService.unresolvedImports(service, path -> false, folder -> false, "com.bank.obdx",
                folder -> ChangeService.bankFolder(folder, List.of(), parent -> true))).containsExactly("com.bank.obdx.audit.AuditTrail");
    }
}
