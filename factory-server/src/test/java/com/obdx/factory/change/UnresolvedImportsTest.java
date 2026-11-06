package com.obdx.factory.change;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

class UnresolvedImportsTest {

    private static final String RESOURCE = """
            package com.bank.obdx.payments;

            import com.bank.obdx.payments.dto.BeneficiaryDTO;
            import com.bank.obdx.payments.service.PayeeService;
            import com.bank.obdx.payments.service.PayeeService.Mode;
            import com.bank.obdx.common.*;
            import javax.ws.rs.core.Response;
            import static com.bank.obdx.payments.Limits.MAX;

            public class PayeeResource {
            }
            """;

    private static final Set<String> FOLDERS = Set.of("com/bank/obdx/payments/dto", "com/bank/obdx/payments/service");

    @Test
    void reportsTheBanksOwnClassesThatNobodyWrites() {
        Set<String> existing = Set.of("com/bank/obdx/payments/service/PayeeService.java");

        List<String> missing = ChangeService.unresolvedImports(RESOURCE, existing::contains, FOLDERS::contains);

        // PayeeService.Mode is a nested class of PayeeService.java, which exists
        assertThat(missing).containsExactly("com.bank.obdx.payments.dto.BeneficiaryDTO");
    }

    @Test
    void aNestedClassIsLookedForInItsOuterClassFile() {
        String content = "package com.bank.x;\nimport com.bank.x.Outer.Inner;\nclass A {}";

        assertThat(ChangeService.unresolvedImports(content, Set.of("com/bank/x/Outer.java")::contains, folder -> true)).isEmpty();
        assertThat(ChangeService.unresolvedImports(content, path -> false, folder -> true)).containsExactly("com.bank.x.Outer");
    }

    @Test
    void importsFromPackagesTheCodeHasNoFileInComeFromLibraries() {
        // OBDX extension code: com.ofss.digx.app... is in the product's jars, not in the bank's code
        String extension = """
                package com.ofss.digx.extxface.payments.impl;

                import com.ofss.digx.app.payment.dto.PaymentDTO;
                import com.ofss.digx.extxface.payments.impl.dto.TransferRequest;
                """;
        Set<String> folders = Set.of("com/ofss/digx/extxface/payments/impl/dto");

        assertThat(ChangeService.unresolvedImports(extension, path -> false, folders::contains))
                .containsExactly("com.ofss.digx.extxface.payments.impl.dto.TransferRequest");
    }

    @Test
    void aFileWithoutAPackageIsNotChecked() {
        assertThat(ChangeService.unresolvedImports("import com.bank.X;\nclass A {}", path -> false, folder -> true)).isEmpty();
    }

    @Test
    void findsFilesDirectlyInAFolder() {
        assertThat(ChangeService.inFolder("src/main/java/com/bank/x/A.java", "com/bank/x")).isTrue();
        assertThat(ChangeService.inFolder("com/bank/x/A.java", "com/bank/x")).isTrue();
        assertThat(ChangeService.inFolder("src/com/bank/x/sub/A.java", "com/bank/x")).isFalse();
        assertThat(ChangeService.inFolder("src/acom/bank/x/A.java", "com/bank/x")).isFalse();
    }

    @Test
    void certainCrossFileErrorsFailTheFileAndOthersStayWarnings() {
        String unknownReceiver = CrossFileJava.UNKNOWN_RECEIVERS + ": auditService. Declare them.";
        String missingMethod = CrossFileJava.MISSING_METHODS + " BeneficiaryValidationService does not have: validate().";
        String unknownClass = CrossFileJava.UNKNOWN_CLASSES + ": AuditRepository. They are not in the plan.";

        FileChecks.Result failed = ChangeService.withCrossChecks(FileChecks.Status.WARNING, "Line 40 (java-log-concat, warning): x",
                List.of(unknownReceiver, missingMethod, unknownClass));
        assertThat(failed.status()).isEqualTo(FileChecks.Status.FAILED);
        assertThat(failed.message()).contains("java-log-concat", unknownReceiver, missingMethod, unknownClass);
        // what may be wrong (a class of the codebase not found) stays a warning
        assertThat(ChangeService.withCrossChecks(FileChecks.Status.PASSED, null, List.of(unknownClass)).status())
                .isEqualTo(FileChecks.Status.WARNING);
        assertThat(ChangeService.withCrossChecks(FileChecks.Status.PASSED, null, List.of(CrossFileJava.MISSING_IMPORTS + ": List.")).status())
                .isEqualTo(FileChecks.Status.FAILED);
        // fixed: the file's own status again
        assertThat(ChangeService.withCrossChecks(FileChecks.Status.WARNING, failed.message(), List.of()))
                .isEqualTo(new FileChecks.Result(FileChecks.Status.WARNING, "Line 40 (java-log-concat, warning): x"));
        // the fix loop gets them as the findings to fix
        assertThat(ChangeService.crossFileFixes(failed.message())).contains(unknownReceiver, missingMethod).doesNotContain("java-log-concat");
    }

