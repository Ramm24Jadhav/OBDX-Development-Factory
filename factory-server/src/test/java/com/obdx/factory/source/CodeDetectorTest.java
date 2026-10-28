package com.obdx.factory.source;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class CodeDetectorTest {

    @Test
    void readsTheObdxReleaseAndBankFromTheBuild() {
        Map<String, String> files = Map.of("pom.xml", """
                <project>
                  <groupId>com.hdfc.obdx</groupId>
                  <dependencies>
                    <dependency>
                      <groupId>com.ofss.digx.app</groupId>
                      <artifactId>com.ofss.digx.app.core</artifactId>
                      <version>25.1.0.0.0</version>
                    </dependency>
                  </dependencies>
                  <properties><maven.compiler.source>1.8</maven.compiler.source></properties>
                </project>
                """);
        CodeDetector.Suggestion suggestion = CodeDetector.detect(List.of("pom.xml", "src/main/java/com/hdfc/obdx/Transfer.java"),
                files::get, List.of("trunk", "obdx-custom"));

        // The OBDX release outweighs the Java level
        assertThat(suggestion.obdxVersion()).isEqualTo("25.x");
        assertThat(suggestion.bankName()).isEqualTo("HDFC");
        assertThat(suggestion.name()).isEqualTo("hdfc-25");
        assertThat(suggestion.reasons()).anyMatch(r -> r.contains("OBDX release 25.1"));
    }

    @Test
    void trustsAboutJsonOverEverythingElse() {
        Map<String, String> files = Map.of(
                "channel/framework/json/about.json", "{\"productName\": \"OBDX\", \"version\": \"22.2.0.0.0\"}",
                "pom.xml", "<project><properties><java.version>11</java.version></properties></project>");
        CodeDetector.Suggestion suggestion = CodeDetector.detect(List.of("pom.xml", "channel/framework/json/about.json"), files::get,
                List.of("trunk", "bank-c-25"));

        assertThat(suggestion.obdxVersion()).isEqualTo("22.x");
        assertThat(suggestion.reasons().getFirst()).isEqualTo("OBDX 22.x: channel/framework/json/about.json says release 22.2");
    }

    @Test
    void usesJetJavaAndTheRepositoryName() {
        Map<String, String> files = Map.of(
                "ui/package.json", "{\"dependencies\": {\"@oracle/oraclejet\": \"~13.1.0\"}}",
                "backend/pom.xml", "<project><properties><java.version>1.8</java.version></properties></project>");
        CodeDetector.Suggestion suggestion = CodeDetector.detect(List.of("ui/package.json", "backend/pom.xml"), files::get,
                List.of("trunk", "bank-a-22"));

        assertThat(suggestion.obdxVersion()).isEqualTo("22.x");
        assertThat(suggestion.bankName()).isEqualTo("Bank A");
        assertThat(suggestion.name()).isEqualTo("bank-a-22");
        assertThat(suggestion.reasons()).hasSize(4);
    }

    @Test
    void findsTheBankInJavaPackagesWhenNamesAreGeneric() {
        List<String> paths = List.of("src/main/java/com/emiratesnbd/obdx/A.java", "src/main/java/com/emiratesnbd/obdx/B.java",
                "src/main/java/com/ofss/digx/C.java");
        CodeDetector.Suggestion suggestion = CodeDetector.detect(paths, p -> null, List.of("trunk", "code"));

        assertThat(suggestion.bankName()).isEqualTo("Emiratesnbd");
        assertThat(suggestion.obdxVersion()).isNull();
    }

    @Test
    void suggestsNothingWithoutEvidence() {
        CodeDetector.Suggestion suggestion = CodeDetector.detect(List.of("README.md"), p -> null, List.of("trunk"));

        assertThat(suggestion.bankName()).isNull();
        assertThat(suggestion.obdxVersion()).isNull();
        assertThat(suggestion.name()).isNull();
        assertThat(suggestion.reasons()).isEmpty();
    }
}
