package com.obdx.factory.change;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

/** Mistakes in generated Java that do not compile, found without a compiler. */
class CompileErrorChecksTest {

    /** The service shape QA saw: a nested callable that implements Callable. */
    private static final String SERVICE = """
            package com.bank.accounts;

            import java.util.concurrent.Callable;

            public class AccountLookupService {
                public String lookup(String accountId) {
                    return new HostLookupCallable(accountId).call();
                }

                private static final class HostLookupCallable implements Callable<String> {
                    private final String id;

                    HostLookupCallable(String id) {
                        this.id = id;
                    }

                    @Override
                    public String call() {
                        return id;
                    }
                }
            }
            """;

    @Test
    void aNestedClassThatImplementsAnInterfaceDoesNotTurnOffTheMethodCheck() {
        String resource = """
                package com.bank.accounts;

                public class AccountResource {
                    private final AccountLookupService service = new AccountLookupService();

                    public String read(String id) {
                        service.lookup(id);
                        return service.validate(id);
                    }
                }
                """;

        List<String> problems = CrossFileJava.missingMethods(resource, Map.of("AccountLookupService", SERVICE));

        assertThat(problems).singleElement().asString().contains("AccountLookupService does not have: validate()");
        // the nested class's call() is not a method of the service
        assertThat(CrossFileJava.missingMethods(resource.replace("service.validate(id)", "service.call()"),
                Map.of("AccountLookupService", SERVICE))).singleElement().asString().contains("call()");
        // the service itself implementing an interface still turns it off (inherited default methods)
        assertThat(CrossFileJava.missingMethods(resource, Map.of("AccountLookupService",
                SERVICE.replace("public class AccountLookupService {", "public class AccountLookupService implements Lookup {")))).isEmpty();
    }

    @Test
    void aCallOnANameNothingDeclaresIsReported() {
        String service = """
                package com.bank.beneficiary;

                import java.util.List;

                public class BeneficiaryService {
                    private final BeneficiaryRepository repository = new BeneficiaryRepository();

                    public void validate(String name, List<String> rules) {
                        validationService.validateFormat(name);
                        repository.save(name);
                        rules.forEach(rule -> rule.trim());
                        for (String rule : rules) {
                            rule.isBlank();
                        }
                        try {
                            name.length();
                        } catch (IllegalStateException e) {
                            e.printStackTrace();
                        }
                        Object o = name;
                        if (o instanceof String text) {
                            text.strip();
                        }
                    }
                }
                """;

        assertThat(CrossFileJava.unknownReceivers(service)).hasValueSatisfying(problem ->
                assertThat(problem).startsWith(CrossFileJava.UNKNOWN_RECEIVERS + ": validationService.").doesNotContain("repository"));
        // a class that extends another may inherit the field; Lombok makes the logger
        assertThat(CrossFileJava.unknownReceivers(service.replace("public class BeneficiaryService {",
                "public class BeneficiaryService extends BaseService {"))).isEmpty();
        assertThat(CrossFileJava.unknownReceivers("package x;\n@lombok.extern.slf4j.Slf4j\nclass A { void a() { log.info(\"x\"); } }")).isEmpty();
        assertThat(CrossFileJava.unknownReceivers("package x;\nimport static java.lang.System.out;\nclass A { void a() { out.println(); } }"))
                .isEmpty();
    }

    @Test
    void commonJdkClassesNeedTheirImports() {
        String service = """
                package com.bank.limits;

                import java.util.List;

                public class LimitService {
                    public Map<String, Integer> totals(List<String> names) {
                        Map<String, Integer> totals = new HashMap<>();
                        return names.stream().collect(Collectors.toMap(n -> n, n -> 1));
                    }
                }
                """;

        assertThat(CrossFileJava.missingJdkImports(service)).hasValue(CrossFileJava.MISSING_IMPORTS
                + ": Collectors (java.util.stream.Collectors), HashMap (java.util.HashMap), Map (java.util.Map). Add the imports.");
        assertThat(CrossFileJava.missingJdkImports(service.replace("import java.util.List;", "import java.util.*;\nimport java.util.stream.Collectors;")))
                .isEmpty();
        // a class of its own named like one is no JDK class
        assertThat(CrossFileJava.missingJdkImports("package x;\nclass A { Optional o; }\nclass Optional { }")).isEmpty();
    }

    @Test
    void aClassOfThePackageThatIsNowhereIsReported() {
        String service = """
                package com.bank.beneficiary;

                import com.bank.common.AuditTrail;

                public class BeneficiaryService {
                    private final AuditRepository audit = new AuditRepository();
                    private final BeneficiaryRepository repository = BeneficiaryRepository.create();
                    private final AuditTrail trail = null;

                    public String validate(String name) {
                        if (name == null) {
                            throw new IllegalArgumentException(Messages.EMPTY_NAME);
                        }
                        return Status.ACTIVE.name() + MAX_LENGTH;
                    }

                    enum Status { ACTIVE }

                    static final int MAX_LENGTH = 35;
                }
                """;
        Set<String> known = Set.of("com/bank/beneficiary/BeneficiaryRepository.java", "com/bank/beneficiary/Messages.java");

        assertThat(CrossFileJava.unknownSamePackageClasses(service, known::contains))
                .hasValueSatisfying(problem -> assertThat(problem).startsWith(CrossFileJava.UNKNOWN_CLASSES + ": AuditRepository."));
        assertThat(CrossFileJava.unknownSamePackageClasses(service, path -> true)).isEmpty();
        // a JDK interface brings no nested types; the bank's own may (ModelGateway.ChatResult)
        assertThat(CrossFileJava.unknownSamePackageClasses(service.replace("public class BeneficiaryService {",
                "public class BeneficiaryService implements java.io.Serializable {"), known::contains)).isPresent();
        assertThat(CrossFileJava.unknownSamePackageClasses(service.replace("public class BeneficiaryService {",
                "public class BeneficiaryService implements BeneficiaryApi {"), known::contains)).isEmpty();
        // qualified names and method references are no classes of the package
        assertThat(CrossFileJava.unknownSamePackageClasses("package com.bank.x;\nclass A { java.util.List<String> a; "
                + "java.util.Map<String, String> map; Object f() { return map::get; } }", path -> false)).isEmpty();
        // a wildcard import could bring it
        assertThat(CrossFileJava.unknownSamePackageClasses(service.replace("import com.bank.common.AuditTrail;", "import com.bank.common.*;"),
                known::contains)).isEmpty();
    }

    @Test
    void theNewFindingsGoToTheModelWhenTheFileIsWrittenAgain() {
        String message = "Line 3 (java-x, warning)\n" + CrossFileJava.UNKNOWN_RECEIVERS + ": validationService. Declare them.\n"
                + CrossFileJava.MISSING_IMPORTS + ": HashMap (java.util.HashMap). Add the imports.\n"
                + CrossFileJava.UNKNOWN_CLASSES + ": AuditRepository. They are not ...";

        assertThat(ChangeService.crossFileFixes(message)).contains("validationService", "HashMap", "AuditRepository")
                .doesNotContain("java-x");
    }
}
