package com.obdx.factory.pack;

import com.obdx.factory.common.NotFoundException;
import com.obdx.factory.profile.ProjectProfileService;
import com.obdx.factory.target.TargetPacks;
import com.obdx.factory.workspace.Workspace;
import com.obdx.factory.workspace.WorkspaceRepository;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/** The Modernization page reads the rules of the version an upgrade moves to, for a workspace still on the older one. */
class ChecksForVersionTest {

    private final UUID id = UUID.randomUUID();
    private final PackService service;

    ChecksForVersionTest() {
        VersionPacks packs = VersionPacks.builtIn();
        TargetPacks targets = TargetPacks.builtIn();
        WorkspaceRepository workspaces = mock(WorkspaceRepository.class);
        when(workspaces.findById(id)).thenReturn(Optional.of(new Workspace("bank-a", "Bank A", "22.x", "file:///repo")));
        ProjectProfileService profiles = mock(ProjectProfileService.class);
        when(profiles.get(id)).thenThrow(new NotFoundException("No project profile yet."));
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.queryForList(anyString(), eq(String.class), eq(id))).thenReturn(List.of("jet-no-select-one"));
        service = new PackService(packs, targets, new LocalChecks(packs, targets), workspaces, profiles, jdbc);
    }

    @Test
    void withoutAVersionTheWorkspacesOwnPackApplies() {
        PackService.WorkspaceChecks own = service.get(id);
        assertThat(own.version()).isEqualTo("22.x");
        assertThat(own.rules()).extracting(PackService.RuleView::id).contains("ui-no-vdom-22").doesNotContain("jet-no-select-one");
        assertThat(service.get(id, " ").version()).isEqualTo("22.x");
    }

    @Test
    void theTargetVersionsRulesComeWithTheWorkspacesOwnSettings() {
        PackService.WorkspaceChecks target = service.get(id, "25.x");
        assertThat(target.version()).isEqualTo("25.x");
        assertThat(target.javaLevel()).isEqualTo(11);
        assertThat(target.rules()).extracting(PackService.RuleView::id).contains("jet-no-select-one").doesNotContain("ui-no-vdom-22");
        // A rule the workspace turned off stays off on the other version
        assertThat(target.rules()).filteredOn(r -> r.id().equals("jet-no-select-one")).singleElement()
                .extracting(PackService.RuleView::enabled).isEqualTo(false);
    }

    @Test
    void anUnknownVersionIsNotFound() {
        assertThatThrownBy(() -> service.get(id, "19.x")).isInstanceOf(NotFoundException.class);
    }
}
