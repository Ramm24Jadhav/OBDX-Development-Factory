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
        List<String[]> vue = TechnologyCatalogue.stack("{\"vue\": \"^3.5.22\", \"@vitejs/plugin-vue\": \"^6.0.1\", \"vite\": \"^8.3.5\"}");
        assertThat(vue).extracting(s -> s[0] + " " + s[1]).containsExactly("Vue 3.5.22", "Vite 8.3.5");
        List<String[]> capacitor = TechnologyCatalogue.stack("{\"react\": \"19.3.0\", \"@capacitor/core\": \"^7.4.3\", \"vite\": \"^8.3.5\"}");
        assertThat(TechnologyCatalogue.build(capacitor)).isEqualTo("Vite and Capacitor (Gradle and Xcode)");
        List<String[]> nativeApps = TechnologyCatalogue.nativeStack("id(\"org.jetbrains.kotlin.android\") version \"2.2.20\" apply false",
                "// swift-tools-version: 6.0\n");
        assertThat(nativeApps).extracting(s -> s[0] + " " + s[1]).containsExactly("Kotlin 2.2.20", "Jetpack Compose Material 3", "Swift 6.0", "SwiftUI iOS 17");
        assertThat(TechnologyCatalogue.build(nativeApps)).isEqualTo("Gradle and Xcode");
    }
}
