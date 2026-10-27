package com.obdx.factory.importing;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/workspaces/{workspaceId}")
public class ImportController {

    private final ImportService service;

    public ImportController(ImportService service) {
        this.service = service;
    }

    @PostMapping("/imports")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public ImportJobResponse start(@PathVariable UUID workspaceId) {
        return service.start(workspaceId);
    }

    @GetMapping("/imports")
    public List<ImportJobResponse> recent(@PathVariable UUID workspaceId, @RequestParam(defaultValue = "10") int limit) {
        return service.recent(workspaceId, limit);
    }

    @GetMapping("/index")
    public ImportService.IndexStatusResponse indexStatus(@PathVariable UUID workspaceId) {
        return service.indexStatus(workspaceId);
    }
}
