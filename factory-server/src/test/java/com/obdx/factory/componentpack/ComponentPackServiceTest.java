package com.obdx.factory.componentpack;

import com.obdx.factory.common.BadRequestException;
import com.obdx.factory.componentpack.ComponentPackService.Choice;
import com.obdx.factory.componentpack.ComponentPackService.ComponentView;
import com.obdx.factory.componentpack.ComponentPackService.Motion;
import com.obdx.factory.componentpack.ComponentPackService.Style;
import com.obdx.factory.componentpack.ComponentRegistry.Gate;
import com.obdx.factory.componentpack.ComponentRegistry.Pack;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ComponentPackServiceTest {

    private static final ComponentRegistry REGISTRY = new ComponentRegistry(JsonMapper.builder().build());
    private final ComponentPackService service = new ComponentPackService(REGISTRY);

    private static ComponentView find(ComponentPackService.Catalogue c, String id) {
        return c.categories().stream().flatMap((cat) -> cat.components().stream()).filter((v) -> v.id().equals(id)).findFirst().orElseThrow();
    }

    @Test
    void theRegistryLoadsEveryComponentWithItsNameAndFoundationInEveryPack() {
        assertThat(REGISTRY.size()).isEqualTo(245);
        assertThat(REGISTRY.categories()).hasSize(25);
        assertThat(REGISTRY.packs()).extracting(Pack::id).containsExactlyElementsOf(ComponentRegistry.PACKS);
        REGISTRY.categories().forEach((c) -> c.components().forEach((m) -> {
            assertThat(m.names()).as(m.id()).containsKey("jet-premium");
            assertThat(m.names().get("jet-premium")).as(m.id()).isEqualTo("bx-" + m.id());
            assertThat(m.builtOn()).as(m.id()).containsOnlyKeys(ComponentRegistry.PACKS);
            assertThat(m.workspace().kind()).as(m.id()).isIn("element", "widget", "screen", "none");
            if ("element".equals(m.workspace().kind())) {
                assertThat(m.workspace().element()).as(m.id()).startsWith("oj-");
            }
        }));
        assertThat(REGISTRY.categories().stream().flatMap((c) -> c.components().stream()).filter(ComponentRegistry.Entry::foundation)).hasSize(13);
    }

    @Test
    void everyBuiltComponentPointsAtCodeThatExists() throws Exception {
        for (Pack p : REGISTRY.packs()) {
            for (ComponentRegistry.Built b : p.built()) {
                Path folder = Path.of("..").resolve(b.source());
                assertThat(folder).as(p.id() + " " + b.component()).isDirectory();
                try (var files = Files.list(folder)) {
                    // A React or React Native component is an exported function, an Angular one an exported class or its element selector; a premium JET element a registered composite (directly or through its group file's register helper)
                    boolean exported = files.filter((f) -> f.toString().endsWith(".tsx") || f.toString().endsWith(".ts") || f.toString().endsWith(".js"))
                            .anyMatch((f) -> { try { String s = Files.readString(f); return s.contains("export function " + b.export()) || s.contains("export const " + b.export() + " = ") || s.contains("export class " + b.export() + " ") || s.contains("selector: '" + b.export() + "'")
                                    || s.contains("Composite.register('" + b.export() + "'") || s.contains("register('" + b.export() + "'"); } catch (Exception e) { return false; } });
                    assertThat(exported).as(p.id() + " " + b.component() + " exports " + b.export()).isTrue();
                }
            }
        }
    }

    @Test
    void readinessComesOnlyFromWhatIsBuiltAndItsChecks() {
        ComponentPackService.Catalogue c = service.catalogue();
        // The foundation set is built in every pack with its unit and accessibility checks passed; the browser gates are not run yet
        assertThat(find(c, "text-field").packs().get("react").readiness()).isEqualTo("in-test");
        assertThat(find(c, "text-field").packs().get("react").source()).isEqualTo("target-packs/components/react/src#TextField");
        assertThat(find(c, "data-grid").packs().get("angular").source()).isEqualTo("target-packs/components/angular/src#DataTable");
        assertThat(find(c, "dialog").packs().get("react-native").gates().get("accessibility")).isEqualTo("passed");
        assertThat(find(c, "dialog").packs().get("react-native").gates().get("visual")).isEqualTo("not-run");
        // The group 2 pack components replaced the starters' own; the forms wave replaced their switch
        assertThat(find(c, "account-picker").packs().get("react").source()).isEqualTo("target-packs/components/react/src#AccountSelector");
        assertThat(find(c, "switch").packs().get("react").source()).isEqualTo("target-packs/components/react/src#Toggle");
        assertThat(find(c, "document-upload").packs().get("react-native").source()).isEqualTo("target-packs/components/react-native/src#FileUpload");
        // The premium JET pack's foundation set and forms wave passed every gate, parity on JET 6.2 and the current release included
        assertThat(find(c, "button").packs().get("jet-premium").readiness()).isEqualTo("available");
        assertThat(find(c, "button").packs().get("jet-premium").gates().get("parity")).isEqualTo("passed");
        assertThat(find(c, "date-range").packs().get("jet-premium").readiness()).isEqualTo("available");
        assertThat(c.packs().get(0).counts().available()).isEqualTo(34);
        // React and Angular passed the browser gates; parity with the JET screens is still to run, so only components
        // that replace nothing (the card, and group 1's that passed) are Available
        assertThat(find(c, "card").packs().get("react").readiness()).isEqualTo("available");
        assertThat(find(c, "button").packs().get("angular").gates().get("parity")).isEqualTo("not-run");
        // Angular does not carry the widgets
        assertThat(find(c, "overview").packs().get("angular").readiness()).isEqualTo("not-in-pack");
        assertThat(c.packs()).allSatisfy((p) -> assertThat(p.counts().available() + p.counts().inTest() + p.counts().planned() + p.counts().notInPack()).isEqualTo(245));
        assertThat(c.packs().get(1).counts().available()).isEqualTo(11);
        assertThat(c.packs().get(1).counts().inTest()).isEqualTo(234);
        assertThat(c.packs().get(2).counts().available()).isZero();
        assertThat(c.packs().get(3).counts().available()).isEqualTo(9);
        assertThat(c.packs().get(3).counts().inTest()).isEqualTo(221);

        // Available only when every gate passes (parity does not apply to a component with nothing to replace)
        ComponentRegistry.Entry card = REGISTRY.component("card");
        Map<String, Gate> passed = new LinkedHashMap<>();
        for (String gate : ComponentPackService.GATES) {
            if (!"parity".equals(gate)) {
                passed.put(gate, new Gate("passed", "ci #12"));
            }
        }
        Pack checked = new Pack("react", "React", "obdx-react", "0.2.0", "migration", "", "starter", "", "", List.of(),
                List.of(new ComponentRegistry.Built("card", "src", "Card")), Map.of("card", passed), List.of());
        assertThat(service.inPack(card, checked).readiness()).isEqualTo("available");
        Map<String, Gate> oneFailed = new LinkedHashMap<>(passed);
        oneFailed.put("visual", new Gate("failed", "ci #13"));
        Pack failing = new Pack("react", "React", "obdx-react", "0.2.0", "migration", "", "starter", "", "", List.of(),
                List.of(new ComponentRegistry.Built("card", "src", "Card")), Map.of("card", oneFailed), List.of());
        assertThat(service.inPack(card, failing).readiness()).isEqualTo("in-test");
    }

    @Test
    void thePremiumJetPackIsBuiltForTheJetVersionFoundInTheCode() {
        // OBDX 22.1 ships JET 6.2: the classic build, on the workspace's own elements or the JET 6 equivalents
        ComponentPackService.Catalogue jet6 = service.catalogue(new ComponentPackService.JetFact("JET 6.2.0", "detected", List.of("package.json")));
        assertThat(jet6.jet().build()).isEqualTo("classic");
        assertThat(jet6.jet().major()).isEqualTo(6);
        assertThat(jet6.jet().note()).isEqualTo("Built for JET 6.2.0, found in the code: the Classic JET build.");
        assertThat(find(jet6, "button").packs().get("jet-premium").builtOn()).isEqualTo("oj-button");
        assertThat(find(jet6, "card").packs().get("jet-premium").builtOn()).isEqualTo("own card");
        assertThat(find(jet6, "select").packs().get("jet-premium").builtOn()).isEqualTo("oj-select-one");
        assertThat(jet6.categories()).allSatisfy((c) -> assertThat(c.components()).allSatisfy((v) ->
                assertThat(v.packs().get("jet-premium").builtOn()).doesNotContain("oj-c-")));

        // A newer release, set by hand on the Project Profile, gets the Core Pack build
        ComponentPackService.Catalogue jet19 = service.catalogue(new ComponentPackService.JetFact("JET 19.0.0", "corrected", List.of()));
        assertThat(jet19.jet().build()).isEqualTo("core-pack");
        assertThat(jet19.jet().note()).contains("set on the Project Profile");
        assertThat(find(jet19, "button").packs().get("jet-premium").builtOn()).isEqualTo("oj-c-button");

        // No version found, no workspace, or one older than JET 6: the classic build, and the page says what to do
        assertThat(service.catalogue(new ComponentPackService.JetFact(null, "missing", List.of())).jet())
                .satisfies((t) -> assertThat(t.build()).isEqualTo("classic"))
                .satisfies((t) -> assertThat(t.note()).startsWith("The scan found no Oracle JET version in the code."));
        assertThat(service.catalogue().jet().status()).isEqualTo("no-workspace");
        assertThat(service.catalogue(new ComponentPackService.JetFact("JET 5.1.0", "detected", List.of())).jet().note())
                .contains("older than the pack supports");
    }

    @Test
    void mappingsAreProposalsUntilThereIsEvidence() {
        ComponentPackService.Catalogue c = service.catalogue();
        ComponentPackService.InPack text = find(c, "text-field").packs().get("jet-premium");
        assertThat(text.mapping()).isEqualTo("direct-replacement");
        assertThat(text.mappingConfidence()).isEqualTo("proposed");
        assertThat(find(c, "text-field").packs().get("react").mapping()).isEqualTo("event-mapping");
        assertThat(find(c, "data-grid").packs().get("react").mapping()).isEqualTo("custom-transformation");
        assertThat(find(c, "session-timeout").packs().get("react").mapping()).isEqualTo("manual-intervention");
        assertThat(find(c, "card").packs().get("react").mapping()).isEqualTo("new");
        assertThat(find(c, "overview").packs().get("angular").mapping()).isEqualTo("unsupported");
        assertThat(find(c, "overview").packs().get("react").mapping()).isEqualTo("custom-transformation");
    }

    @Test
    void aStyleIsCheckedBeforeItIsSaved() {
        Style ok = new Style(new Choice("glass", new Motion("glow", "ripple", "none"), "dark", "emerald"),
                Map.of("button", new Choice("brutal", null, null, null)));
        assertThat(service.validate(ok).components()).containsOnlyKeys("button");
        assertThat(service.validate(ComponentPackService.defaultStyle()).defaults().look()).isEqualTo("elevated");
        assertThatThrownBy(() -> service.validate(new Style(new Choice("shiny", new Motion("lift", "press", "fadeup"), "light", "workspace"), Map.of())))
                .isInstanceOf(BadRequestException.class).hasMessageContaining("design option shiny");
        assertThatThrownBy(() -> service.validate(new Style(ComponentPackService.defaultStyle().defaults(), Map.of("no-such", new Choice("pill", null, null, null)))))
                .isInstanceOf(BadRequestException.class).hasMessageContaining("no component no-such");
        assertThatThrownBy(() -> service.validate(new Style(new Choice("pill", new Motion("lift", null, "fadeup"), "light", "workspace"), Map.of())))
                .isInstanceOf(BadRequestException.class).hasMessageContaining("hover, click and scroll");
        assertThatThrownBy(() -> service.validate(null)).isInstanceOf(BadRequestException.class);
    }
}
