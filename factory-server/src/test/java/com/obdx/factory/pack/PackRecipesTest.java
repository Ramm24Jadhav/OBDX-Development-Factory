package com.obdx.factory.pack;

import com.obdx.factory.common.NotFoundException;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** The Prompt Library compares a recipe between OBDX versions from the packs themselves, without a workspace. */
class PackRecipesTest {

    private final RecipeService service = new RecipeService(VersionPacks.builtIn(), null, null, null, null, null);

    @Test
    void eachVersionPackListsItsOwnRecipesWithoutExamples() {
        RecipeService.WorkspaceRecipes v22 = service.packRecipes("22.x");
        RecipeService.WorkspaceRecipes v25 = service.packRecipes("25.x");

        assertThat(v22.version()).isEqualTo("22.x");
        assertThat(v25.version()).isEqualTo("25.x");
        assertThat(v22.recipes()).isNotEmpty();
        assertThat(v22.recipes()).allSatisfy(r -> {
            assertThat(r.source()).isNotBlank();
            assertThat(r.parts()).allSatisfy(p -> assertThat(p.examples()).isEmpty());
        });
        // The common recipes are in both packs, under the same ids
        assertThat(v25.recipes()).extracting(RecipeService.RecipeView::id)
                .containsAll(v22.recipes().stream().filter(r -> r.source().endsWith("recipes.yml")).map(RecipeService.RecipeView::id).toList());
    }

    @Test
    void anUnknownVersionIsNotFound() {
        assertThatThrownBy(() -> service.packRecipes("19.x")).isInstanceOf(NotFoundException.class);
    }
}
