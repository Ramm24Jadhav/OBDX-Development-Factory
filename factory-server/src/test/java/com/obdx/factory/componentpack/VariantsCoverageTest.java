package com.obdx.factory.componentpack;

import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * variants.json lists every catalogue component's style variants and the packs each is built in. A variant listed as
 * built for a pack must be in that pack's code (the bx-v-&lt;id&gt; class for the web packs, the id as a value in the pack's
 * source) and in its gallery (an element marked data-variant="&lt;id&gt;", or &lt;Variant id="&lt;id&gt;"&gt; in React Native, in the
 * component's section, passing variant="&lt;id&gt;"), so the Component factory card and the gates can show it.
 */
class VariantsCoverageTest {

    private static final Path COMPONENTS = Path.of("..", "target-packs", "components");
    private static final List<String> PACKS = List.of("jet-premium", "react", "angular", "react-native");
    private static final Pattern ID = Pattern.compile("[a-z0-9]+(-[a-z0-9]+)*");

    private final JsonMapper json = JsonMapper.builder().build();

    @Test
    void everyCatalogueComponentHasItsVariantsAndMotion() throws IOException {
        JsonNode variants = json.readTree(COMPONENTS.resolve("variants.json").toFile()).path("components");
        Map<String, String> kinds = catalogueKinds();
        assertThat(variants.properties().stream().map(Map.Entry::getKey).collect(Collectors.toSet())).isEqualTo(kinds.keySet());
        for (Map.Entry<String, JsonNode> c : variants.properties()) {
            String id = c.getKey();
            JsonNode node = c.getValue();
            assertThat(node.path("kind").asString()).as(id + " kind").isEqualTo(kinds.get(id));
            assertThat(node.path("wave").asString()).as(id + " wave").matches("V[1-6]");
            for (String m : List.of("enter", "hover", "press", "change")) { assertThat(node.path("motion").has(m)).as(id + " motion." + m).isTrue(); }
            List<String> ids = new ArrayList<>();
            for (JsonNode v : node.path("variants")) {
                ids.add(v.path("id").asString());
                assertThat(v.path("id").asString()).as(id).matches(ID);
                for (String field : List.of("name", "purpose", "pattern", "source", "licence")) {
                    assertThat(v.path(field).asString()).as(id + "/" + v.path("id").asString() + " " + field).isNotBlank();
                }
                for (JsonNode p : v.path("built")) { assertThat(PACKS).as(id + " built").contains(p.asString()); }
            }
            assertThat(ids).as(id + " variants").first().isEqualTo("default");
            assertThat(new HashSet<>(ids)).as(id + " variant ids are unique").hasSize(ids.size());
        }
    }

    @Test
    void aVariantBuiltForAPackIsInThatPacksCodeAndGallery() throws IOException {
        JsonNode variants = json.readTree(COMPONENTS.resolve("variants.json").toFile()).path("components");
        String styles = readAll(COMPONENTS.resolve("styles/kinds"));
        Map<String, String> sources = Map.of("jet-premium", readAll(COMPONENTS.resolve("jet-premium/bx")), "react", readAll(COMPONENTS.resolve("react/src")),
                "angular", readAll(COMPONENTS.resolve("angular/src")), "react-native", readAll(COMPONENTS.resolve("react-native/src")));
        Map<String, String> galleries = Map.of("jet-premium", read(COMPONENTS.resolve("gates/jet-gallery.html")), "react", read(COMPONENTS.resolve("react/gallery/gallery.tsx")),
                "angular", read(COMPONENTS.resolve("angular/gallery/main.ts")),
                "react-native", read(COMPONENTS.resolve("react-native/gates/gallery.tsx")) + "\n" + read(COMPONENTS.resolve("react-native/gates/samples.tsx")));
        List<String> missing = new ArrayList<>();
        int checked = 0;
        for (Map.Entry<String, JsonNode> c : variants.properties()) {
            for (JsonNode v : c.getValue().path("variants")) {
                String id = v.path("id").asString();
                if (id.equals("default")) { continue; }
                for (JsonNode p : v.path("built")) {
                    String pack = p.asString();
                    String where = c.getKey() + " · " + id + " in " + pack + ": ";
                    checked++;
                    if (!pack.equals("react-native") && !styles.contains(".bx-v-" + id)) { missing.add(where + "no .bx-v-" + id + " rule in styles/kinds"); }
                    if (!pack.equals("jet-premium") && !sources.get(pack).contains("'" + id + "'") && !sources.get(pack).contains("\"" + id + "\"")) {
                        missing.add(where + "the variant prop does not take '" + id + "'");
                    }
                    String section = section(galleries.get(pack), pack, c.getKey());
                    String marker = pack.equals("react-native") ? "<Variant id=\"" + id + "\"" : "data-variant=\"" + id + "\"";
                    // the prop itself, not the data-variant marker
                    boolean passed = section != null && Pattern.compile("(?<![-\\w])variant=\""+ Pattern.quote(id) + "\"").matcher(section).find();
                    if (section == null || !section.contains(marker) || !passed) {
                        missing.add(where + "its gallery section has no " + marker + " element passing variant=\"" + id + "\"");
                    }
                }
            }
        }
        assertThat(missing).as("variants listed as built but missing").isEmpty();
        assertThat(checked).as("the worked example (card · outlined) is built in all four packs").isGreaterThanOrEqualTo(4);
    }

    /** The component's section in a pack's gallery source, or null. */
    static String section(String gallery, String pack, String component) {
        String start = switch (pack) {
            case "react", "react-native" -> "<Section id=\"" + component + "\"";
            default -> "data-component=\"" + component + "\"";
        };
        int at = gallery.indexOf(start);
        if (at < 0 && pack.equals("react-native")) {
            // a sample from samples.tsx: 'id': ["Title", <Component ... />],
            Matcher m = Pattern.compile("\\n\\s*'" + Pattern.quote(component) + "': \\[").matcher(gallery);
            if (!m.find()) { return null; }
            int end = gallery.indexOf("\n  '", m.end());
            return gallery.substring(m.start(), end < 0 ? gallery.length() : end);
        }
        if (at < 0) { return null; }
        int end = gallery.indexOf(pack.equals("react") || pack.equals("react-native") ? "</Section>" : "</section>", at);
        return gallery.substring(at, end < 0 ? gallery.length() : end);
    }

    private Map<String, String> catalogueKinds() throws IOException {
        Map<String, String> kinds = new HashMap<>();
        for (JsonNode category : json.readTree(COMPONENTS.resolve("catalogue.json").toFile()).path("categories")) {
            for (JsonNode c : category.path("components")) { kinds.put(c.path("id").asString(), c.path("kind").asString()); }
        }
        return kinds;
    }

    private static String readAll(Path dir) throws IOException {
        StringBuilder all = new StringBuilder();
        try (Stream<Path> files = Files.walk(dir)) {
            for (Path f : files.filter(Files::isRegularFile).filter(f -> f.toString().matches(".*\\.(js|ts|tsx|css)$")).toList()) { all.append(read(f)).append('\n'); }
        }
        return all.toString();
    }

    private static String read(Path p) throws IOException {
        return Files.readString(p).replace("\r\n", "\n");
    }
}
