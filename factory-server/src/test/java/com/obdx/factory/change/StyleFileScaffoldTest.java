package com.obdx.factory.change;

import com.obdx.factory.componentpack.ComponentPackService;
import com.obdx.factory.componentpack.ComponentPackService.Choice;
import com.obdx.factory.componentpack.ComponentPackService.Motion;
import com.obdx.factory.componentpack.ComponentStyleStore;
import com.obdx.factory.design.DesignStore;
import com.obdx.factory.design.ScreenDesignRepository;
import com.obdx.factory.importing.StorageProperties;
import com.obdx.factory.knowledge.KnowledgeService;
import com.obdx.factory.pack.CheckScope;
import com.obdx.factory.pack.LocalChecks;
import com.obdx.factory.pack.PackService;
import com.obdx.factory.pack.RecipeService;
import com.obdx.factory.profile.ProjectProfileService;
import com.obdx.factory.requirements.RequirementService;
import com.obdx.factory.search.CodeSearchService;
import com.obdx.factory.svn.SvnClient;
import com.obdx.factory.target.ScreenScaffolder;
import com.obdx.factory.target.StarterStyle;
import com.obdx.factory.target.TargetPacks;
import com.obdx.factory.target.TargetService;
import com.obdx.factory.workspace.WorkspaceRepository;
import com.obdx.factory.workspace.WorkspaceService;
import org.junit.jupiter.api.Test;
import org.springframework.core.task.TaskExecutor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.util.unit.DataSize;
import tools.jackson.databind.json.JsonMapper;

import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/** A change that writes a starter's style file writes the workspace's saved component style into it, as it is. */
class StyleFileScaffoldTest {

    private static final Choice LIQUID = new Choice("liquid", new Motion("lift", "press", "fadeup"), "light", "gold");

    private final TargetPacks packs = TargetPacks.builtIn();
    private final ComponentStyleStore styles = mock(ComponentStyleStore.class);
    private final ChangeService service = new ChangeService(mock(ChangeRequestRepository.class), mock(ChangeFileStore.class), mock(WorkspaceRepository.class),
            mock(WorkspaceService.class), mock(RequirementService.class), mock(ScreenDesignRepository.class), mock(DesignStore.class),
            mock(ProjectProfileService.class), mock(CodeSearchService.class), mock(ImpactAnalyzer.class), mock(CodeGenerator.class), mock(SvnClient.class),
            mock(StorageProperties.class), new ChangeProperties(30, 25, DataSize.ofKilobytes(80), 2, "branches/factory", "-"), mock(JdbcTemplate.class),
            JsonMapper.builder().build(), mock(ChangeBuildStore.class), mock(PackService.class), mock(LocalChecks.class), mock(RecipeService.class),
            new TargetService(packs, mock(WorkspaceRepository.class), null, styles), packs, mock(TaskExecutor.class), mock(KnowledgeService.class),
            mock(PlanReviewStore.class), new com.obdx.factory.importing.WorkingCopyLocks(), mock(com.obdx.factory.auth.AuditLog.class));
    private final UUID workspaceId = UUID.randomUUID();

    private ChangeContext context(String target, Set<String> files) {
        return new ChangeContext("Payee", "{}", "[]", "", "", new CheckScope(null, Map.of(), Set.of(), target, "web"), "", target, List.of(), "",
                files::contains);
    }

    @Test
    void theStyleFileOfTheAppIsWrittenFromTheWorkspacesStyle() {
        when(styles.get(workspaceId)).thenReturn(new ComponentStyleStore.SavedStyle(new ComponentPackService.Style(LIQUID, Map.of()), "Dev", null));
        ScreenScaffolder.Scaffold vue = service.scaffold(workspaceId, context("vue", Set.of()), "web/src/component-style.json", "{}");
        assertThat(vue.kind()).isEqualTo(ScreenScaffolder.FIXED);
        assertThat(vue.content()).isEqualTo(StarterStyle.json(LIQUID));
        // a Capacitor app wrapping the Angular app keeps the Angular starter's style file
        ScreenScaffolder.Scaffold wrapped = service.scaffold(workspaceId, context("capacitor", Set.of("web/angular.json")), "web/src/app/component-style.json", null);
        assertThat(wrapped.content()).isEqualTo(StarterStyle.json(LIQUID));
    }

    @Test
    void otherFilesKeepTheirOwnStartingPoint() {
        assertThat(service.scaffold(workspaceId, context("vue", Set.of()), "web/src/style.ts", null)).isNull();
        assertThat(service.scaffold(workspaceId, context("react", Set.of()), "web/src/component-style.json", null)).isNull();
    }
}
