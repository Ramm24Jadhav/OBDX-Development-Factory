package com.obdx.factory.modernization;

import com.obdx.factory.change.ChangeRequest;
import com.obdx.factory.componentpack.ComponentRegistry;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.tuple;

class ComponentInventoryTest {

    private static final ComponentRegistry REGISTRY = new ComponentRegistry(JsonMapper.builder().build());

    static Inventory.Screen screen(String id, String module, Map<String, Integer> elements, Map<String, Integer> markers) {
        return new Inventory.Screen(id, id, module, "component", List.of("ui/" + id + ".html"), 40, List.of(), 1, List.of(), List.of(), 10, "S",
                elements, markers);
    }

    static Inventory inventory(List<Inventory.Screen> screens) {
        int uses = screens.stream().mapToInt(s -> s.elements() == null ? 0 : s.elements().values().stream().mapToInt(Integer::intValue).sum()).sum();
        return new Inventory(7L, OffsetDateTime.now(), new Inventory.Summary(screens.size(), 2, 0, 0, 0, 0, 0, 0, Map.of(), uses, 0),
                List.of(new Inventory.Module("payments", 2, 0, Map.of(), Map.of()), new Inventory.Module("accounts", 1, 0, Map.of(), Map.of())),
                screens, List.of(), List.of(), List.of(), List.of(new Inventory.Flow("Transfer", List.of("transfer", "review"), List.of())), List.of(),
                Map.of("oj-input-text", List.of("tests/transfer.spec.js")));
    }

    static final Inventory SAMPLE = inventory(List.of(
            screen("transfer", "payments", Map.of("oj-input-text", 3, "oj-button", 2, "oj-option", 4, "oj-select-one", 1), Map.of("inline-style", 1)),
            screen("review", "payments", Map.of("oj-button", 1, "oj-table", 1), Map.of("renderer", 1)),
            screen("summary", "accounts", Map.of("oj-gauge", 1, "oj-x-unknown", 2), Map.of())));

    @Test
    void groupsTheJetElementsByHowTheyMap() {
        ComponentInventory.View view = ComponentInventory.of(SAMPLE, REGISTRY);

        // oj-option is kept as it is and not counted
        assertThat(view.rows()).extracting(ComponentInventory.Row::element).doesNotContain("oj-option");
        assertThat(view.rows()).extracting(ComponentInventory.Row::element, ComponentInventory.Row::compatibility, ComponentInventory.Row::uses,
                ComponentInventory.Row::screens).containsExactly(
                tuple("oj-button", "direct", 3, 2), tuple("oj-input-text", "direct", 3, 1), tuple("oj-x-unknown", "custom", 2, 1),
                tuple("oj-gauge", "custom", 1, 1), tuple("oj-select-one", "mapping", 1, 1), tuple("oj-table", "custom", 1, 1));
        ComponentInventory.Row text = view.rows().stream().filter(r -> r.element().equals("oj-input-text")).findFirst().orElseThrow();
        assertThat(text.premium()).isEqualTo("bx-text-field");
        assertThat(text.effort()).isEqualTo("Low");
        assertThat(text.category()).isEqualTo("input");
        assertThat(view.rows().stream().filter(r -> r.element().equals("oj-gauge")).findFirst().orElseThrow().premium()).isEqualTo("Not in the pack yet");

        assertThat(view.totals()).isEqualTo(new ComponentInventory.Totals(11, 6, 6, 1, 4, 3));
        assertThat(view.modules()).extracting(ComponentInventory.ModuleUsage::module, ComponentInventory.ModuleUsage::uses, ComponentInventory.ModuleUsage::coveredPercent)
                .containsExactly(tuple("payments", 8, 88), tuple("accounts", 3, 0));
        assertThat(view.matrix()).filteredOn(m -> m.element().equals("oj-gauge")).extracting(ComponentInventory.MatrixRow::result).containsExactly("Not in the pack");
        assertThat(view.findings()).extracting(ComponentInventory.Finding::text).contains("oj-gauge has no premium version",
                "oj-table needs a custom transformation", "Renderer functions on JET elements", "Inline styles on JET elements");
    }

    @Test
    void anAnalysisFromBeforeTheCountsSaysSo() {
        Inventory old = new Inventory(7L, OffsetDateTime.now(), new Inventory.Summary(1, 1, 0, 0, 0, 0, 0, 0, Map.of(), null, null), List.of(),
                List.of(screen("x", "m", null, null)), List.of(), List.of(), List.of(), List.of(), List.of(), null);
        ComponentInventory.View view = ComponentInventory.of(old, REGISTRY);
        assertThat(view.counted()).isFalse();
        assertThat(view.rows()).isEmpty();
        assertThat(ModernizationService.insights(old, view)).extracting(ModernizationService.Insight::text).first().asString().startsWith("Analyze again");
    }

    @Test
    void showsTheBanksMarkupAsThePremiumElement() {
        String view = """
                <div>
                    <oj-input-password id="pw"
                        value="{{password}}" mask-icon="visible"
                        label-hint="[[nls.password]]">
                    </oj-input-password>
                </div>
                """;
        String snippet = MarkupConverter.snippet(view, "oj-input-password");
        assertThat(snippet).startsWith("<oj-input-password id=\"pw\"").endsWith("</oj-input-password>");
        assertThat(snippet.lines()).element(1).asString().startsWith("    value=");
        String premium = MarkupConverter.convert(snippet, REGISTRY.jetMapping("oj-input-password"), "bx-password");
        assertThat(premium).startsWith("<bx-password id=\"pw\"").contains("reveal=\"visible\"").contains("label-hint=\"[[nls.password]]\"").endsWith("</bx-password>");

        String table = MarkupConverter.convert("<oj-table data=\"[[rows]]\" row-renderer=\"[[r]]\"></oj-table>", REGISTRY.jetMapping("oj-table"), "bx-data-grid");
        assertThat(table).startsWith("<bx-data-grid data=\"[[rows]]\"").contains("<!-- row-renderer is not carried over");
        assertThat(MarkupConverter.snippet("<oj-button></oj-button>", "oj-input-text")).isNull();
    }

    @Test
    void aRunsStateFollowsItsChange() {
        assertThat(ModernizationService.runState(false, null, null, false)).isEqualTo("starting");
        assertThat(ModernizationService.runState(false, null, null, true)).isEqualTo("failed");
        assertThat(ModernizationService.runState(false, ChangeRequest.Status.PLAN_READY, null, true)).isEqualTo("building");
        assertThat(ModernizationService.runState(false, ChangeRequest.Status.GENERATED, null, true)).isEqualTo("validating");
        assertThat(ModernizationService.runState(false, ChangeRequest.Status.DELIVERED, null, true)).isEqualTo("delivered");
        assertThat(ModernizationService.runState(false, ChangeRequest.Status.CLOSED, ChangeRequest.CloseReason.MERGED, true)).isEqualTo("delivered");
        assertThat(ModernizationService.runState(false, ChangeRequest.Status.CLOSED, ChangeRequest.CloseReason.ABANDONED, true)).isEqualTo("rejected");
        assertThat(ModernizationService.runState(true, ChangeRequest.Status.GENERATED, null, true)).isEqualTo("rejected");
    }

    @Test
    void csvCellsCannotStartAFormula() {
        assertThat(ModernizationService.cell("=SUM(A1)")).isEqualTo("'=SUM(A1)");
        assertThat(ModernizationService.cell("a, b")).isEqualTo("\"a, b\"");
        assertThat(ModernizationService.cell(null)).isEmpty();
    }
}