    @Test
    void aJdkClassWithoutItsImportIsNamedAsSuch() {
        // BRD4's service: ResourceBundle was reported as a class of its package that does not exist
        String service = """
                package com.bank.obdx.payments;

                import java.util.List;

                public class BeneficiaryValidationService {
                    private final ResourceBundle messages = ResourceBundle.getBundle("payments");
                    private final ExecutorService pool = Executors.newFixedThreadPool(10);
                    List<String> codes() { return List.of(messages.getString("DIGX_BV_001")); }
                }
                """;

        assertThat(CrossFileJava.missingJdkImports(service)).hasValueSatisfying(m -> assertThat(m).startsWith(CrossFileJava.MISSING_IMPORTS)
                .contains("ResourceBundle (java.util.ResourceBundle)", "ExecutorService (java.util.concurrent.ExecutorService)",
                        "Executors (java.util.concurrent.Executors)"));
        assertThat(CrossFileJava.unknownSamePackageClasses(service, path -> false)).isEmpty();
        // a class of its own package with the name: that one is used, no import needed
        assertThat(CrossFileJava.missingJdkImports(service, "com/bank/obdx/payments/ResourceBundle.java"::equals))
                .hasValueSatisfying(m -> assertThat(m).doesNotContain("ResourceBundle").contains("Executors"));
    }

    @Test
    void aNameAWildcardImportOrASupertypeMayBringIsNoMissingImport() {
        // OBDX's own Date from a wildcard import, java.sql's Date, and a nested type of a bank supertype
        assertThat(CrossFileJava.missingJdkImports("package com.bank.x;\nimport com.ofss.fc.datatype.*;\nclass A { Date d; List<String> l; }"))
                .isEmpty();
        assertThat(CrossFileJava.missingJdkImports("package com.bank.x;\nimport java.sql.*;\nclass A { Date d; }")).isEmpty();
        assertThat(CrossFileJava.missingJdkImports("package com.bank.x;\nimport java.sql.*;\nclass A { Date d; Optional<String> o; }"))
                .hasValueSatisfying(m -> assertThat(m).contains("Optional").doesNotContain("Date"));
        assertThat(CrossFileJava.missingJdkImports("package com.bank.x;\nimport com.bank.base.Handler;\nclass A extends Handler { Entry e; Map m; }"))
                .isEmpty();
    }

    @Test
    void aClassOfAnotherPackageWithTheChangesClassNameIsNotCheckedAgainstIt() {
        Map<String, String> classes = Map.of("Validator", "package com.bank.x;\npublic class Validator { public void check(Object o) { } }");

        // javax.validation.Validator has validate(); the change's own Validator does not
        assertThat(CrossFileJava.missingMethods("package com.bank.x;\nimport javax.validation.Validator;\n"
                + "class S { Validator validator; void run(Object dto) { validator.validate(dto); } }", classes)).isEmpty();
        assertThat(CrossFileJava.missingMethods("package com.bank.y;\n"
                + "class S { javax.validation.Validator validator; void run(Object dto) { validator.validate(dto); } }", classes)).isEmpty();
        // the change's own one, by package or import, is
        assertThat(CrossFileJava.missingMethods("package com.bank.x;\nclass S { Validator v; void run() { v.validate(1); } }", classes))
                .hasSize(1);
        assertThat(CrossFileJava.missingMethods("package com.bank.y;\nimport com.bank.x.Validator;\n"
                + "class S { Validator v; void run() { v.validate(1); } }", classes)).hasSize(1);
    }

    @Test
    void aNameInheritedByAnAnonymousOrNestedSubclassIsDeclared() {
        assertThat(CrossFileJava.unknownReceivers("""
                package com.bank.x;
                import com.bank.base.AbstractHandler;
                class A {
                    Object h = new AbstractHandler() { void handle() { context.get(); } };
                    static class B extends AbstractHandler { void handle() { context.get(); } }
                }
                """)).isEmpty();
        assertThat(CrossFileJava.unknownReceivers("package com.bank.x;\nclass A { Runnable r = new Runnable() { public void run() { context.get(); } }; }"))
                .hasValueSatisfying(m -> assertThat(m).contains("context"));
    }

    @Test
    void theCrossCheckReplacesItsEarlierFindings() {
        String earlier = "Imports classes that are neither in the codebase nor in this change: com.bank.A. Add them to the plan.";

        // a file written again: the old finding gives way to the new one, not added to it
        FileChecks.Result again = ChangeService.withCrossChecks(FileChecks.Status.WARNING, earlier,
                List.of("Imports classes that are neither in the codebase nor in this change: com.bank.B."));
        assertThat(again.status()).isEqualTo(FileChecks.Status.WARNING);
        assertThat(again.message()).isEqualTo("Imports classes that are neither in the codebase nor in this change: com.bank.B.");

        // nothing left: back to passed
        assertThat(ChangeService.withCrossChecks(FileChecks.Status.WARNING, earlier, List.of()))
                .isEqualTo(new FileChecks.Result(FileChecks.Status.PASSED, null));
        // the file's own warning stays
        assertThat(ChangeService.withCrossChecks(FileChecks.Status.WARNING, "Unbalanced '{' on line 3 (basic check)\n" + earlier, List.of()))
                .isEqualTo(new FileChecks.Result(FileChecks.Status.WARNING, "Unbalanced '{' on line 3 (basic check)"));
        // a failed file stays failed
        assertThat(ChangeService.withCrossChecks(FileChecks.Status.FAILED, "Does not compile", List.of("The view binds names its view model does not define: x.")))
                .isEqualTo(new FileChecks.Result(FileChecks.Status.FAILED, "Does not compile\nThe view binds names its view model does not define: x."));
    }
}
