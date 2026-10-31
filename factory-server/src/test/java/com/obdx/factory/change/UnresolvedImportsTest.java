package com.obdx.factory.change;

import org.junit.jupiter.api.Test;

import java.util.List;
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
