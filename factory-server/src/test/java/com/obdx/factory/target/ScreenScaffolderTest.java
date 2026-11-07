package com.obdx.factory.target;

import com.obdx.factory.design.ScreenModel;
import org.junit.jupiter.api.Test;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class ScreenScaffolderTest {

    static final ScreenModel TRANSFER = new ScreenModel("Fund Transfer", "Transfer money", "Send money to a payee", "new",
            List.of(new ScreenModel.Section("details", "Transfer details", 2, List.of(
                            new ScreenModel.Component("fromAccount", "account", "fromAccount", "From account", true, null, null, null, null,
                                    List.of(), null, null),
                            new ScreenModel.Component("amount", "amount", "amount", "Amount", true, "In the account's currency", "0.00", null, null,
                                    null, List.of("greater than 0"), null),
                            new ScreenModel.Component("date", "date", "transferDate", "Transfer date", false, null, null, null, null, null, null, null),
                            new ScreenModel.Component("purpose", "select", "purpose", "Purpose", true, null, null, null, null,
                                    List.of("Family support", "Rent", "Other's \"bill\""), null, null))),
                    new ScreenModel.Section("more", null, 1, List.of(
                            new ScreenModel.Component("remarks", "textarea", "remarks", "Remarks", false, null, null, 35, null, null, null, null),
                            new ScreenModel.Component("speed", "radio", "speed", "Speed", false, null, null, null, "Normal", List.of("Normal", "Express"),
                                    null, null),
                            new ScreenModel.Component("alerts", "checkbox", "alerts", "Alerts", false, null, null, null, "SMS",
                                    List.of("SMS", "Email"), null, null),
                            new ScreenModel.Component("save", "switch", "savePayee", "Save payee", true, null, null, null, "true", null, null, null),
                            new ScreenModel.Component("fee", "display", "fee", "Fee", false, null, null, null, "0.00", null, null, null),
                            new ScreenModel.Component("count", "number", "count", "Count", false, null, null, null, null, null, null, true),
                            new ScreenModel.Component("ref", "text", "reference", "Reference", true, null, null, 16, "ABC", null, null, null)))),
            List.of(new ScreenModel.ActionButton("submit", "Transfer", "primary"),
                    new ScreenModel.ActionButton("cancel", "Cancel", "secondary"),
                    new ScreenModel.ActionButton("help", "Help", "link")));

    private final TargetPacks packs = TargetPacks.builtIn();

    @Test
    void names() {
        assertThat(ScreenScaffolder.pascal("Fund Transfer")).isEqualTo("FundTransfer");
        assertThat(ScreenScaffolder.pascal("beneficiary_name")).isEqualTo("BeneficiaryName");
        assertThat(ScreenScaffolder.camel("IBAN number")).isEqualTo("ibanNumber");
        assertThat(ScreenScaffolder.camel("FundTransfer")).isEqualTo("fundTransfer");
        assertThat(ScreenScaffolder.pascal("2FA setup")).isEqualTo("Screen2FaSetup");
        assertThat(ScreenScaffolder.kebab("Fund Transfer")).isEqualTo("fund-transfer");
        assertThat(ScreenScaffolder.kebab("FundTransfer")).isEqualTo("fund-transfer");
    }

    @Test
    void scaffoldsAReactNativeScreenTestAndTexts() throws Exception {
        TargetPack pack = packs.find("react-native").orElseThrow();
        ScreenScaffolder.Scaffold screen = ScreenScaffolder.forFile(pack, "mobile", "mobile/src/screens/payments/FundTransferScreen.tsx",
                List.of(TRANSFER), null).orElseThrow();
        assertThat(screen.kind()).isEqualTo("screen");
        assertThat(screen.expectedIds()).containsExactly("fromAccount", "amount", "date", "purpose", "remarks", "speed", "alerts", "save",
                "fee", "count", "ref", "submit", "cancel", "help");
        assertThat(screen.content()).contains("export function FundTransferScreen(",
                "import { AccountField, AmountField, Button, CheckboxGroup, DateField, NumberField, RadioGroup, ReadOnlyField, Screen, "
                        + "Section, SelectField, SwitchField, TextField, theme } from '../../components';",
                "const purposeOptions = ['Family support', 'Rent', 'Other\\'s \"bill\"'];",
                "const fromAccountOptions: string[] = []; // The customer's accounts",
                "alerts: ['SMS'] as string[],", "savePayee: true as boolean,", "reference: 'ABC',",
                "// From the spec: \"greater than 0\"", "amount: { label: t('fundTransfer.amount'), required: true },",
                "remarks: { label: t('fundTransfer.remarks'), maxLength: 35 },",
                "<Section title={t('fundTransfer.detailsSection')} columns={2}>", "<Section columns={1}>",
                "testID=\"remarks\"", "multiline", "readOnly",
                "<Button testID=\"submit\" label={t('fundTransfer.submit')} variant=\"primary\" disabled={busy} onPress={submit} />",
                "onPress={() => onAction?.('cancel')}", "src/api/paymentsApi.ts");
        assertThat(screen.content()).doesNotContainPattern("\\{\\{\\w+(}}|:)");

        ScreenScaffolder.Scaffold test = ScreenScaffolder.forFile(pack, "mobile", "mobile/src/screens/payments/__tests__/FundTransferScreen.test.tsx",
                List.of(TRANSFER), null).orElseThrow();
        assertThat(test.content()).contains("const ids = ['fromAccount', 'amount',", "toHaveLength(3)", "getByTestId('submit')")
                .doesNotContainPattern("\\{\\{\\w+(}}|:)");

        String texts = ScreenScaffolder.forFile(pack, "mobile", "mobile/src/i18n/en.json", List.of(TRANSFER), null).orElseThrow().content();
        assertThat(texts).contains("\"common\": {", "\"fundTransfer\": {", "\"title\": \"Transfer money\"", "\"amountHelp\": \"In the account's currency\"",
                "\"amountPlaceholder\": \"0.00\"", "\"detailsSection\": \"Transfer details\"", "\"submit\": \"Transfer\"");
        assertThat(ScreenScaffolder.forFile(pack, "mobile", "mobile/src/api/paymentsApi.ts", List.of(TRANSFER), null)).isEmpty();
        assertThat(ScreenScaffolder.forFile(pack, "mobile", "ui/js/x.js", List.of(TRANSFER), null)).isEmpty();

        String out = System.getProperty("scaffold.out");
        if (out != null) {
            // For checking the generated code with the real toolchain: mvn test -Dscaffold.out=<folder>
            write(Path.of(out, "react-native/src/screens/payments/FundTransferScreen.tsx"), screen.content());
            write(Path.of(out, "react-native/src/screens/payments/__tests__/FundTransferScreen.test.tsx"), test.content());
            write(Path.of(out, "react-native/src/i18n/en.json"), texts);
        }
    }

    @Test
    void scaffoldsAReactPage() throws Exception {
        TargetPack pack = packs.find("react").orElseThrow();
        ScreenScaffolder.Scaffold page = ScreenScaffolder.forFile(pack, "web", "web/src/screens/payments/FundTransferPage.tsx",
                List.of(TRANSFER), null).orElseThrow();
        assertThat(page.content()).contains("export function FundTransferPage(", "<div className=\"obdx-error\" role=\"alert\">")
                .doesNotContain("theme", "react-native").doesNotContainPattern("\\{\\{\\w+(}}|:)");
        ScreenScaffolder.Scaffold test = ScreenScaffolder.forFile(pack, "web", "web/src/screens/payments/__tests__/FundTransferPage.test.tsx",
                List.of(TRANSFER), null).orElseThrow();
        assertThat(test.content()).contains("fireEvent.click(screen.getByTestId('submit'))");
        String out = System.getProperty("scaffold.out");
        if (out != null) {
            write(Path.of(out, "react/src/screens/payments/FundTransferPage.tsx"), page.content());
            write(Path.of(out, "react/src/screens/payments/__tests__/FundTransferPage.test.tsx"), test.content());
            write(Path.of(out, "react/src/i18n/en.json"), ScreenScaffolder.texts(pack.starter().get("src/i18n/en.json"), List.of(TRANSFER)));
        }
    }

    @Test
    void scaffoldsAnAngularPage() throws Exception {
        TargetPack pack = packs.find("angular").orElseThrow();
        ScreenScaffolder.Scaffold page = ScreenScaffolder.forFile(pack, "web-angular", "web-angular/src/app/screens/payments/FundTransferPage.ts",
                List.of(TRANSFER), null).orElseThrow();
        assertThat(page.expectedIds()).containsExactly("fromAccount", "amount", "date", "purpose", "remarks", "speed", "alerts", "save",
                "fee", "count", "ref", "submit", "cancel", "help");
        assertThat(page.content()).contains("export class FundTransferPage {", "selector: 'app-fund-transfer'",
                "import { AmountInput, Button, CheckboxGroup, DatePicker, Dropdown, RadioGroup, ReadOnlyField, Screen, Section, TextArea, "
                        + "TextField, Toggle } from '../../components';",
                "<bx-switch", "<bx-text-area",
                "protected readonly purposeOptions = ['Family support', 'Rent', 'Other\\'s \"bill\"'];",
                "amount: null as number | null,", "alerts: ['SMS'] as string[],", "savePayee: true as boolean,",
                "<obdx-section [title]=\"t('fundTransfer.detailsSection')\" [columns]=\"2\">",
                "<bx-amount", "[(value)]=\"form.values.amount\"", "[error]=\"form.errors().amount ?? ''\"", "[required]=\"true\"",
                "<obdx-read-only", "[value]=\"form.values.fee()\"", "inputMode=\"numeric\"", "[maxLength]=\"35\"",
                "<bx-button testID=\"submit\" [label]=\"t('fundTransfer.submit')\" chroming=\"callToAction\" [busy]=\"busy()\" (action)=\"submit()\" />",
                "(action)=\"action.emit('cancel')\"", "chroming=\"borderless\"", "{{ failure() }}", "src/app/api/paymentsApi.ts")
                .doesNotContain("className", "onPress", "react").doesNotContainPattern("\\{\\{\\w+(}}|:)");
        ScreenScaffolder.Scaffold test = ScreenScaffolder.forFile(pack, "web-angular", "web-angular/src/app/screens/payments/FundTransferPage.spec.ts",
                List.of(TRANSFER), null).orElseThrow();
        assertThat(test.kind()).isEqualTo("test");
        assertThat(test.content()).contains("TestBed.createComponent(FundTransferPage)", "toBe(3)").doesNotContainPattern("\\{\\{\\w+(}}|:)");
        String out = System.getProperty("scaffold.out");
        if (out != null) {
            write(Path.of(out, "angular/src/app/screens/payments/FundTransferPage.ts"), page.content());
            write(Path.of(out, "angular/src/app/screens/payments/FundTransferPage.spec.ts"), test.content());
            write(Path.of(out, "angular/src/app/i18n/en.json"), ScreenScaffolder.texts(pack.starter().get("src/app/i18n/en.json"), List.of(TRANSFER)));
        }
    }

    @Test
    void scaffoldsAFlutterPage() throws Exception {
        TargetPack pack = packs.find("flutter").orElseThrow();
        assertThat(ScreenScaffolder.screenPath(pack, TRANSFER, "payments")).isEqualTo("lib/screens/payments/fund_transfer_page.dart");
        ScreenScaffolder.Scaffold page = ScreenScaffolder.forFile(pack, "mobile-flutter", "mobile-flutter/lib/screens/payments/fund_transfer_page.dart",
                List.of(TRANSFER), null).orElseThrow();
        assertThat(page.expectedIds()).containsExactly("fromAccount", "amount", "date", "purpose", "remarks", "speed", "alerts", "save",
                "fee", "count", "ref", "submit", "cancel", "help");
        assertThat(page.content()).contains("class FundTransferPage extends StatefulWidget {", "class _FundTransferPageState extends State<FundTransferPage> {",
                "final purposeOptions = const <String>['Family support', 'Rent', 'Other\\'s \"bill\"'];",
                "'amount': null,", "'alerts': <String>['SMS'],", "'savePayee': true,",
                "title: t('fundTransfer.detailsSection'),", "columns: 2,",
                "BxAmountField(", "key: const ValueKey('amount'),", "value: form.number('amount'),", "onChanged: (value) => form.set('amount', value),",
                "error: form.error('amount'),", "required: true,", "BxReadOnlyField(", "value: form.text('fee'),", "keyboardType: TextInputType.number,",
                "maxLength: 35,", "variant: BxVariant.primary,", "busy: busy,", "onPressed: submit,",
                "onPressed: () => widget.onAction?.call('cancel'),", "variant: BxVariant.link,", "lib/api/payments_api.dart")
                .doesNotContain("className", "onPress=", "react", "<obdx").doesNotContainPattern("\\{\\{\\w+(}}|:)");
        ScreenScaffolder.Scaffold test = ScreenScaffolder.forFile(pack, "mobile-flutter", "mobile-flutter/test/screens/payments/fund_transfer_page_test.dart",
                List.of(TRANSFER), null).orElseThrow();
        assertThat(test.kind()).isEqualTo("test");
        assertThat(test.content()).contains("package:obdx_app/screens/payments/fund_transfer_page.dart", "home: const FundTransferPage()", "findsNWidgets(3)")
                .doesNotContainPattern("\\{\\{\\w+(}}|:)");
        assertThat(ScreenScaffolder.dartQuote("Pay $5 to O'Neil")).isEqualTo("'Pay \\$5 to O\\'Neil'");
        String out = System.getProperty("scaffold.out");
        if (out != null) {
            write(Path.of(out, "flutter/lib/screens/payments/fund_transfer_page.dart"), page.content());
            write(Path.of(out, "flutter/test/screens/payments/fund_transfer_page_test.dart"), test.content());
            write(Path.of(out, "flutter/assets/i18n/en.json"), ScreenScaffolder.texts(pack.starter().get("assets/i18n/en.json"), List.of(TRANSFER)));
        }
    }

    @Test
    void scaffoldsAJetCorePackPage() throws Exception {
        TargetPack pack = packs.find("jet-core-pack").orElseThrow();
        ScreenScaffolder.Scaffold page = ScreenScaffolder.forFile(pack, "web-jet", "web-jet/src/screens/payments/FundTransferPage.tsx",
                List.of(TRANSFER), null).orElseThrow();
        assertThat(page.content()).contains("export function FundTransferPage(", "import { useState } from 'preact/hooks';",
                "<AmountField", "amount: null as number | null,", "<TextArea", "<SelectField", "options={purposeOptions}",
                "onPress={submit}").doesNotContain("from 'react'").doesNotContainPattern("\\{\\{\\w+(}}|:)");
        ScreenScaffolder.Scaffold test = ScreenScaffolder.forFile(pack, "web-jet", "web-jet/src/screens/payments/__tests__/FundTransferPage.spec.tsx",
                List.of(TRANSFER), null).orElseThrow();
        assertThat(test.content()).contains("@testing-library/preact", "toHaveLength(3)").doesNotContainPattern("\\{\\{\\w+(}}|:)");
        String out = System.getProperty("scaffold.out");
        if (out != null) {
            write(Path.of(out, "jet-core-pack/src/screens/payments/FundTransferPage.tsx"), page.content());
            write(Path.of(out, "jet-core-pack/src/screens/payments/__tests__/FundTransferPage.spec.tsx"), test.content());
            write(Path.of(out, "jet-core-pack/src/i18n/en.json"), ScreenScaffolder.texts(pack.starter().get("src/i18n/en.json"), List.of(TRANSFER)));
        }
    }

    @Test
    void scaffoldsAVuePage() throws Exception {
        TargetPack pack = packs.find("vue").orElseThrow();
        ScreenScaffolder.Scaffold page = ScreenScaffolder.forFile(pack, "web-vue", "web-vue/src/screens/payments/FundTransferPage.vue",
                List.of(TRANSFER), null).orElseThrow();
        assertThat(page.expectedIds()).containsExactly("fromAccount", "amount", "date", "purpose", "remarks", "speed", "alerts", "save",
                "fee", "count", "ref", "submit", "cancel", "help");
        assertThat(page.content()).contains("<script setup lang=\"ts\">",
                "import { AccountField, AmountField, Button, CheckboxGroup, DateField, NumberField, RadioGroup, ReadOnlyField, Screen, "
                        + "Section, SelectField, SwitchField, TextArea, TextField } from '../../components';",
                "const purposeOptions = ['Family support', 'Rent', 'Other\\'s \"bill\"'];", "  amount: null as number | null,",
                "  alerts: ['SMS'] as string[],", "  savePayee: true as boolean,",
                "<Section :title=\"t('fundTransfer.detailsSection')\" :columns=\"2\">", "<AmountField", "testID=\"amount\"",
                "v-model=\"form.values.amount\"", ":error=\"form.errors.amount\"", ":modelValue=\"form.values.fee\"", ":options=\"purposeOptions\"",
                ":maxLength=\"35\"", "<Button testID=\"submit\" :label=\"t('fundTransfer.submit')\" variant=\"primary\" :busy=\"busy\" @press=\"submit\" />",
                "@press=\"emit('action', 'cancel')\"", "src/api/paymentsApi.ts")
                .doesNotContain("className", "onPress=", "from 'react'", "ValueKey").doesNotContainPattern("\\{\\{\\w+(}}|:)");
        ScreenScaffolder.Scaffold test = ScreenScaffolder.forFile(pack, "web-vue", "web-vue/src/screens/payments/__tests__/FundTransferPage.spec.ts",
                List.of(TRANSFER), null).orElseThrow();
        assertThat(test.content()).contains("import FundTransferPage from '../FundTransferPage.vue';", "@vue/test-utils", "toHaveLength(3)")
                .doesNotContainPattern("\\{\\{\\w+(}}|:)");
        String out = System.getProperty("scaffold.out");
        if (out != null) {
            write(Path.of(out, "vue/src/screens/payments/FundTransferPage.vue"), page.content());
            write(Path.of(out, "vue/src/screens/payments/__tests__/FundTransferPage.spec.ts"), test.content());
            write(Path.of(out, "vue/src/i18n/en.json"), ScreenScaffolder.texts(pack.starter().get("src/i18n/en.json"), List.of(TRANSFER)));
        }
    }

    @Test
    void scaffoldsANativeScreenForAndroidAndIos() throws Exception {
        TargetPack pack = packs.find("native").orElseThrow();
        String app = "mobile-native/";
        ScreenScaffolder.Scaffold kotlin = ScreenScaffolder.forFile(pack, "mobile-native",
                app + "android/app/src/main/java/com/bank/obdx/screens/payments/FundTransferScreen.kt", List.of(TRANSFER), null).orElseThrow();
        ScreenScaffolder.Scaffold swift = ScreenScaffolder.forFile(pack, "mobile-native",
                app + "ios/Sources/ObdxApp/Screens/payments/FundTransferView.swift", List.of(TRANSFER), null).orElseThrow();
        // Both apps carry every field and action of the approved design
        assertThat(kotlin.expectedIds()).isEqualTo(swift.expectedIds()).containsExactly("fromAccount", "amount", "date", "purpose", "remarks", "speed",
                "alerts", "save", "fee", "count", "ref", "submit", "cancel", "help");
        assertThat(kotlin.content()).contains("package com.bank.obdx.screens.payments", "fun FundTransferScreen(onAction: (String) -> Unit = {}, onDone: () -> Unit = {}) {",
                "val purposeOptions = listOf(\"Family support\", \"Rent\", \"Other's \\\"bill\\\"\")", "\"amount\" to null,", "\"alerts\" to listOf(\"SMS\"),",
                "\"savePayee\" to true,", "\"reference\" to FieldRule(label = t(\"fundTransfer.reference\"), required = true, maxLength = 16),",
                "BxSection(title = t(\"fundTransfer.detailsSection\"), columns = 2) {", "BxAmountField(", "testTag = \"amount\",",
                "value = form.number(\"amount\"),", "onValueChange = { form.set(\"amount\", it) },", "error = form.error(\"amount\"),",
                "value = form.display(\"fee\"),", "readOnly = true,", "maxLength = 35,",
                "BxButton(testTag = \"submit\", label = t(\"fundTransfer.submit\"), variant = BxVariant.Primary, busy = busy, onClick = { submit() })",
                "onClick = { onAction(\"cancel\") })", "variant = BxVariant.Link")
                .doesNotContain("className", "ValueKey", "testID").doesNotContainPattern("\\{\\{\\w+(}}|:)");
        assertThat(swift.content()).contains("public struct FundTransferView: View {", "private let purposeOptions: [String] = [\"Family support\", \"Rent\", \"Other's \\\"bill\\\"\"]",
                "\"amount\": Double?.none,", "\"alerts\": [\"SMS\"] as [String],", "\"savePayee\": true,",
                "\"reference\": FieldRule(label: t(\"fundTransfer.reference\"), required: true, maxLength: 16),",
                "BxSection(title: t(\"fundTransfer.detailsSection\"), columns: 2) {", "testID: \"amount\",", "value: form.number(\"amount\"),",
                "error: form.error(\"amount\"),", "value: form.display(\"fee\")\n", "options: purposeOptions,",
                "BxButton(testID: \"submit\", label: t(\"fundTransfer.submit\"), variant: .primary, busy: busy, action: submit)",
                "action: { onAction(\"cancel\") })")
                .doesNotContain("onValueChange", "testTag", "ValueKey").doesNotContainPattern("\\{\\{\\w+(}}|:)").doesNotContainPattern(",\\n\\s*\\)");
        ScreenScaffolder.Scaffold kotlinTest = ScreenScaffolder.forFile(pack, "mobile-native",
                app + "android/app/src/test/java/com/bank/obdx/screens/payments/FundTransferScreenTest.kt", List.of(TRANSFER), null).orElseThrow();
        ScreenScaffolder.Scaffold swiftTest = ScreenScaffolder.forFile(pack, "mobile-native",
                app + "ios/Tests/ObdxAppTests/payments/FundTransferViewTests.swift", List.of(TRANSFER), null).orElseThrow();
        assertThat(kotlinTest.content()).contains("class FundTransferScreenTest {", "listOf(\"fromAccount\", \"amount\"", "assertCountEquals(3)")
                .doesNotContainPattern("\\{\\{\\w+(}}|:)");
        assertThat(swiftTest.content()).contains("final class FundTransferViewTests: XCTestCase {", "[\"fromAccount\", \"amount\"", "FundTransferView()")
                .doesNotContainPattern("\\{\\{\\w+(}}|:)");
        assertThat(ScreenScaffolder.kotlinQuote("Pay $5 to \"A\"")).isEqualTo("\"Pay \\$5 to \\\"A\\\"\"");
        assertThat(ScreenScaffolder.swiftQuote("Pay $5 to \"A\"")).isEqualTo("\"Pay $5 to \\\"A\\\"\"");
        String out = System.getProperty("scaffold.out");
        if (out != null) {
            write(Path.of(out, "native/android/app/src/main/java/com/bank/obdx/screens/payments/FundTransferScreen.kt"), kotlin.content());
            write(Path.of(out, "native/ios/Sources/ObdxApp/Screens/payments/FundTransferView.swift"), swift.content());
            write(Path.of(out, "native/shared/i18n/en.json"), ScreenScaffolder.texts(pack.starter().get("shared/i18n/en.json"), List.of(TRANSFER)));
        }
    }

    @Test
    void scaffoldsACapacitorPageAsTheReactOne() {
        TargetPack capacitor = packs.find("capacitor").orElseThrow();
        TargetPack react = packs.find("react").orElseThrow();
        assertThat(ScreenScaffolder.screen(capacitor, TRANSFER, "payments").content()).isEqualTo(ScreenScaffolder.screen(react, TRANSFER, "payments").content());
    }

    @Test
    void scaffoldsAngularPagesForACapacitorAppWrappingTheAngularApp() {
        // The React starter in the app folder: React pages, as before
        java.util.Set<String> reactApp = java.util.Set.of("mobile/package.json", "mobile/vite.config.ts", "mobile/capacitor.config.ts");
        TargetPack forReact = packs.screens("capacitor", "mobile", reactApp::contains).orElseThrow();
        assertThat(forReact.id()).isEqualTo("capacitor");
        assertThat(ScreenScaffolder.forFile(forReact, "mobile", "mobile/src/screens/payments/FundTransferPage.tsx", List.of(TRANSFER), null)
                .orElseThrow().content()).contains("export function FundTransferPage(");
        assertThat(ScreenScaffolder.forFile(forReact, "mobile", "mobile/src/app/screens/payments/FundTransferPage.ts", List.of(TRANSFER), null)).isEmpty();

        // The Angular app wrapped by wrap-angular.mjs: Angular pages from the Angular pack
        java.util.Set<String> angularApp = java.util.Set.of("mobile/package.json", "mobile/angular.json", "mobile/capacitor.config.ts");
        TargetPack forAngular = packs.screens("capacitor", "mobile", angularApp::contains).orElseThrow();
        assertThat(forAngular.id()).isEqualTo("angular");
        String page = ScreenScaffolder.forFile(forAngular, "mobile", "mobile/src/app/screens/payments/FundTransferPage.ts", List.of(TRANSFER), null)
                .orElseThrow().content();
        assertThat(page).isEqualTo(ScreenScaffolder.screen(packs.find("angular").orElseThrow(), TRANSFER, "payments").content());
        assertThat(ScreenScaffolder.forFile(forAngular, "mobile", "mobile/src/screens/payments/FundTransferPage.tsx", List.of(TRANSFER), null)).isEmpty();

        // Only Capacitor wraps: an angular.json does not turn another target into Angular
        assertThat(packs.screens("react", "mobile", angularApp::contains).orElseThrow().id()).isEqualTo("react");
    }

    private static void write(Path file, String content) throws Exception {
        Files.createDirectories(file.getParent());
        Files.writeString(file, content);
    }
}
