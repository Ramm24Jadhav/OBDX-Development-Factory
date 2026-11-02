-- A change's history reads its audited events (files written again, failed deliveries) on every look at the change.
CREATE INDEX audit_event_workspace_target_idx ON audit_event (workspace_id, target, at DESC);

-- A request for changes holds the plan until it is answered: by a new analysis or a saved edit (even one that gives the
-- same plan, which keeps its revision number). Requests made before this column are open; Analyze again or Save
-- answers them.
ALTER TABLE change_plan_comment ADD COLUMN answered_at TIMESTAMP WITH TIME ZONE;
