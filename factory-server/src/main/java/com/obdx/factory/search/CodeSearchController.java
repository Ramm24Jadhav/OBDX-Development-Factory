package com.obdx.factory.search;

import com.obdx.factory.auth.WorkspaceRole.Permission;
import com.obdx.factory.auth.AccessGuard;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
public class CodeSearchController {

    private final CodeSearchService service;
    private final AccessGuard guard;

    public CodeSearchController(CodeSearchService service, AccessGuard guard) {
        this.service = service;
        this.guard = guard;
    }

    @GetMapping("/api/workspaces/{workspaceId}/search")
    public CodeSearchService.SearchResponse search(@PathVariable UUID workspaceId,
                                                   @RequestParam("q") String query,
                                                   @RequestParam(defaultValue = "20") int limit) {
        guard.require(workspaceId, Permission.VIEW);
        return service.search(workspaceId, query, limit);
    }
}
