package com.obdx.factory.modernization;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class AnalysisJobsTest {

    @Test
    void marksTheStepsDoneUpToTheRunningOne() {
        assertThat(AnalysisJobs.steps(1, null)).extracting(AnalysisJobs.Step::state).containsExactly("done", "running", "todo", "todo");
        assertThat(AnalysisJobs.steps(2, "stopped")).extracting(AnalysisJobs.Step::state).containsExactly("done", "done", "stopped", "todo");
        assertThat(AnalysisJobs.steps(4, null)).extracting(AnalysisJobs.Step::state).containsOnly("done");
        assertThat(AnalysisJobs.steps(-1, null)).extracting(AnalysisJobs.Step::state).containsOnly("todo");
    }
}
