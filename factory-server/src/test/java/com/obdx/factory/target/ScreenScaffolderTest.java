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

    private static void write(Path file, String content) throws Exception {
        Files.createDirectories(file.getParent());
        Files.writeString(file, content);
    }
}
