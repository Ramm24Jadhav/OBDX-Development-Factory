package com.obdx.factory.jenkins;

import java.util.Arrays;
import java.util.List;

/**
 * How a workspace's code is built with the bank's Jenkins.
 *
 * @param jobs            job names, comma-separated; folders as "folder/job"
 * @param mode            BRANCH: build the change's SVN branch. PATCH: send the patch as a file parameter; the job applies it to trunk
 * @param branchParameter build parameter that receives the branch
 * @param branchValue     PATH: the branch path relative to the repository root ("branches/factory/cr-1a2b3c4d"). URL: the full branch URL
 * @param patchParameter  file parameter that receives the patch (PATCH mode)
 */
public record JenkinsSettings(String url, String jobs, Mode mode, String branchParameter, BranchValue branchValue,
                              String patchParameter, String username, boolean tokenSet) {

    public enum Mode { BRANCH, PATCH }

    public enum BranchValue { PATH, URL }

    public List<String> jobList() {
        return Arrays.stream(jobs.split(",")).map(String::trim).filter(job -> !job.isEmpty()).toList();
    }
}
