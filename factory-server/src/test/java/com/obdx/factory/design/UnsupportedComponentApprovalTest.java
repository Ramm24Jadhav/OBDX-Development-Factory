package com.obdx.factory.design;

import com.obdx.factory.common.ConflictException;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Regression audit A1 and C8: a screen with an element the workspace's version pack forbids is not approved without
 * the approver's confirmation, and a reviewer never receives a custom component's own HTML, CSS or script.
 */
class UnsupportedComponentApprovalTest {

    private final ScreenDesignRepository designs = mock(ScreenDesignRepository.class);
    private final DesignStore store = mock(DesignStore.class);
    private final ComponentCompatibility compatibility = mock(ComponentCompatibility.class);
    private final ScreenDesignService service = new ScreenDesignService(designs, store, null, null, null, null, null, compatibility);

    private static ScreenModel.Component component(String id, String type, String component, String html, String script) {
        return new ScreenModel.Component(id, type, id, id, false, null, null, null, null, List.of(), List.of(), false, component, Map.of(),
                html, html == null ? null : ".x{}", script, null, null, null);
    }

    private static ScreenModel model(ScreenModel.Component... components) {
        return new ScreenModel("Quick transfer", "Quick transfer", null, "new", List.of(new ScreenModel.Section("s-1", "S", 1, List.of(components))),
                List.of(new ScreenModel.ActionButton("a-1", "Send", "primary")), "initiate", List.of());
    }

    private ScreenDesign design(ScreenModel model) {
        ScreenDesign design = new ScreenDesign(UUID.randomUUID(), UUID.randomUUID(), "Quick transfer");
        when(designs.findById(design.getId())).thenReturn(Optional.of(design));
        when(designs.save(any())).thenAnswer(call -> call.getArgument(0));
        when(store.model(any(), anyInt())).thenReturn(Optional.of(model));
        return design;
    }

    private static final ComponentCompatibility.Entry SELECT_ONE = new ComponentCompatibility.Entry("oj-select-one",
            ComponentCompatibility.Status.UNSUPPORTED, "Version pack rule \"oj-select-single instead of oj-select-one\": deprecated");

    @Test
    void approvalIsRefusedNamingTheElementUntilConfirmed() {
        ScreenDesign design = design(model(component("payee", "component", "oj-select-one", null, null)));
        when(compatibility.unsupported(any(), any())).thenReturn(List.of(SELECT_ONE));

        assertThatThrownBy(() -> service.approve(design.getId(), "Lead")).isInstanceOf(ConflictException.class)
                .hasMessageStartingWith(ScreenDesignService.UNSUPPORTED + "the workspace's version pack forbids oj-select-one (Version pack rule");
        assertThat(design.getStatus()).isNotEqualTo(ScreenDesign.Status.APPROVED);
        verify(designs, never()).save(any());

        ScreenDesignService.Approved approved = service.approve(design.getId(), "Lead", true);
        assertThat(design.getStatus()).isEqualTo(ScreenDesign.Status.APPROVED);
        assertThat(approved.unsupported()).containsExactly("oj-select-one");
    }

    @Test
    void aReviewerCannotApproveAScreenWithUnsupportedElements() {
        ScreenDesign design = design(model(component("payee", "component", "oj-select-one", null, null)));
        when(designs.findByReviewToken("tok")).thenReturn(Optional.of(design));
        when(compatibility.unsupported(any(), any())).thenReturn(List.of(SELECT_ONE));

        assertThatThrownBy(() -> service.reviewApprove("tok", "Customer")).isInstanceOf(ConflictException.class)
                .hasMessageStartingWith(ScreenDesignService.UNSUPPORTED).hasMessageContaining("bank's team")
                .hasMessageNotContaining("Version pack rule");
        assertThat(design.getStatus()).isNotEqualTo(ScreenDesign.Status.APPROVED);
        verify(store, never()).addComment(any(), anyInt(), any(), any(), org.mockito.ArgumentMatchers.anyBoolean(), any(), any());
    }

    @Test
    void aScreenWithSupportedElementsIsApprovedAtOnce() {
        ScreenDesign design = design(model(component("amount", "amount", null, null, null)));
        when(compatibility.unsupported(any(), any())).thenReturn(List.of());

        assertThat(service.approve(design.getId(), "Lead", false).unsupported()).isEmpty();
        assertThat(design.getStatus()).isEqualTo(ScreenDesign.Status.APPROVED);
    }

    @Test
    void theElementsAreThoseCodeGenerationUses() {
        ScreenModel screen = model(component("payee", "component", "OJ-Select-One", null, null), component("amount", "amount", null, null, null),
                component("from", "select", null, null, null), component("blank", "component", " ", null, null));
        assertThat(ComponentCompatibility.elements(screen)).containsExactly("oj-select-one", "oj-input-number", "oj-select-single", "oj-button");
        assertThat(ComponentCompatibility.elements(null)).isEmpty();
    }

    @Test
    void reviewersGetAPlaceholderForACustomComponentNotItsCode() {
        ScreenModel screen = model(component("widget", "component", "bank-widget", "<div>secret markup</div>", "doSomethingInternal()"),
                component("amount", "amount", null, null, null));
        ScreenModel shown = ScreenDesignService.forReviewer(screen);
        ScreenModel.Component widget = shown.sections().getFirst().components().getFirst();
        assertThat(widget.html()).isNull();
        assertThat(widget.css()).isNull();
        assertThat(widget.script()).isNull();
        assertThat(widget.component()).isEqualTo("bank-widget");
        assertThat(widget.label()).isEqualTo("widget");
        assertThat(shown.toString()).doesNotContain("secret markup").doesNotContain("doSomethingInternal");
        // an ordinary component is passed as it is
        assertThat(shown.sections().getFirst().components().get(1)).isEqualTo(screen.sections().getFirst().components().get(1));
    }
}
