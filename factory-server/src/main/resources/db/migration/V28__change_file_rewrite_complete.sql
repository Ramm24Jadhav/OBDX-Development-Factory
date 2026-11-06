-- The kept rewrite is a whole answer whose fix the model's limit stopped (checked and fixed next time), not a part cut off
-- (continued next time).
ALTER TABLE change_file ADD COLUMN rewrite_complete BOOLEAN NOT NULL DEFAULT FALSE;
