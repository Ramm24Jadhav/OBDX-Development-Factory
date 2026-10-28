package com.obdx.factory.source;

import com.obdx.factory.auth.AccessGuard;
import com.obdx.factory.auth.AuditLog;
import com.obdx.factory.svn.SvnCredentials;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Choosing where a new workspace's code comes from (administrators, who create workspaces). */
@RestController
@RequestMapping("/api/sources")
public class SourceController {

    public record UrlRequest(String svnUrl, String svnUsername, String svnPassword) {
    }

    public record FolderRequest(String path, String name) {
    }

    private final SourceService service;
    private final AccessGuard guard;
    private final AuditLog audit;

    public SourceController(SourceService service, AccessGuard guard, AuditLog audit) {
        this.service = service;
        this.guard = guard;
        this.audit = audit;
    }

    @PostMapping("/inspect-url")
    public SourceService.Inspection inspectUrl(@RequestBody UrlRequest request) {
        guard.requireAdmin();
        String username = request.svnUsername() == null || request.svnUsername().isBlank() ? null : request.svnUsername().strip();
        return service.inspectUrl(request.svnUrl(), new SvnCredentials(username, username == null ? null : request.svnPassword()));
    }

    @GetMapping("/local")
    public SourceService.LocalOverview local() {
        guard.requireAdmin();
        return service.overview();
    }

    @GetMapping("/local/folders")
    public SourceService.FolderListing folders(@RequestParam String path) {
        guard.requireAdmin();
        return service.folders(path);
    }

    @PostMapping("/local/inspect")
    public SourceService.Inspection inspectFolder(@RequestBody FolderRequest request) {
        guard.requireAdmin();
        return service.inspectFolder(request.path());
    }

    @PostMapping("/local/repository")
    public SourceService.Inspection createRepository(@RequestBody FolderRequest request) {
        guard.requireAdmin();
        SourceService.Inspection created = service.createRepository(request.path(), request.name());
        audit.record("LOCAL_REPOSITORY_CREATED", null, created.path(), "From " + request.path());
        return created;
    }
}
