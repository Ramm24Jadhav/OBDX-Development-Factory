-- The output tokens a minute a model server allows (Groq's OTPM), learned from its refusals. It replaces output_tokens, a
-- per-answer cap learned under earlier rules, which the factory clears when it reads it.
ALTER TABLE model_limits ADD COLUMN output_per_minute INTEGER NOT NULL DEFAULT 0;
