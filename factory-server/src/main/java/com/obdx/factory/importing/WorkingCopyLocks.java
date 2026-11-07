package com.obdx.factory.importing;

import com.obdx.factory.common.ConflictException;
import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * What is using a workspace's working copy right now, so that "Check out again" (which replaces it) and a delivery,
 * or the writing of a change's files (which read it), do not run at the same time. Held across threads: a job holds
 * it from its start to its end.
 */
@Component
public class WorkingCopyLocks {

    private final Map<UUID, String> held = new ConcurrentHashMap<>();

    /** Takes the workspace's working copy for what is said ("checked out again"); false when something else has it. */
    public boolean hold(UUID workspaceId, String what) {
        return held.putIfAbsent(workspaceId, what) == null;
    }

    public void release(UUID workspaceId) {
        held.remove(workspaceId);
    }

    /** What has the working copy, or null. */
    public String holder(UUID workspaceId) {
        return held.get(workspaceId);
    }

    /** Refuses while something has the working copy, saying what. */
    public void requireFree(UUID workspaceId) {
        String what = held.get(workspaceId);
        if (what != null) {
            throw new ConflictException("The workspace's code is being " + what + " right now. Wait for it to finish, then try again.");
        }
    }
}
