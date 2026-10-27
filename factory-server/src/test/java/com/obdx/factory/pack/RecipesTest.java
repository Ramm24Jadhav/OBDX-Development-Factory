package com.obdx.factory.pack;

import com.obdx.factory.change.FileChecks;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class RecipesTest {

    private final VersionPacks packs = VersionPacks.builtIn();

    @Test
    void builtInRecipesLoadWithTemplates() {
        VersionPack pack = packs.find("22.x").orElseThrow();
        assertThat(pack.recipes()).extracting(Recipe::id).containsExactly("ui-new-screen", "ui-enhance-screen", "service-new",
                "service-enhance", "integration-adapter", "data-script", "unit-test");
        Recipe screen = pack.recipe("ui-new-screen").orElseThrow();
        assertThat(screen.parts()).extracting(Recipe.Part::id).containsExactly("view-model", "view", "resource-bundle");
        assertThat(screen.parts()).allSatisfy(part -> assertThat(part.content()).contains("<<"));
        assertThat(packs.find("25.x").orElseThrow().recipes()).hasSize(7);
    }

    @Test
    void planItemsMatchTheRightRecipePart() {
        VersionPack pack = packs.find("25.x").orElseThrow();
        assertThat(match(pack, "ui/ext/js/viewModels/remarks.js", "create", "ui")).isEqualTo("ui-new-screen/view-model");
        assertThat(match(pack, "ui/ext/js/resources/nls/remarks.js", "create", "ui")).isEqualTo("ui-new-screen/resource-bundle");
        assertThat(match(pack, "ui/js/views/fund-transfer.html", "modify", "ui")).isEqualTo("ui-enhance-screen/view");
        assertThat(match(pack, "backend/src/com/bank/RemarksValidator.java", "create", "service")).isEqualTo("service-new/java");
        assertThat(match(pack, "db/patches/ADD_REMARKS.sql", "modify", "data")).isEqualTo("data-script/sql");
        assertThat(match(pack, "backend/test/com/bank/RemarksValidatorTest.java", "create", "test")).isEqualTo("unit-test/test");
        assertThat(pack.recipeFor("ui/js/appController.js", "modify", "config")).isEmpty();
    }

    @Test
    void uiTemplatesFollowThePackRules() {
        VersionPack pack = packs.find("22.x").orElseThrow();
        LocalChecks checks = new LocalChecks(packs);
        CheckScope scope = new CheckScope("22.x", Map.of(), Set.of());
        Recipe screen = pack.recipe("ui-new-screen").orElseThrow();
        // The view's only findings may be the basic tag check; no rule may fire on the template itself.
        assertThat(checks.check(scope, "ui/views/remarks.html", null, screen.part("view").content()).message()).isNull();
        assertThat(checks.check(scope, "ui/viewModels/remarks.js", null, screen.part("view-model").content()).status())
                .isEqualTo(FileChecks.Status.PASSED);
    }

    @Test
    void teamRecipesReplaceBuiltInOnesWithTheirOwnTemplates(@TempDir Path dir) throws IOException {
        Files.createDirectories(dir.resolve("templates"));
        Files.writeString(dir.resolve("templates/bank-service.java"), "package com.bank;\n\npublic class <<Name>> extends BankService {\n}\n");
        Files.writeString(dir.resolve("recipes.yml"), """
                recipes:
                  - id: service-new
                    title: New bank service
                    when: Always extend BankService.
                    match: {action: create, layer: service}
                    guidance: Extend com.bank.BankService.
                    parts:
                      - id: java
                        files: ["**/*.java"]
                        template: templates/bank-service.java
                        examples: {files: ["**/bank/**/*Service.java"], count: 1}
                  - id: unit-test
                    enabled: false
                """);
        VersionPacks team = new VersionPacks(new PackProperties(dir.toString()));
        VersionPack pack = team.find("22.x").orElseThrow();

        assertThat(pack.recipes()).extracting(Recipe::id).doesNotContain("unit-test").contains("service-new", "data-script");
        Recipe service = pack.recipe("service-new").orElseThrow();
        assertThat(service.title()).isEqualTo("New bank service");
        assertThat(service.parts().getFirst().content()).contains("extends BankService");
        assertThat(service.parts().getFirst().examples().count()).isEqualTo(1);
        assertThat(service.source()).endsWith("recipes.yml");

        Files.writeString(dir.resolve("recipes.yml"), """
                recipes:
                  - id: broken
                    title: Broken
                    guidance: x
                    match: {layer: frontend}
                    parts: [{id: js, files: ["*"]}]
                """);
        assertThatThrownBy(() -> new VersionPacks(new PackProperties(dir.toString()))).hasMessageContaining("recipe broken: match.layer");
        Files.writeString(dir.resolve("recipes.yml"), """
                recipes:
                  - id: missing
                    title: Missing template
                    guidance: x
                    parts: [{id: js, files: ["*"], template: templates/nope.js}]
                """);
        assertThatThrownBy(() -> new VersionPacks(new PackProperties(dir.toString()))).hasMessageContaining("template not found: templates/nope.js");
    }

    private static String match(VersionPack pack, String path, String action, String layer) {
        return pack.recipeFor(path, action, layer).map(m -> m.recipe().id() + "/" + m.part().id()).orElse(null);
    }
}
