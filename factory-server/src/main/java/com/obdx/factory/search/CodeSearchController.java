package com.obdx.factory.search;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
public class CodeSearchController {

    private final CodeSearchService service;

    public CodeSearchController(CodeSearchService service) {
        this.service = service;
    }

    @GetMapping("/api/workspaces/{workspaceId}/search")
    public CodeSearchService.SearchResponse search(@PathVariable UUID workspaceId,
                                                   @RequestParam("q") String query,
                                                   @RequestParam(defaultValue = "20") int limit) {
        return service.search(workspaceId, query, limit);
    }
}
