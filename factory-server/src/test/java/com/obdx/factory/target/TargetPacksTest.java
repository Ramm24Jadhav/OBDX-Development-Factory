package com.obdx.factory.target;

import com.obdx.factory.change.FileChecks;
import com.obdx.factory.pack.CheckScope;
import com.obdx.factory.pack.LocalChecks;
import com.obdx.factory.pack.PackProperties;
import com.obdx.factory.pack.VersionPacks;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class TargetPacksTest {

    @Test
    void builtInPacksLoadWithStarterProjects() {
        TargetPacks packs = TargetPacks.builtIn();
        assertThat(packs.all()).extracting(TargetPack::id).containsExactly("jet", "react-native", "react", "angular", "flutter", "jet-core-pack", "vue",
                "capacitor", "native");
        TargetPack nativePack = packs.find("native").orElseThrow();
        assertThat(nativePack.isNative()).isTrue();
        assertThat(nativePack.structure()).containsKeys("screen", "test", "screenIos", "testIos", "apiIos", "navigationIos");
        assertThat(nativePack.templates()).containsKeys("screen", "test", "screenIos", "testIos");
        assertThat(nativePack.starter()).containsKeys("Package.swift", "android/app/build.gradle.kts", "android/app/src/main/java/com/bank/obdx/api/ApiClient.kt",
                "android/app/src/main/java/com/bank/obdx/components/Fields.kt", "ios/Sources/ObdxApp/Components/Fields.swift",
                "ios/Sources/ObdxApp/Api/ApiClient.swift", "shared/i18n/en.json");
        assertThat(nativePack.rules()).extracting(r -> r.id()).contains("native-no-webview", "native-no-secrets-on-device", "native-no-cleartext");
        assertThat(nativePack.recipeFor("mobile-native/ios/Sources/ObdxApp/Screens/payments/FundTransferView.swift", "create", "ui"))
                .hasValueSatisfying(m -> assertThat(m.part().id()).isEqualTo("screen-ios"));
        TargetPack vue = packs.find("vue").orElseThrow();
        assertThat(vue.isVue()).isTrue();
        assertThat(vue.structure().get("screen")).isEqualTo("src/screens/{module}/{Screen}Page.vue");
        assertThat(vue.starter()).containsKeys("package.json", "vite.config.ts", "src/main.ts", "src/api/client.ts", "src/forms/useForm.ts",
                "src/components/TextField.vue", "src/components/index.ts", "src/i18n/en.json", "src/router/index.ts");
        assertThat(vue.rules()).extracting(r -> r.id()).contains("vue-no-v-html", "app-api-through-client", "app-no-secrets-in-storage");
        TargetPack capacitor = packs.find("capacitor").orElseThrow();
        assertThat(capacitor.syntax()).isEqualTo("jsx");
        assertThat(capacitor.starter()).containsKeys("capacitor.config.ts", "src/native/device.ts", "src/components/fields.tsx", "vite.config.ts");
        assertThat(capacitor.rules()).extracting(r -> r.id()).contains("capacitor-no-live-server", "capacitor-no-secrets-on-device", "react-no-react-native");
        assertThat(packs.find("flutter").orElseThrow().isDart()).isTrue();
        assertThat(packs.find("flutter").orElseThrow().starter()).containsKeys("pubspec.yaml", "lib/api/client.dart", "lib/components/tokens.dart", "assets/i18n/en.json");
        assertThat(packs.jet().isJet()).isTrue();

        TargetPack native_ = packs.find("react-native").orElseThrow();
        assertThat(native_.defaultAppFolder()).isEqualTo("mobile");
        assertThat(native_.components().get("account").component()).isEqualTo("AccountField");
        assertThat(native_.components().get("checkbox").value()).isEqualTo("list");
        assertThat(native_.templates().get("screen")).contains("{{Screen}}Screen");
        assertThat(native_.starter()).containsKeys("package.json", "App.tsx", "src/components/TextField.tsx", "src/forms/useForm.ts",
                "src/api/client.ts", "src/i18n/en.json");
        assertThat(native_.rules()).extracting(r -> r.id()).contains("rn-no-html", "app-api-through-client");
        assertThat(native_.recipes()).extracting(r -> r.id()).containsExactly("app-screen", "app-api", "app-texts");
        assertThat(native_.recipeFor("mobile/src/screens/payments/FundTransferScreen.tsx", "create", "ui"))
                .hasValueSatisfying(m -> assertThat(m.part().id()).isEqualTo("screen"));

        TargetPack react = packs.find("react").orElseThrow();
        assertThat(react.structure().get("screen")).isEqualTo("src/screens/{module}/{Screen}Page.tsx");
        assertThat(react.starter()).containsKeys("vite.config.ts", "src/components/fields.tsx").doesNotContainKey("App.tsx");
        assertThat(react.rules()).extracting(r -> r.id()).contains("react-no-react-native").doesNotContain("rn-no-html");
        assertThat(react.syntax()).isEqualTo("jsx");

        TargetPack angular = packs.find("angular").orElseThrow();
        assertThat(angular.isAngular()).isTrue();
        assertThat(angular.structure().get("screen")).isEqualTo("src/app/screens/{module}/{Screen}Page.ts");
        assertThat(angular.components().get("amount")).satisfies(m -> {
            assertThat(m.tag()).isEqualTo("bx-amount");
            assertThat(m.value()).isEqualTo("number");
        });
        // The starter carries the premium Angular components (a copy of the pack) and its own parts
        assertThat(angular.starter()).containsKeys("angular.json", "src/main.ts", "src/app/api/client.ts", "src/app/forms/form.ts",
                "src/app/components/text-field.ts", "src/app/components/bx.css", "src/app/components/layout.ts");
        assertThat(angular.rules()).extracting(r -> r.id()).contains("angular-no-react", "angular-no-inner-html", "app-no-jet");
    }

    @Test
    void theAngularStarterCarriesThePremiumComponentsUnchanged() throws Exception {
        // The starter's components are a copy of target-packs/components/angular/src, so generated apps use the pack
        java.nio.file.Path pack = java.nio.file.Path.of("..", "target-packs", "components", "angular", "src");
        TargetPack angular = TargetPacks.builtIn().find("angular").orElseThrow();
        try (var files = java.nio.file.Files.list(pack)) {
            for (java.nio.file.Path file : files.filter(f -> !f.getFileName().toString().equals("index.ts")).toList()) {
                String name = file.getFileName().toString();
                assertThat(angular.starter().get("src/app/components/" + name)).as(name)
                        .isEqualToNormalizingNewlines(java.nio.file.Files.readString(file));
            }
        }
    }

    @Test
    void theCapacitorStarterCarriesTheReactComponentsUnchanged() {
        // Capacitor wraps the React web screens, so a screen generated for React works in the app unchanged
        TargetPacks packs = TargetPacks.builtIn();
        TargetPack react = packs.find("react").orElseThrow();
        TargetPack capacitor = packs.find("capacitor").orElseThrow();
        react.starter().keySet().stream().filter(p -> p.startsWith("src/components/") || p.startsWith("src/forms/") || p.startsWith("src/i18n/"))
                .forEach(p -> assertThat(capacitor.starter().get(p)).as(p).isEqualToNormalizingNewlines(react.starter().get(p)));
        assertThat(capacitor.templates()).isEqualTo(react.templates());
    }

    @Test
    void filesOfTheAppFollowTheTargetPackAndOtherCodeTheVersionPack() {
        LocalChecks checks = new LocalChecks(VersionPacks.builtIn(), TargetPacks.builtIn());
        CheckScope scope = new CheckScope("22.x", Map.of(), Set.of(), "react-native", "/mobile/");
        assertThat(scope.appFolder()).isEqualTo("mobile");
        assertThat(checks.rulesFor(scope, "mobile/src/screens/x/AScreen.tsx")).extracting(r -> r.id())
                .contains("rn-no-html", "app-texts-from-i18n").doesNotContain("js-no-console", "html-labels-from-bundle");
        assertThat(checks.rulesFor(scope, "ui/js/viewModels/a.js")).extracting(r -> r.id()).contains("js-no-console").doesNotContain("rn-no-html");
        assertThat(checks.recipeFor(scope, "mobile/src/api/paymentsApi.ts", "create", "ui")).hasValueSatisfying(m ->
                assertThat(m.recipe().id()).isEqualTo("app-api"));
        assertThat(checks.recipeFor(scope, "ui/js/viewModels/a.js", "modify", "ui")).hasValueSatisfying(m ->
                assertThat(m.recipe().id()).isEqualTo("ui-enhance-screen"));
        assertThat(checks.targetGuidance(scope, "mobile/App.tsx")).contains("React Native app (Expo, TypeScript)");
        assertThat(checks.targetGuidance(scope, "ui/js/a.js")).isEmpty();

        FileChecks.Result html = checks.check(scope, "mobile/src/screens/x/AScreen.tsx", null, "export const A = () => <div>Hi</div>;\n");
        assertThat(html.status()).isEqualTo(FileChecks.Status.FAILED);
        assertThat(html.message()).contains("(rn-no-html, error)");
        // A jet workspace has no app folder: the same path is ordinary OBDX code.
        assertThat(new CheckScope("22.x", Map.of(), Set.of(), "jet", "mobile").inApp("mobile/App.tsx")).isFalse();
    }

    @Test
    void teamsOverrideAPackWithoutRebuilding(@TempDir Path dir) throws Exception {
        Path team = Files.createDirectories(dir.resolve("targets/react-native/starter/src/components"));
        Files.writeString(dir.resolve("targets/react-native/target.yml"), """
                id: react-native
                guidance: Use the bank's design system components from @bank/mobile-ui.
                components:
                  date: {component: BankDatePicker, value: string}
                rules:
                  - id: rn-no-html
                    enabled: false
                  - id: bank-no-alert
                    title: No Alert.alert
                    severity: warning
                    files: ["**/*.tsx"]
                    forbid: 'Alert\\.alert'
                    message: Use the bank's message banner.
                """);
        Files.writeString(team.resolve("theme.ts"), "export const theme = { colors: { primary: '#003366' } };\n");
        TargetPack pack = new TargetPacks(new PackProperties(dir.toString())).find("react-native").orElseThrow();

        assertThat(pack.guidance()).startsWith("Use the bank's design system");
        assertThat(pack.components().get("date").component()).isEqualTo("BankDatePicker");
        assertThat(pack.components().get("text").component()).isEqualTo("TextField");
        assertThat(pack.rules()).extracting(r -> r.id()).contains("bank-no-alert").doesNotContain("rn-no-html");
        assertThat(pack.starter().get("src/components/theme.ts")).contains("#003366");
        assertThat(pack.starter()).containsKey("src/components/TextField.tsx");

        Files.writeString(dir.resolve("targets/react-native/target.yml"), "id: react-native\ncomponents:\n  date: {value: string}\n");
        assertThatThrownBy(() -> new TargetPacks(new PackProperties(dir.toString()))).hasMessageContaining("component mapping for date needs a 'component'");
    }
}
