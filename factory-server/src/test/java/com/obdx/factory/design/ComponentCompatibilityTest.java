package com.obdx.factory.design;

import com.obdx.factory.pack.PackRule;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/** The designer's compatibility marks come from evidence: the bank's code and the version pack's rules. */
class ComponentCompatibilityTest {

    private static final PackRule NO_SELECT_ONE = new PackRule("jet-no-select-one", "oj-select-single instead of oj-select-one",
            PackRule.Severity.WARNING, List.of("**/*.html"), List.of(), "<oj-select-one\\b|ojs/ojselectcombobox", null,
            "oj-select-one is deprecated; use oj-select-single.", null, Map.of());
    private static final PackRule REQUIRE_ONLY = new PackRule("ui-amd-module", "AMD modules", PackRule.Severity.WARNING,
            List.of("**/*.js"), List.of(), null, "\\bdefine\\s*\\(", "Use define().", null, Map.of());

    private static final List<ComponentPalette.Item> CODE = List.of(
            new ComponentPalette.Item("jet:oj-input-text", ComponentPalette.JET, "Input text", "text", null, null, List.of(), 12,
                    "src/js/views/payee.html", "<oj-input-text>"),
            new ComponentPalette.Item("jet:oj-select-one", ComponentPalette.JET, "Select one", "select", null, null, List.of(), 3,
                    "src/js/views/old.html", "<oj-select-one>"),
            new ComponentPalette.Item("component:account-input", ComponentPalette.FRAMEWORK, "Account input", "component", "account-input",
                    null, List.of(), 0, "framework/account-input/account-input.html", "Defined"),
            // The standard palette entries carry no evidence: they are the factory's own types
            new ComponentPalette.Item("type:text", ComponentPalette.FORMS, "Text box", "text", null, null, List.of(), 0, null, "oj-input-text"));

    @Test
    void elementsTheCodeUsesOrDefinesAreVerified() {
        List<ComponentCompatibility.Entry> entries = ComponentCompatibility.assess(
                List.of("oj-input-text", "Account-Input", "oj-input-text"), List.of(NO_SELECT_ONE), CODE, true);

        assertThat(entries).extracting(ComponentCompatibility.Entry::element).containsExactly("oj-input-text", "account-input");
        assertThat(entries).extracting(ComponentCompatibility.Entry::status)
                .containsOnly(ComponentCompatibility.Status.VERIFIED);
        assertThat(entries.get(0).evidence()).contains("12 times").contains("payee.html");
        assertThat(entries.get(1).evidence()).contains("Defined in the bank's code");
    }

    @Test
    void aRuleOfTheVersionPackMakesAnElementUnsupportedEvenWhenOldCodeUsesIt() {
        List<ComponentCompatibility.Entry> entries = ComponentCompatibility.assess(List.of("oj-select-one", "oj-select-single"),
                List.of(NO_SELECT_ONE, REQUIRE_ONLY), CODE, true);

        assertThat(entries.get(0).status()).isEqualTo(ComponentCompatibility.Status.UNSUPPORTED);
        assertThat(entries.get(0).evidence()).contains("oj-select-single instead of oj-select-one");
        assertThat(entries.get(1).status()).isEqualTo(ComponentCompatibility.Status.UNVERIFIED);
        assertThat(entries.get(1).evidence()).isEqualTo("Not found in the bank's imported code.");
    }

    @Test
    void withoutEvidenceNothingIsVerified() {
        List<ComponentCompatibility.Entry> entries = ComponentCompatibility.assess(
                List.of("oj-input-text", "oj-bind-text", "exchange-rate-ticker", "not an element", "<script>"), List.of(), List.of(), false);

        assertThat(entries).extracting(ComponentCompatibility.Entry::element)
                .containsExactly("oj-input-text", "oj-bind-text", "exchange-rate-ticker");
        assertThat(entries).extracting(ComponentCompatibility.Entry::status).containsOnly(ComponentCompatibility.Status.UNVERIFIED);
        assertThat(entries.get(0).evidence()).contains("not imported yet");
        assertThat(ComponentCompatibility.assess(List.of("oj-bind-text"), List.of(), CODE, true).get(0).evidence())
                .contains("binding elements are not counted");
        assertThat(ComponentCompatibility.assess(null, List.of(), CODE, true)).isEmpty();
    }
}
