package com.obdx.factory.importing;

import com.obdx.factory.auth.AccessGuard;
import com.obdx.factory.auth.WorkspaceRole.Permission;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.io.IOException;
import java.util.List;
import java.util.UUID;

/** The indexed files of a workspace and their content (Knowledge Explorer). */
@RestController
@RequestMapping("/api/workspaces/{workspaceId}/files")
public class CodeFileController {

    private final CodeFiles files;
    private final AccessGuard guard;

    public CodeFileController(CodeFiles files, AccessGuard guard) {
        this.files = files;
        this.guard = guard;
    }

    @GetMapping
    public List<CodeFiles.FileEntry> list(@PathVariable UUID workspaceId, @RequestParam(defaultValue = "") String q,
                                          @RequestParam(defaultValue = "5000") int limit) {
        guard.require(workspaceId, Permission.VIEW);
        return files.list(workspaceId, q, limit);
    }

    @GetMapping("/content")
    public CodeFiles.FileContent content(@PathVariable UUID workspaceId, @RequestParam String path) throws IOException {
        guard.require(workspaceId, Permission.VIEW);
        return files.content(workspaceId, path);
    }
}
