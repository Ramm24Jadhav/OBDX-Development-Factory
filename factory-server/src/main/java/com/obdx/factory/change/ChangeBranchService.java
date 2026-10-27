package com.obdx.factory.change;

import com.obdx.factory.auth.AuditLog;
import com.obdx.factory.common.ConflictException;
import com.obdx.factory.common.NotFoundException;
import com.obdx.factory.svn.SvnClient;
import com.obdx.factory.svn.SvnCredentials;
import com.obdx.factory.workspace.Workspace;
import com.obdx.factory.workspace.WorkspaceRepository;
import com.obdx.factory.workspace.WorkspaceService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Ends the life of a change: closing it as merged or abandoned removes its delivery branch from SVN (the branch stays
 * in the repository history). A scheduled check also closes delivered changes whose branch Subversion's merge
 * tracking reports as fully merged into the workspace's trunk. Only branches the factory created are ever removed.
 */
@Service
public class ChangeBranchService {

    static final String AUTOMATIC = "factory (automatic)";
    private static final Logger log = LoggerFactory.getLogger(ChangeBranchService.class);

    /** What Subversion's merge tracking says about a delivery branch and the code it was made from. */
    public record MergeState(List<Long> eligible, List<Long> merged) {

        boolean fullyMerged() {
            return eligible.isEmpty() && !merged.isEmpty();
        }

        String eligibleText() {
            return eligible.stream().map(r -> "r" + r).collect(Collectors.joining(", "));
        }
    }

    private final ChangeService changes;
    private final ChangeRequestRepository repository;
    private final WorkspaceRepository workspaces;
    private final WorkspaceService workspaceService;
    private final SvnClient svn;
    private final ChangeProperties properties;
    private final AuditLog audit;

    public ChangeBranchService(ChangeService changes, ChangeRequestRepository repository, WorkspaceRepository workspaces,
                               WorkspaceService workspaceService, SvnClient svn, ChangeProperties properties, AuditLog audit) {
        this.changes = changes;
        this.repository = repository;
        this.workspaces = workspaces;
        this.workspaceService = workspaceService;
        this.svn = svn;
        this.properties = properties;
        this.audit = audit;
    }

    /**
     * Closes a change. With a delivery branch, MERGED first checks that Subversion records the branch as merged
     * (unless force: for changes applied another way, for example by hand); the branch is then removed.
     */
    public ChangeService.ChangeDetail close(UUID id, ChangeRequest.CloseReason reason, boolean force, String by) {
        ChangeRequest change = changes.find(id);
        ChangeService.requireStatus(change, ChangeRequest.Status.PLAN_READY, ChangeRequest.Status.GENERATED,
                ChangeRequest.Status.DELIVERED, ChangeRequest.Status.FAILED);
        ChangeService.requireNotBuilding(change);
        Long removedIn = null;
        String note = null;
        if (change.hasLiveBranch()) {
            Workspace workspace = workspace(change.getWorkspaceId());
            SvnCredentials credentials = workspaceService.credentials(workspace);
            if (!svn.exists(change.getBranchUrl(), credentials)) {
                note = "The branch had already been removed from SVN.";
            } else {
                if (reason == ChangeRequest.CloseReason.MERGED && !force) {
                    MergeState state = mergeState(change, workspace, credentials);
                    if (!state.eligible().isEmpty()) {
                        throw new ConflictException("Revision(s) " + state.eligibleText() + " of the branch are not merged into "
                                + workspace.getSvnUrl() + " yet. Merge the branch first, or close anyway if the change was applied another way.");
                    }
                    if (state.merged().isEmpty()) {
                        throw new ConflictException("Subversion has no record of the branch being merged into " + workspace.getSvnUrl()
                                + ". Merge the branch first, or close anyway if the change was applied another way.");
                    }
                }
                removedIn = removeBranch(change, credentials, reason);
            }
        }
        change.close(reason, by, removedIn, note);
        return changes.detail(repository.save(change));
    }

    /** Closes delivered changes whose branch is fully merged, and removes their branches. */
    @Scheduled(cron = "${factory.change.branch-cleanup:0 17 2 * * *}")
    public void removeMergedBranches() {
        List<ChangeRequest> delivered = repository.findByStatusAndBranchUrlIsNotNullAndBranchDeletedRevisionIsNull(ChangeRequest.Status.DELIVERED);
        int closed = 0;
        for (ChangeRequest change : delivered) {
            if ("BUILDING".equals(change.getBuildStatus())) {
                continue;
            }
            try {
                Workspace workspace = workspace(change.getWorkspaceId());
                SvnCredentials credentials = workspaceService.credentials(workspace);
                if (svn.exists(change.getBranchUrl(), credentials) && mergeState(change, workspace, credentials).fullyMerged()) {
                    close(change.getId(), ChangeRequest.CloseReason.MERGED, false, AUTOMATIC);
                    audit.recordAs(AUTOMATIC, "CHANGE_CLOSED", change.getWorkspaceId(), change.getTitle(),
                            "merged; branch " + change.getBranchUrl() + " removed");
                    closed++;
                }
            } catch (RuntimeException e) {
                log.warn("Could not check whether the branch of change {} was merged: {}", change.getId(), e.getMessage());
            }
        }
        if (closed > 0 || !delivered.isEmpty()) {
            log.info("Branch cleanup: {} delivered change(s) checked, {} merged and closed", delivered.size(), closed);
        }
    }

    MergeState mergeState(ChangeRequest change, Workspace workspace, SvnCredentials credentials) {
        return new MergeState(svn.mergeinfo("eligible", change.getBranchUrl(), workspace.getSvnUrl(), credentials),
                svn.mergeinfo("merged", change.getBranchUrl(), workspace.getSvnUrl(), credentials));
    }

    /** Removes the branch in one commit, after making sure it is a branch the factory created. */
    private long removeBranch(ChangeRequest change, SvnCredentials credentials, ChangeRequest.CloseReason reason) {
        String root = svn.info(change.getBranchUrl(), credentials).repositoryRoot();
        String path = change.getBranchUrl().substring(root.length()).replaceAll("^/+", "");
        String folder = properties.branchFolder().replaceAll("^/+|/+$", "");
        if (!path.equals(folder + "/cr-" + change.getId().toString().substring(0, 8))) {
            throw new ConflictException("The branch " + path + " was not created by the factory in " + folder + "/; remove it by hand.");
        }
        long revision = svn.multiCommit(root, "OBDX Development Factory: remove the branch of change " + change.getId().toString().substring(0, 8)
                + " (" + reason.name().toLowerCase() + ")", List.of("rm", path), credentials);
        log.info("Removed branch {} of change {} in revision {}", path, change.getId(), revision);
        return revision;
    }

    private Workspace workspace(UUID id) {
        return workspaces.findById(id).orElseThrow(() -> new NotFoundException("Workspace not found: " + id));
    }
}
