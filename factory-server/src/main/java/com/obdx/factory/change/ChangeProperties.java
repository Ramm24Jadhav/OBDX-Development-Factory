package com.obdx.factory.change;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;
import org.springframework.util.unit.DataSize;

/**
 * @param maxPlanItems     most files one change may touch
 * @param maxCandidates    existing code excerpts shown to the model during impact analysis
 * @param maxFileSize      larger existing files are not rewritten by the model
 * @param fixAttempts      times the model may fix a file that fails its checks
 * @param branchFolder     where delivery branches are created, relative to the repository root
 * @param branchCleanup    when to look for delivered branches that were merged and remove them (cron; "-" turns it
 *                         off); read by {@link ChangeBranchService}
 */
@ConfigurationProperties(prefix = "factory.change")
public record ChangeProperties(
        @DefaultValue("30") int maxPlanItems,
        @DefaultValue("25") int maxCandidates,
        @DefaultValue("80KB") DataSize maxFileSize,
        @DefaultValue("2") int fixAttempts,
        @DefaultValue("branches/factory") String branchFolder,
        @DefaultValue("0 17 2 * * *") String branchCleanup) {
}
