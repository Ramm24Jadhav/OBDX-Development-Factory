package com.obdx.factory.target;

import com.obdx.factory.componentpack.ComponentPackService;
import com.obdx.factory.componentpack.ComponentPackService.Choice;
import com.obdx.factory.componentpack.ComponentPackService.Motion;
import com.obdx.factory.componentpack.ComponentStyleStore;
import com.obdx.factory.workspace.Workspace;
import com.obdx.factory.workspace.WorkspaceRepository;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/** The workspace's component style reaches the starters' style files: the starter download writes it. */
class StarterStyleTest {

    private static final Choice LIQUID = new Choice("liquid", new Motion("glow", "ripple", "none"), "dark", "emerald");

    private final TargetPacks packs = TargetPacks.builtIn();
    private final ComponentStyleStore styles = mock(ComponentStyleStore.class);
    private final WorkspaceRepository workspaces = mock(WorkspaceRepository.class);
    private final TargetService service = new TargetService(packs, workspaces, null, styles);
    private final UUID workspaceId = UUID.randomUUID();

    @Test
    void theStyleFileIsTheStylesDefaultsAsJson() {
        JsonNode defaults = JsonMapper.builder().build().readTree(StarterStyle.json(LIQUID)).get("defaults");
        assertThat(defaults.get("look").asString()).isEqualTo("liquid");
        assertThat(defaults.get("motion").get("click").asString()).isEqualTo("ripple");
        assertThat(defaults.get("mode").asString()).isEqualTo("dark");
        assertThat(defaults.get("brand").asString()).isEqualTo("emerald");
        // anything but a plain word falls back, so the file stays valid JSON
        assertThat(StarterStyle.json(new Choice("x\"}", null, null, null))).contains("\"look\": \"elevated\"").contains("\"click\": \"press\"");
    }

    @Test
    void everyStarterThatDrawsTheDesignsShipsTheDefaultStyleInItsStyleFile() {
        String shipped = StarterStyle.json(ComponentPackService.defaultStyle().defaults());
        Map<String, String> files = new HashMap<>();
        for (String id : List.of("vue", "capacitor", "angular", "jet-core-pack", "flutter")) {
            TargetPack pack = packs.find(id).orElseThrow();
            String path = StarterStyle.path(pack).orElseThrow(() -> new AssertionError(id + " has no style file"));
            files.put(id, path);
            assertThat(pack.starter().get(path)).as(id).isEqualToNormalizingNewlines(shipped);
        }
        assertThat(files).containsEntry("angular", "src/app/component-style.json").containsEntry("flutter", "assets/component-style.json");
        assertThat(StarterStyle.path(packs.find("react").orElseThrow())).isEmpty();
    }

    @Test
    void theVueAndCapacitorStartersDrawTheDesignsWithTheSameFiles() {
        // like the packs' bx.css copies: one design, so a fix to one copy must go to the other
        TargetPack vue = packs.find("vue").orElseThrow();
        TargetPack capacitor = packs.find("capacitor").orElseThrow();
        for (String path : List.of("src/components/looks.css", "src/style.ts", "src/component-style.json")) {
            assertThat(vue.starter().get(path)).as(path).isNotNull();
            assertThat(capacitor.starter().get(path)).as(path).isEqualToNormalizingNewlines(vue.starter().get(path));
        }
    }

    @Test
    void theWorkspacesStarterDownloadCarriesItsSavedStyle() throws IOException {
        when(workspaces.findById(workspaceId)).thenReturn(Optional.of(mock(Workspace.class)));
        when(styles.get(workspaceId)).thenReturn(new ComponentStyleStore.SavedStyle(new ComponentPackService.Style(LIQUID, Map.of()), "Dev", null));
        Map<String, String> zip = unzip(service.starterZip("vue", workspaceId));
        assertThat(zip.get("src/component-style.json")).isEqualTo(StarterStyle.json(LIQUID));
        // every other file as the starter ships it
        TargetPack vue = packs.find("vue").orElseThrow();
        assertThat(zip.keySet()).isEqualTo(vue.starter().keySet());
        assertThat(zip.get("src/main.ts")).isEqualTo(vue.starter().get("src/main.ts"));
        // the plain download keeps the default
        assertThat(unzip(service.starterZip("vue")).get("src/component-style.json")).isEqualTo(vue.starter().get("src/component-style.json"));
    }

    @Test
    void aChangeGetsTheStyleFileOnlyForThePacksStyleFilePath() {
        when(styles.get(workspaceId)).thenReturn(new ComponentStyleStore.SavedStyle(new ComponentPackService.Style(LIQUID, Map.of()), "Dev", null));
        TargetPack flutter = packs.find("flutter").orElseThrow();
        assertThat(service.styleFile(workspaceId, flutter, "assets/component-style.json")).contains(StarterStyle.json(LIQUID));
        assertThat(service.styleFile(workspaceId, flutter, "assets/i18n/en.json")).isEmpty();
    }

    private static Map<String, String> unzip(byte[] bytes) throws IOException {
        Map<String, String> files = new HashMap<>();
        try (ZipInputStream zip = new ZipInputStream(new ByteArrayInputStream(bytes))) {
            for (ZipEntry entry = zip.getNextEntry(); entry != null; entry = zip.getNextEntry()) {
                files.put(entry.getName(), new String(zip.readAllBytes(), StandardCharsets.UTF_8));
            }
        }
        return files;
    }
}
