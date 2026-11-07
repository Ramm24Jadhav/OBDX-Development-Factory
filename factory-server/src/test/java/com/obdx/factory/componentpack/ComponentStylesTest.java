package com.obdx.factory.componentpack;

import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * bx.css, the stylesheet the four premium packs share, is built from target-packs/components/styles by
 * tools/join-styles.mjs: base.css, kinds/*.css in name order, designs.css, end.css. Every copy must be that join.
 */
class ComponentStylesTest {

    private static final Path COMPONENTS = Path.of("..", "target-packs", "components");
    private static final List<String> COPIES = List.of("react/src/bx.css", "jet-premium/bx/bx.css", "angular/src/bx.css",
            "../angular/starter/src/app/components/bx.css");

    @Test
    void everyCopyOfBxCssIsTheJoinOfItsSources() throws IOException {
        String joined = join();
        for (String copy : COPIES) {
            assertThat(read(COMPONENTS.resolve(copy)))
                    .as(copy + " is out of date: run node target-packs/components/tools/join-styles.mjs")
                    .isEqualTo(joined);
        }
    }

    @Test
    void everyKindFileIsACatalogueKindOrASharedPart() throws IOException {
        String catalogue = Files.readString(COMPONENTS.resolve("catalogue.json"));
        try (Stream<Path> kinds = Files.list(COMPONENTS.resolve("styles/kinds"))) {
            for (String name : kinds.map(p -> p.getFileName().toString().replace(".css", "")).toList()) {
                // _name is a part several kinds share (fields, panels, cards), joined before the kinds that build on it
                if (name.startsWith("_") || name.equals("text-effects")) { continue; }
                assertThat(catalogue).as("styles/kinds/" + name + ".css names no catalogue kind").contains("\"kind\": \"" + name + "\"");
            }
        }
    }

    @Test
    void everyDesignSetsTheSharedSettingsAndTheKindsReadThem() throws IOException {
        String designs = read(COMPONENTS.resolve("styles/designs.css"));
        for (String look : List.of("soft", "glass", "outline", "vivid", "pill", "brutal", "redwood", "liquid")) {
            int at = designs.indexOf(".bx-look-" + look + " {");
            assertThat(at).as(look + " has no settings block").isGreaterThanOrEqualTo(0);
            String block = designs.substring(at, designs.indexOf('}', at));
            assertThat(block.split("--bx-", -1).length - 1).as(look + " sets too few shared settings").isGreaterThanOrEqualTo(3);
        }
        // a fixed edge or corner would not follow the design
        try (Stream<Path> kinds = Files.list(COMPONENTS.resolve("styles/kinds"))) {
            for (Path kind : kinds.toList()) {
                assertThat(read(kind)).as(kind.getFileName() + ": use var(--bx-bw) and var(--bx-rule) or var(--bx-border*)")
                        .doesNotContain("1px solid var(--bx-border").doesNotContain("border-radius: 18px");
            }
        }
    }

    static String join() throws IOException {
        Path styles = COMPONENTS.resolve("styles");
        List<Path> parts = new ArrayList<>();
        parts.add(styles.resolve("base.css"));
        try (Stream<Path> kinds = Files.list(styles.resolve("kinds"))) {
            kinds.filter(p -> p.toString().endsWith(".css")).sorted((a, b) -> a.getFileName().toString().compareTo(b.getFileName().toString())).forEach(parts::add);
        }
        parts.add(styles.resolve("designs.css"));
        parts.add(styles.resolve("end.css"));
        StringBuilder css = new StringBuilder();
        for (Path p : parts) { css.append(read(p)); }
        return css.toString();
    }

    private static String read(Path p) throws IOException {
        return Files.readString(p).replace("\r\n", "\n");
    }
}
