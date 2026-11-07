-- The most max_tokens a model server takes in one request, learned from its refusal ("max_tokens must be less than or equal
-- to 32768"), so later requests do not ask for more.
ALTER TABLE model_limits ADD COLUMN answer_max INTEGER NOT NULL DEFAULT 0;
