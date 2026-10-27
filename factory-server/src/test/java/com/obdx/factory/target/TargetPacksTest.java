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
        assertThat(packs.all()).extracting(TargetPack::id).containsExactly("jet", "react-native", "react");
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
