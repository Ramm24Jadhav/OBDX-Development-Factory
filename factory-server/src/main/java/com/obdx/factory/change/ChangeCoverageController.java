package com.obdx.factory.change;

import com.obdx.factory.auth.AccessGuard;
import com.obdx.factory.auth.WorkspaceRole.Permission;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

/** The Build, Test & Review page's requirement coverage of a change. */
@RestController
public class ChangeCoverageController {

    private final ChangeCoverage coverage;
    private final AccessGuard guard;

    public ChangeCoverageController(ChangeCoverage coverage, AccessGuard guard) {
        this.coverage = coverage;
        this.guard = guard;
    }

    @GetMapping("/api/changes/{id}/coverage")
    public ChangeCoverage.Coverage coverage(@PathVariable UUID id) {
        guard.requireForChange(id, Permission.VIEW);
        return coverage.coverage(id);
    }
}
