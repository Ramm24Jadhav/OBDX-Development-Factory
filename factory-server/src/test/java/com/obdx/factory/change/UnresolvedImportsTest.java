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
            import com.bank.obdx.common.*;
            import javax.ws.rs.core.Response;
            import static com.bank.obdx.payments.Limits.MAX;

            public class PayeeResource {
            }
            """;

    @Test
    void reportsTheBanksOwnClassesThatNobodyWrites() {
        Set<String> existing = Set.of("com/bank/obdx/payments/service/PayeeService.java");

        List<String> missing = ChangeService.unresolvedImports(RESOURCE, existing::contains);

        assertThat(missing).containsExactly("com.bank.obdx.payments.dto.BeneficiaryDTO");
    }

    @Test
    void aFileWithoutAPackageIsNotChecked() {
        assertThat(ChangeService.unresolvedImports("import com.bank.X;\nclass A {}", path -> false)).isEmpty();
    }
}
