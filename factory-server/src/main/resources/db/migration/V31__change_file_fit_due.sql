-- A file written by a generation that the model's limit stopped: its fix by what the cross-check finds against the
-- other files is still due, for Continue generation to make once. Cleared when the fix is tried or the file is written again.
ALTER TABLE change_file ADD COLUMN fit_due BOOLEAN NOT NULL DEFAULT FALSE;
