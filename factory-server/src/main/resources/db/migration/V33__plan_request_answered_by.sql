-- Who answered a request for changes (a new analysis, or the user who saved a changed plan) and the revision that did.
ALTER TABLE change_plan_comment ADD COLUMN answered_by VARCHAR(200);
ALTER TABLE change_plan_comment ADD COLUMN answered_revision INTEGER;
