package com.obdx.factory.design;

import com.obdx.factory.profile.SourceTree;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import tools.jackson.databind.json.JsonMapper;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;

class ComponentPaletteTest {

    private final ComponentPalette palette = new ComponentPalette(null, null, null, JsonMapper.builder().build());

    @Test
    void findsTheComponentsOfAnObdxCodebase(@TempDir Path root) throws IOException {
        write(root, "channel/framework/elements/page-section/page-section.html", "<div class=\"page-section\"></div>");
        write(root, "channel/framework/elements/page-section/page-section.js",
                "define([], function () { return function (params) { this.label = params.label; this.base = params.baseModel; }; });");
        write(root, "channel/components/modules/payments/transfer-funds/transfer-funds.html", """
                <page-section params="baseModel : $baseModel, label : $component.nls.title">
                  <account-input params="label: 'From', value: $component.fromAccount, type: 'balance'"></account-input>
                  <!-- ko component: {name: "amount-input", params: {amount: $component.amount, currency: 'INR'}} --><!-- /ko -->
                  <oj-input-text value="{{remarks}}"></oj-input-text>
                  <oj-list-view data="[[payees]]"></oj-list-view>
                  <oj-bind-text value="[[x]]"></oj-bind-text>
                  <oj-form-layout></oj-form-layout>
                  <oj-button>Transfer</oj-button><oj-button>Cancel</oj-button>
                </page-section>
                """);
        write(root, "channel/components/modules/payments/transfer-funds/transfer-funds.js",
                "define([], function () { return function (rootParams) { this.payee = rootParams.payeeId; }; });");
        write(root, "channel/components/widgets/rate-card/component.json",
                "{\"name\": \"rate-card\", \"description\": \"Shows exchange rates\", \"properties\": {\"currency\": {}, \"amount\": {}}}");
        write(root, "channel/partials/payments/payee-row.html", "<div></div>");

        Map<String, ComponentPalette.Item> items = palette.scan(SourceTree.scan(root, List.of(), 1_000_000)).stream()
                .collect(Collectors.toMap(ComponentPalette.Item::id, i -> i));

        assertThat(items.get("component:page-section")).satisfies(i -> {
            assertThat(i.group()).isEqualTo(ComponentPalette.FRAMEWORK);
            assertThat(i.uses()).isEqualTo(1);
            assertThat(i.params()).as("baseModel is common to every component").containsExactly("label");
            assertThat(i.source()).isEqualTo("channel/framework/elements/page-section/page-section.html");
        });
        assertThat(items.get("component:account-input")).satisfies(i -> {
            assertThat(i.group()).as("a known framework component, defined elsewhere").isEqualTo(ComponentPalette.FRAMEWORK);
            assertThat(i.params()).containsExactly("label", "value", "type");
            assertThat(i.type()).isEqualTo("component");
            assertThat(i.tag()).isEqualTo("account-input");
        });
        assertThat(items.get("component:amount-input").params()).containsExactly("amount", "currency");
        assertThat(items.get("component:transfer-funds")).satisfies(i -> {
            assertThat(i.group()).isEqualTo(ComponentPalette.BUSINESS);
            assertThat(i.module()).isEqualTo("payments");
            assertThat(i.params()).containsExactly("payeeId");
        });
        assertThat(items.get("component:rate-card")).satisfies(i -> {
            assertThat(i.group()).isEqualTo(ComponentPalette.COMPOSITE);
            assertThat(i.params()).containsExactly("currency", "amount");
            assertThat(i.description()).isEqualTo("Shows exchange rates");
        });
        assertThat(items.get("component:payee-row").group()).isEqualTo(ComponentPalette.PARTIALS);

        assertThat(items.get("jet:oj-button")).satisfies(i -> {
            assertThat(i.type()).as("a button becomes an action").isEqualTo("action");
            assertThat(i.uses()).isEqualTo(2);
        });
        assertThat(items.get("jet:oj-input-text").type()).isEqualTo("text");
        assertThat(items.get("jet:oj-list-view")).satisfies(i -> {
            assertThat(i.type()).isEqualTo("component");
            assertThat(i.tag()).isEqualTo("oj-list-view");
        });
        assertThat(items).doesNotContainKeys("jet:oj-bind-text", "jet:oj-form-layout");
    }

    @Test
    void standardComponentsComeFirstWithoutCode() {
        assertThat(ComponentPalette.standard()).extracting(ComponentPalette.Item::id)
                .contains("type:text", "type:table", "action:button")
                .doesNotContain("type:component");
    }

    private static void write(Path root, String path, String content) throws IOException {
        Path file = root.resolve(path);
        Files.createDirectories(file.getParent());
        Files.writeString(file, content);
    }
}
