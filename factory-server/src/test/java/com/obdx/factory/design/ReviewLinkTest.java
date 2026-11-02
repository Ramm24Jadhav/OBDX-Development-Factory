package com.obdx.factory.design;

import org.junit.jupiter.api.Test;

import java.lang.reflect.RecordComponent;
import java.time.OffsetDateTime;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

/**
 * What a customer review link shows: only the shared screen and what was said through review links; never ids, the
 * team's comments, who on the team resolved what, or where the screen's values are loaded from.
 */
class ReviewLinkTest {

    @Test
    void theReviewAnswerHasOnlyTheSharedScreenAndReviewComments() {
        Set<String> view = names(ScreenDesignService.ReviewView.class.getRecordComponents());
        assertThat(view).containsExactlyInAnyOrder("name", "status", "version", "model", "comments", "expiresAt", "approvedBy",
                "approvedAt", "preview");
        Set<String> comment = names(ScreenDesignService.ReviewComment.class.getRecordComponents());
        assertThat(comment).doesNotContain("id", "resolvedBy", "fromReview", "designId", "workspaceId");
    }

    @Test
    void whereValuesAreLoadedFromStaysInternal() {
        ScreenModel.Component accounts = new ScreenModel.Component("c-from", "select", "fromAccount", "From account", true, null, null,
                null, null, List.of(), List.of(), false, "account-input", Map.of("type", "CSA"), null, null, null,
                new ScreenModel.DataSource("GET /digx/v1/accounts/demandDeposit", "accounts", "id.value", "displayName"), null, null);
        ScreenModel.Component amount = new ScreenModel.Component("c-amount", "amount", "amount", "Amount", true, null, null, null, null,
                List.of(), List.of(), false);
        ScreenModel model = new ScreenModel("Transfer", "Transfer", null, "new",
                List.of(new ScreenModel.Section("s-1", "Details", 1, List.of(accounts, amount))),
                List.of(new ScreenModel.ActionButton("a-1", "Submit", "primary")), "initiate", List.of("desktop"));

        ScreenModel shown = ScreenDesignService.forReviewer(model);

        assertThat(shown.sections().getFirst().components()).extracting(ScreenModel.Component::dataSource).containsOnlyNulls();
        assertThat(shown.sections().getFirst().components().getFirst().label()).isEqualTo("From account");
        assertThat(shown.sections().getFirst().components().get(1)).isEqualTo(amount);
        assertThat(shown.actions()).isEqualTo(model.actions());
        assertThat(shown.stage()).isEqualTo("initiate");
        assertThat(shown.toString()).doesNotContain("/digx/");
    }

    @Test
    void reviewersSeeOnlyReviewCommentsAndNotWhoResolvedThem() {
        OffsetDateTime now = OffsetDateTime.now();
        List<DesignStore.Comment> comments = List.of(
                new DesignStore.Comment(UUID.randomUUID(), 1, null, "Asha (team)", false, "Internal: check the limits API", now),
                new DesignStore.Comment(UUID.randomUUID(), 1, "c-amount", "Priya (Bank A)", true, "Show the currency", now,
                        DesignStore.Kind.COMMENT, "Asha (team)", now),
                new DesignStore.Comment(UUID.randomUUID(), 1, null, "Priya (Bank A)", true, "Approved version 1.", now,
                        DesignStore.Kind.APPROVAL, null, null));

        List<ScreenDesignService.ReviewComment> shown = ScreenDesignService.forReviewer(comments);

        assertThat(shown).extracting(ScreenDesignService.ReviewComment::text).containsExactly("Show the currency", "Approved version 1.");
        assertThat(shown.getFirst().resolved()).isTrue();
        assertThat(shown.getFirst().componentId()).isEqualTo("c-amount");
        assertThat(shown.get(1).kind()).isEqualTo(DesignStore.Kind.APPROVAL);
        assertThat(shown.toString()).doesNotContain("Asha");
    }

    @Test
    void linksCannotBeGuessed() {
        ScreenDesignService service = new ScreenDesignService(mock(ScreenDesignRepository.class), null, null, null, null, null, null, null);
        Set<String> tokens = new HashSet<>();
        for (int i = 0; i < 1000; i++) {
            String token = service.newToken();
            assertThat(token).matches("[A-Za-z0-9_-]{32}");
            tokens.add(token);
        }
        assertThat(tokens).hasSize(1000);
    }

    private static Set<String> names(RecordComponent[] components) {
        return new HashSet<>(Arrays.stream(components).map(RecordComponent::getName).toList());
    }
}
