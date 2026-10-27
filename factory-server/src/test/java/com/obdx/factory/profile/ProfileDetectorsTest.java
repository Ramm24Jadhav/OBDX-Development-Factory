package com.obdx.factory.profile;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Runs all detectors over a small codebase laid out like a bank's OBDX customization repository.
 */
class ProfileDetectorsTest {

    @TempDir
    Path root;

    private Map<String, ProfileFact> facts;

    @BeforeEach
    void detect() throws IOException {
        write("backend/pom.xml", """
                <project>
                  <groupId>com.bank.obdx</groupId>
                  <artifactId>bank-obdx-ext</artifactId>
                  <packaging>war</packaging>
                  <properties>
                    <maven.compiler.source>1.8</maven.compiler.source>
                    <maven.compiler.target>1.8</maven.compiler.target>
                  </properties>
                  <dependencies>
                    <dependency>
                      <groupId>com.ofss.digx</groupId>
                      <artifactId>digx-framework</artifactId>
                      <version>22.2.0</version>
                    </dependency>
                  </dependencies>
                </project>
                """);
        write("backend/src/main/webapp/WEB-INF/weblogic.xml", "<weblogic-web-app/>");
        write("backend/src/main/resources/digx-ext.properties", """
                datasource.url=jdbc:oracle:thin:@db.bank.local:1521/OBDX
                host.system=FCUBS
                error.limit=DIGX_PY_0101
                """);
        write("backend/src/main/java/com/bank/obdx/payments/FundTransferResource.java", """
                package com.bank.obdx.payments;

                import javax.ws.rs.POST;
                import javax.ws.rs.Path;
                import org.slf4j.Logger;

                @Path("/payments/transfers")
                public class FundTransferResource {
                    @POST
                    public void transfer() {
                        throw new LimitExceededException("DIGX_PY_0101");
                    }
                }
                """);
        write("backend/src/main/java/com/bank/obdx/payments/LimitExceededException.java", """
                package com.bank.obdx.payments;

                public class LimitExceededException extends BankBusinessException {
                    public LimitExceededException(String code) {
                        super(code);
                    }
                }
                """);
        write("backend/src/main/java/com/bank/obdx/payments/HostTransferAdapter.java", """
                package com.bank.obdx.payments;

                import javax.inject.Inject;

                public class HostTransferAdapter {
                    @Inject
                    private FcubsClient client;
                }
                """);
        write("ui/package.json", """
                {"name": "bank-ui", "dependencies": {"@oracle/oraclejet": "~13.1.0", "moment": "2.29.4"}}
                """);
        write("ui/extensions/js/viewModels/fund-transfer.js", """
                define(['knockout'], function (ko) {
                  function FundTransferViewModel() {
                    this.amount = ko.observable();
                  }
                  return FundTransferViewModel;
                });
                """);
        write("ui/extensions/js/views/fund-transfer.html", "<div></div>");
        write("ui/extensions/js/resources/nls/fund-transfer.js", "define({ root: { amount: 'Amount' }, fr: true });");
        write("ui/extensions/js/resources/nls/fr/fund-transfer.js", "define({ amount: 'Montant' });");
        write("ui/extensions/components/bank-amount/component.json", "{\"name\": \"bank-amount\", \"jetVersion\": \"^13.0.0\"}");
        write("ui/extensions/css/bank-redwood-overrides.scss", ".bank { color: red; }");
        write("db/patches/DIGX_PY_LIMITS.sql", """
                CREATE TABLE DIGX_PY_LIMIT_CONFIG (LIMIT_ID VARCHAR2(40), AMOUNT NUMBER(18,2));
                INSERT INTO DIGX_PY_LIMIT_CONFIG VALUES ('RETAIL_DAILY', 500000);
                INSERT INTO CZ_AUDIT_LOG VALUES (SYSDATE);
                """);

        SourceTree tree = SourceTree.scan(root, List.of(".svn", "node_modules"), 512 * 1024);
        List<ProfileFact> all = new ArrayList<>();
        for (ProfileDetector detector : List.of(new ObdxDetector(), new BackendDetector(), new UiDetector(),
                new DataDetector(), new IntegrationDetector(), new ConventionsDetector())) {
            all.addAll(detector.detect(tree));
        }
        facts = all.stream().collect(Collectors.toMap(ProfileFact::key, Function.identity()));
    }

    @Test
    void detectsObdxRelease() {
        assertThat(value("obdx.version")).isEqualTo("22.2.0");
        assertThat(facts.get("obdx.version").confidence()).isEqualTo(ProfileFact.Confidence.MEDIUM);
        assertThat(facts.get("obdx.version").evidence()).containsExactly("backend/pom.xml");
        assertThat(value("obdx.productCode")).startsWith("No (only bank code; 3 Java files");
    }

