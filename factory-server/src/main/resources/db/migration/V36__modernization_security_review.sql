-- Who signed off the security review of a run's change (Review and approval), and when.
ALTER TABLE modernization_run ADD COLUMN security_by VARCHAR(200);
ALTER TABLE modernization_run ADD COLUMN security_at TIMESTAMP WITH TIME ZONE;
