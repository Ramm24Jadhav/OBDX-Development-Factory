package com.obdx.factory.change;

import java.util.List;

/**
 * The files a change will create or modify, decided by impact analysis and approved by a lead before any code is
 * generated.
 */
public record ChangePlan(String summary, List<Item> items, List<String> risks) {

    /**
     * @param action  "create" or "modify"
     * @param layer   "data", "integration", "service", "ui", "test" or "config"
     * @param basedOn existing files whose patterns the new code should follow
     */
    public record Item(String path, String action, String layer, String purpose, List<String> basedOn, String details) {
    }
}