    @Test
    void detectsBackend() {
        assertThat(value("backend.buildTool")).contains("Maven", "npm");
        assertThat(value("backend.javaVersion")).isEqualTo("Java 8");
        assertThat(value("backend.frameworks")).contains("JAX-RS (1 file)", "CDI / @Inject (1 file)");
        assertThat(value("backend.eeNamespace")).isEqualTo("javax");
        assertThat(value("backend.packaging")).contains("WAR");
        assertThat(value("backend.appServer")).startsWith("Oracle WebLogic");
        assertThat(value("backend.logging")).startsWith("SLF4J");
        assertThat(value("backend.restEndpoints")).contains("/payments/transfers");
    }

    @Test
    void detectsUi() {
        assertThat(value("ui.jetVersion")).isEqualTo("JET 13.1.0");
        assertThat(facts.get("ui.jetVersion").confidence()).isEqualTo(ProfileFact.Confidence.HIGH);
        assertThat(value("ui.architecture")).startsWith("Knockout MVVM");
        assertThat(value("ui.moduleSystem")).startsWith("RequireJS (AMD define)");
        assertThat(value("ui.screenStructure"))
                .contains("1 views and 1 view models, mostly in ui/extensions/js/views/")
                .contains("1 JET composite components (component.json), for example bank-amount");
        assertThat(value("ui.resourceBundles")).contains("mostly in ui/extensions/js/resources/nls/", "translations: fr");
        assertThat(value("ui.styling")).contains("SCSS", "theme: Redwood");
        assertThat(value("ui.libraries")).isEqualTo("moment");
    }

    @Test
    void detectsDataAndIntegration() {
        assertThat(value("data.databaseType")).isEqualTo("Oracle Database (from JDBC URLs)");
        assertThat(value("data.tableNaming")).startsWith("DIGX_* (2 statements), CZ_* (1 statement)");
        assertThat(value("data.scriptFolders")).isEqualTo("db/patches/ (1 script)");
        assertThat(value("integration.hostSystems")).startsWith("Oracle FLEXCUBE Universal Banking");
        assertThat(value("integration.adapters")).isEqualTo("1 adapter class: HostTransferAdapter");
    }

    @Test
    void detectsConventions() {
        assertThat(value("conventions.packageRoots")).isEqualTo("com.bank.obdx (3 files)");
        assertThat(value("conventions.customizationFolders")).startsWith("ui/extensions/");
        assertThat(value("conventions.classNaming")).contains("*Resource (1 class)", "*Adapter (1 class)", "*Exception (1 class)");
        assertThat(value("conventions.errorCodes")).isEqualTo("1 code: DIGX_PY_0101 (format DIGX_<module>_<number>)");
        assertThat(value("conventions.exceptionBase")).isEqualTo("BankBusinessException (1 subclass)");
        assertThat(value("conventions.indentation")).isEqualTo("Java: 4 spaces; JavaScript: 2 spaces");
    }

    @Test
    void reportsEveryFactEvenWhenNothingIsFound() throws IOException {
        Path empty = root.resolve("empty");
        Files.createDirectories(empty);
        SourceTree tree = SourceTree.scan(empty, List.of(), 1024);

        List<ProfileFact> found = new ArrayList<>();
        for (ProfileDetector detector : List.of(new ObdxDetector(), new BackendDetector(), new UiDetector(),
                new DataDetector(), new IntegrationDetector(), new ConventionsDetector())) {
            found.addAll(detector.detect(tree));
        }

        assertThat(found).extracting(ProfileFact::key).containsExactlyInAnyOrderElementsOf(facts.keySet());
        assertThat(found).allSatisfy(fact -> {
            assertThat(fact.value()).isNull();
            assertThat(fact.confidence()).isEqualTo(ProfileFact.Confidence.NONE);
        });
    }

    @Test
    void normalizesJavaVersions() {
        assertThat(BackendDetector.normalizeJavaVersion("1.8")).isEqualTo("8");
        assertThat(BackendDetector.normalizeJavaVersion("1.8.0_281")).isEqualTo("8");
        assertThat(BackendDetector.normalizeJavaVersion("17")).isEqualTo("17");
        assertThat(BackendDetector.normalizeJavaVersion("21.0.2")).isEqualTo("21");
    }

    private String value(String key) {
        assertThat(facts).containsKey(key);
        return facts.get(key).value();
    }

    private void write(String path, String content) throws IOException {
        Path file = root.resolve(path);
        Files.createDirectories(file.getParent());
        Files.writeString(file, content);
    }
}
