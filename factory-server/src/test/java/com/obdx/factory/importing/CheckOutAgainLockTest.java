package com.obdx.factory.importing;

import com.obdx.factory.common.ConflictException;
import com.obdx.factory.workspace.Workspace;
import com.obdx.factory.workspace.WorkspaceRepository;
import org.junit.jupiter.api.Test;
import org.springframework.core.task.TaskExecutor;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.RejectedExecutionException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * Verification of f4c835e: Check out again takes the working copy's lock in the same synchronized step as its checks,
 * so nothing can start in between, and gives it back when the job cannot be started.
 */
class CheckOutAgainLockTest {

    private final ImportJobRepository jobs = mock(ImportJobRepository.class);
    private final WorkspaceRepository workspaces = mock(WorkspaceRepository.class);
    private final JdbcTemplate jdbc = mock(JdbcTemplate.class);
    private final WorkingCopyLocks locks = new WorkingCopyLocks();
    private final List<Runnable> queued = new ArrayList<>();
    private final Workspace workspace = new Workspace("w", "Bank", "25.x", "file:///x/trunk");

    private ImportService service(TaskExecutor executor) {
        when(workspaces.findById(workspace.getId())).thenReturn(Optional.of(workspace));
        when(jobs.save(any())).thenAnswer(call -> call.getArgument(0));
        when(jdbc.queryForObject(anyString(), eq(Integer.class), eq(workspace.getId()))).thenReturn(0);
        return new ImportService(jobs, workspaces, null, null, null, null, null, null, null, executor, locks,
                mock(com.obdx.factory.auth.AuditLog.class), jdbc);
    }

    @Test
    void theLockIsTakenWhenTheJobIsQueuedSoASecondRequestIsRefused() {
        ImportService service = service(queued::add);

        service.start(workspace.getId(), true, "dev");

        assertThat(queued).hasSize(1);
        assertThat(locks.holder(workspace.getId())).isEqualTo("checked out again");
        assertThatThrownBy(() -> service.start(workspace.getId(), true, "dev")).isInstanceOf(ConflictException.class)
                .hasMessageContaining("being checked out again");
    }

    @Test
    void aJobTheExecutorRefusesGivesTheLockBack() {
        ImportService service = service(task -> {
            throw new RejectedExecutionException("full");
        });

        assertThatThrownBy(() -> service.start(workspace.getId(), true, "dev")).isInstanceOf(RejectedExecutionException.class);

        assertThat(locks.holder(workspace.getId())).isNull();
    }

    @Test
    void aChangeBeingWrittenRefusesCheckOutAgain() {
        ImportService service = service(queued::add);
        when(jdbc.queryForObject(anyString(), eq(Integer.class), eq(workspace.getId()))).thenReturn(1);

        assertThatThrownBy(() -> service.start(workspace.getId(), true, "dev")).isInstanceOf(ConflictException.class)
                .hasMessageContaining("being analyzed, written or built");
        assertThat(locks.holder(workspace.getId())).isNull();
        assertThat(queued).isEmpty();
    }
}
