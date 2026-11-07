package com.obdx.factory.modernization;

import com.obdx.factory.common.ConflictException;
import com.obdx.factory.componentpack.ComponentRegistry;
import org.springframework.stereotype.Service;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * The code analysis as a background job, one per workspace: read the code files, find the screens and modules, count
 * the Oracle JET components, save the analysis. The page follows its steps and can stop it between steps; a stopped
 * or failed analysis keeps the last one. Jobs live in memory: a restart forgets a running one (the analysis is quick to
 * run again).
 */
@Service
public class AnalysisJobs {

    static final List<String> STEPS = List.of("Read the code files", "Find the screens and modules", "Count the Oracle JET components", "Save the analysis");

    /** One step: todo, running, done, stopped or failed. */
    public record Step(String name, String state) {
    }

    /** state: running, done, stopped or failed; percent: the steps done of four; screens and modules once done. */
    public record Job(UUID workspaceId, String state, List<Step> steps, int percent, OffsetDateTime startedAt, OffsetDateTime finishedAt,
                      String message, Integer screens, Integer modules, Integer components, String startedBy) {
    }

    private final InventoryService inventories;
    private final ComponentRegistry registry;
    private final Map<UUID, Job> jobs = new ConcurrentHashMap<>();
    private final Map<UUID, Boolean> stops = new ConcurrentHashMap<>();
    private final ExecutorService executor = Executors.newVirtualThreadPerTaskExecutor();

    public AnalysisJobs(InventoryService inventories, ComponentRegistry registry) {
        this.inventories = inventories;
        this.registry = registry;
    }

    public Job find(UUID workspaceId) {
        return jobs.get(workspaceId);
    }

    public synchronized Job start(UUID workspaceId, String by) {
        Job current = jobs.get(workspaceId);
        if (current != null && "running".equals(current.state())) {
            throw new ConflictException("The analysis of this workspace is running already.");
        }
        stops.remove(workspaceId);
        Job job = new Job(workspaceId, "running", steps(-1, null), 0, OffsetDateTime.now(), null, "Starting the analysis", null, null, null, by);
        jobs.put(workspaceId, job);
        executor.submit(() -> run(workspaceId));
        return job;
    }

    public Job stop(UUID workspaceId) {
        Job job = jobs.get(workspaceId);
        if (job != null && "running".equals(job.state())) {
            stops.put(workspaceId, true);
        }
        return jobs.get(workspaceId);
    }

    private void run(UUID workspaceId) {
        int[] at = {-1};
        InventoryService.Progress progress = new InventoryService.Progress() {
            public void step(int index) {
                // the component count happens inside the scan, between finding screens and saving
                if (index == 3) {
                    update(workspaceId, 2, null);
                }
                at[0] = index;
                update(workspaceId, index, null);
            }

            public boolean stopped() {
                return Boolean.TRUE.equals(stops.get(workspaceId));
            }
        };
        try {
            Inventory inventory = inventories.scan(workspaceId, progress);
            int components = ComponentInventory.of(inventory, registry).totals().uses();
            Job j = jobs.get(workspaceId);
            jobs.put(workspaceId, new Job(workspaceId, "done", steps(STEPS.size(), null), 100, j.startedAt(), OffsetDateTime.now(),
                    "Analysis finished: " + inventory.summary().screens() + " screens in " + inventory.summary().modules() + " modules.",
                    inventory.summary().screens(), inventory.summary().modules(), components, j.startedBy()));
        } catch (InventoryService.Stopped e) {
            finish(workspaceId, "stopped", at[0], e.getMessage());
        } catch (RuntimeException e) {
            finish(workspaceId, "failed", at[0], e.getMessage() == null ? "The analysis failed." : e.getMessage());
        } finally {
            stops.remove(workspaceId);
        }
    }

    private void update(UUID workspaceId, int running, String message) {
        Job j = jobs.get(workspaceId);
        jobs.put(workspaceId, new Job(workspaceId, "running", steps(running, null), running * 100 / STEPS.size(), j.startedAt(), null,
                message == null ? STEPS.get(running) + "…" : message, null, null, null, j.startedBy()));
    }

    private void finish(UUID workspaceId, String state, int at, String message) {
        Job j = jobs.get(workspaceId);
        jobs.put(workspaceId, new Job(workspaceId, state, steps(Math.max(at, 0), state), Math.max(at, 0) * 100 / STEPS.size(), j.startedAt(), OffsetDateTime.now(),
                message, null, null, null, j.startedBy()));
    }

    /** The steps with those before running done, running marked (or ended as endState), the rest to do. */
    static List<Step> steps(int running, String endState) {
        java.util.ArrayList<Step> out = new java.util.ArrayList<>();
        for (int i = 0; i < STEPS.size(); i++) {
            String state = i < running ? "done" : i == running ? (endState == null ? "running" : endState) : "todo";
            out.add(new Step(STEPS.get(i), state));
        }
        return out;
    }
}
