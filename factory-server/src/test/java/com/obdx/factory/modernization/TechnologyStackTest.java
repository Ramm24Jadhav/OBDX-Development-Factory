package com.obdx.factory.modernization;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class TechnologyStackTest {

    @Test
    void readsTheStarterLibrariesAndHowItIsBuilt() {
        List<String[]> stack = TechnologyCatalogue.stack("{ \"dependencies\": { \"react\": \"19.3.0\" }, \"devDependencies\": { \"typescript\": \"~5.9.3\", \"vite\": \"^8.3.5\" } }");
        assertThat(stack).extracting(s -> s[0] + " " + s[1]).containsExactly("React 19.3.0", "TypeScript 5.9.3", "Vite 8.3.5");
        assertThat(TechnologyCatalogue.build(stack)).isEqualTo("Vite");
        assertThat(TechnologyCatalogue.build(TechnologyCatalogue.stack("{\"@angular/core\": \"^22.2.0\"}"))).isEqualTo("Angular CLI");
        assertThat(TechnologyCatalogue.stack(null)).isEmpty();
        List<String[]> jet = TechnologyCatalogue.stack("{\"@oracle/oraclejet\": \"~21.0.3\", \"@oracle/oraclejet-core-pack\": \"~21.0.3\", \"typescript\": \"5.8.3\"}");
        assertThat(jet).extracting(s -> s[0] + " " + s[1]).containsExactly("Oracle JET 21.0.3", "Core Pack 21.0.3", "TypeScript 5.8.3");
        assertThat(TechnologyCatalogue.build(jet)).isEqualTo("ojet build");
        List<String[]> flutter = TechnologyCatalogue.pubspec("environment:\n  sdk: ^3.9.0\ndependencies:\n  http: ^1.4.0\n");
        assertThat(flutter).extracting(s -> s[0] + " " + s[1]).containsExactly("Flutter stable", "Dart 3.9.0", "http 1.4.0");
        assertThat(TechnologyCatalogue.build(flutter)).isEqualTo("Flutter (Gradle and Xcode)");
    }
}
