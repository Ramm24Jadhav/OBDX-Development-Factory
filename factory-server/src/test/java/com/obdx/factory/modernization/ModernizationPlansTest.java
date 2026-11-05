package com.obdx.factory.modernization;

import com.obdx.factory.componentpack.ComponentRegistry;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class ModernizationPlansTest {

    private static final ComponentRegistry REGISTRY = new ComponentRegistry(JsonMapper.builder().build());

    static Inventory.Screen screen(String id, String module, Map<String, Integer> elements, List<String> opens, List<String> calls, String size) {
        return new Inventory.Screen(id, id, module, "component", List.of("ui/" + id + ".html"), 40, List.of(new Inventory.Field("text", "Name", "name")), 1,
                calls, opens, 10, size, elements, Map.of());
    }

    static Inventory inventory(List<Inventory.Screen> screens, List<Inventory.Module> modules) {
        return new Inventory(9L, OffsetDateTime.now(), new Inventory.Summary(screens.size(), modules.size(), 0, 0, 0, 0, 0, 0, Map.of(), 0, 0), modules, screens,
                List.of(), List.of(new Inventory.ServiceCall("GET", "/digx/v1/accounts", List.of("acc"), null)), List.of(),
                List.of(new Inventory.Flow("Pay", List.of("pay", "payee"), List.of())), List.of(), Map.of());
    }

    static final Inventory SAMPLE = inventory(List.of(
            screen("login", "login", Map.of("oj-input-text", 2, "oj-button", 1), List.of(), List.of(), "S"),
            screen("acc", "accounts", Map.of("oj-table", 1, "oj-button", 1), List.of("login"), List.of("GET /digx/v1/accounts"), "M"),
            screen("acc2", "accounts", Map.of("oj-button", 2), List.of(), List.of(), "S"),
            screen("payee", "payees", Map.of("oj-input-text", 3), List.of("acc"), List.of(), "S"),
            screen("pay", "payments", Map.of("oj-input-text", 4, "oj-button", 2), List.of("payee", "acc"), List.of(), "L")),
            List.of(new Inventory.Module("accounts", 2, 2, Map.of("S", 1, "M", 1), Map.of()), new Inventory.Module("login", 1, 1, Map.of("S", 1), Map.of()),
                    new Inventory.Module("payees", 1, 1, Map.of("S", 1), Map.of()), new Inventory.Module("payments", 1, 1, Map.of("L", 1), Map.of())));

    @Test
    void theTeamCanReorderAndSplitWaves() {
        List<String> included = List.of("oj-input-text", "oj-button");
        List<UpgradePlans.Draft> drafts = UpgradePlans.waves(SAMPLE, included, "module");
        List<UpgradePlans.Draft> arranged = UpgradePlans.arrange(SAMPLE, drafts, included, List.of("module:accounts", "module:login"), List.of("module:accounts"));
        assertThat(arranged).extracting(UpgradePlans.Draft::key).containsExactly("module:login", "module:payees", "module:payments", "module:accounts#1", "module:accounts#2");
        arranged = UpgradePlans.arrange(SAMPLE, drafts, included, List.of("module:accounts#2", "module:accounts#1"), List.of("module:accounts"));
        assertThat(arranged.getFirst().name()).isEqualTo("accounts (2 of 2)");
        assertThat(arranged.getFirst().screens()).hasSize(1);
        assertThat(UpgradePlans.arrange(SAMPLE, drafts, included, null, null)).isEqualTo(drafts);
    }

    @Test
    void wavesGoSmallModulesFirstOrOneComponentEach() {
        List<UpgradePlans.Draft> byModule = UpgradePlans.waves(SAMPLE, List.of("oj-input-text", "oj-button"), "module");
        assertThat(byModule).extracting(UpgradePlans.Draft::name).containsExactly("login", "payees", "payments", "accounts");
        assertThat(byModule.get(0).components()).containsExactly("oj-input-text", "oj-button");
        assertThat(byModule.get(3).screens()).extracting(UpgradePlans.ScreenUse::uses).containsExactly(1, 2);

        List<UpgradePlans.Draft> byComponent = UpgradePlans.waves(SAMPLE, List.of("oj-button", "oj-input-text"), "component");
        assertThat(byComponent).extracting(UpgradePlans.Draft::key).containsExactly("component:oj-input-text", "component:oj-button");
        assertThat(byComponent.get(1).screens()).hasSize(4);

        assertThat(UpgradePlans.waitsFor(0, List.of("planned"))).isNull();
        assertThat(UpgradePlans.waitsFor(2, List.of("delivered", "validating", "planned"))).isEqualTo("Wave 2 must be delivered first");
        assertThat(UpgradePlans.waitsFor(2, List.of("delivered", "delivered", "planned"))).isNull();
    }

    @Test
    void theOrderMovesWhatAModuleNeedsFirst() {
        Map<String, MigrationPlans.ModuleFacts> facts = MigrationPlans.modules(SAMPLE);
        assertThat(facts.get("payments").needs()).containsExactly("accounts", "payees");
        assertThat(facts.get("accounts").neededBy()).containsExactly("payees", "payments");
        assertThat(facts.get("accounts").callsWithoutBackend()).isEqualTo(1);
        assertThat(facts.get("payments").size()).isEqualTo("M");
        assertThat(MigrationPlans.suggestedOrder(facts)).containsExactly("login", "accounts", "payees", "payments");
        assertThat(MigrationPlans.cycles(facts)).isEmpty();
    }

    @Test
    void aBriefSaysWhatToChangeAndKeepsTheRest() {
        RunBriefs.Brief ui = RunBriefs.ui(SAMPLE, REGISTRY, List.of("oj-input-text"), null, "Wave 1: login");
        assertThat(ui.screens()).containsExactly("login", "payee", "pay");
        assertThat(ui.title()).isEqualTo("Wave 1: login: oj-input-text on 3 screens");
        assertThat(ui.text()).contains("Replace <oj-input-text> with <bx-text-field>").contains("keep every Knockout binding");
        assertThat(ui.spec().screens()).allSatisfy(s -> assertThat(s.changeType()).isEqualTo("enhance"));
        assertThat(ui.spec().requirements()).hasSize(1);

        RunBriefs.Brief only = RunBriefs.ui(SAMPLE, REGISTRY, List.of("oj-input-text"), List.of("pay"), null);
        assertThat(only.screens()).containsExactly("pay");

        RunBriefs.Brief migration = RunBriefs.migration(SAMPLE, "accounts", "React (web)", "web");
        assertThat(migration.screens()).containsExactly("acc", "acc2");
        assertThat(migration.spec().businessRules()).hasSize(8);
        assertThat(migration.spec().apis()).extracting(a -> a.method() + " " + a.name()).containsExactly("GET /digx/v1/accounts");
        assertThat(migration.text()).contains("React (web) app in web/").contains("OBDX-3");
    }
}
