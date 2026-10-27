package com.obdx.factory.profile;

import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/api/workspaces/{workspaceId}/profile")
public class ProjectProfileController {

    private final ProjectProfileService service;

    public ProjectProfileController(ProjectProfileService service) {
        this.service = service;
    }

    @GetMapping
    public ProjectProfileService.ProfileResponse get(@PathVariable UUID workspaceId) {
        return service.get(workspaceId);
    }

    @PostMapping("/refresh")
    public ProjectProfileService.ProfileResponse refresh(@PathVariable UUID workspaceId) {
        return service.refresh(workspaceId);
    }

    /** Confirms (same value as detected) or corrects a fact. */
    @PutMapping("/facts/{key}")
    public ProjectProfileService.ProfileResponse setValue(@PathVariable UUID workspaceId, @PathVariable String key,
                                                          @RequestBody FactValueRequest request) {
        return service.setValue(workspaceId, key, request.value());
    }

    /** Drops the confirmed or corrected value, going back to the detected one. */
    @DeleteMapping("/facts/{key}")
    public ProjectProfileService.ProfileResponse reset(@PathVariable UUID workspaceId, @PathVariable String key) {
        return service.reset(workspaceId, key);
    }

    public record FactValueRequest(String value) {
    }
}
