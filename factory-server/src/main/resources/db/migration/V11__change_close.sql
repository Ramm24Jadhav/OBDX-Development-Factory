-- Closing a change: merged (or applied) or abandoned, and the revision that removed its delivery branch.
ALTER TABLE change_request ADD COLUMN closed_reason VARCHAR(20);
ALTER TABLE change_request ADD COLUMN closed_by VARCHAR(200);
ALTER TABLE change_request ADD COLUMN closed_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE change_request ADD COLUMN branch_deleted_revision BIGINT;
