package com.obdx.factory.pack;

import com.obdx.factory.auth.AccessGuard;
import com.obdx.factory.auth.AuditLog;
import com.obdx.factory.auth.WorkspaceRole.Permission;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
public class PackController {

    public record RuleRequest(Boolean enabled) {
    }

    public record ExampleRequest(String path) {
    }

    private final PackService service;
    private final RecipeService recipes;
    private final AccessGuard guard;
    private final AuditLog audit;

    public PackController(PackService service, RecipeService recipes, AccessGuard guard, AuditLog audit) {
        this.service = service;
        this.recipes = recipes;
        this.guard = guard;
        this.audit = audit;
    }

    @GetMapping("/api/workspaces/{workspaceId}/checks")
    public PackService.WorkspaceChecks get(@PathVariable UUID workspaceId) {
        guard.require(workspaceId, Permission.VIEW);
        return service.get(workspaceId);
    }

    @PutMapping("/api/workspaces/{workspaceId}/checks/{ruleId}")
    public PackService.WorkspaceChecks setEnabled(@PathVariable UUID workspaceId, @PathVariable String ruleId,
                                                  @RequestBody RuleRequest request) {
        var user = guard.require(workspaceId, Permission.MANAGE_CODE);
        boolean enabled = !Boolean.FALSE.equals(request.enabled());
        PackService.WorkspaceChecks result = service.setEnabled(workspaceId, ruleId, enabled, user.getUsername());
        audit.record(enabled ? "CHECK_RULE_ENABLED" : "CHECK_RULE_DISABLED", workspaceId, ruleId, null);
        return result;
    }

    @GetMapping("/api/workspaces/{workspaceId}/recipes")
    public RecipeService.WorkspaceRecipes recipes(@PathVariable UUID workspaceId) {
        guard.require(workspaceId, Permission.VIEW);
        return recipes.get(workspaceId);
    }

    @PostMapping("/api/workspaces/{workspaceId}/recipes/{recipeId}/parts/{partId}/examples")
    public RecipeService.WorkspaceRecipes pin(@PathVariable UUID workspaceId, @PathVariable String recipeId, @PathVariable String partId,
                                              @RequestBody ExampleRequest request) {
        var user = guard.require(workspaceId, Permission.MANAGE_CODE);
        RecipeService.WorkspaceRecipes result = recipes.pin(workspaceId, recipeId, partId, request.path(), user.getUsername());
        audit.record("REFERENCE_EXAMPLE_PINNED", workspaceId, recipeId + "/" + partId, request.path());
        return result;
    }

    @DeleteMapping("/api/workspaces/{workspaceId}/recipes/{recipeId}/parts/{partId}/examples")
    public RecipeService.WorkspaceRecipes unpin(@PathVariable UUID workspaceId, @PathVariable String recipeId, @PathVariable String partId,
                                                @RequestParam String path) {
        guard.require(workspaceId, Permission.MANAGE_CODE);
        RecipeService.WorkspaceRecipes result = recipes.unpin(workspaceId, recipeId, partId, path);
        audit.record("REFERENCE_EXAMPLE_UNPINNED", workspaceId, recipeId + "/" + partId, path);
        return result;
    }
}
