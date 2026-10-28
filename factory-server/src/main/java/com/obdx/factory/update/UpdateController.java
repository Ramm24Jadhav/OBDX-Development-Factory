package com.obdx.factory.update;

import com.obdx.factory.auth.AccessGuard;
import com.obdx.factory.auth.AuditLog;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** The factory's version, and updating it (administrators). */
@RestController
public class UpdateController {

    private final UpdateService service;
    private final AccessGuard guard;
    private final AuditLog audit;

    public UpdateController(UpdateService service, AccessGuard guard, AuditLog audit) {
        this.service = service;
        this.guard = guard;
        this.audit = audit;
    }

    @GetMapping("/api/update")
    public UpdateService.Status status(@RequestParam(defaultValue = "false") boolean check) {
        if (check) {
            guard.requireAdmin();
        }
        return service.status(check);
    }

    @PostMapping("/api/update")
    public UpdateService.Status update() {
        guard.requireAdmin();
        UpdateService.Status status = service.update();
        audit.record("FACTORY_UPDATE_STARTED", null, status.latestBuild(), "From build " + status.build());
        return status;
    }
}
