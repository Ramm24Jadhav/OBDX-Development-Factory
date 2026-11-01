-- The tokens-per-minute limit a model server counts prompt and answer against together (Groq), learned from refusals
ALTER TABLE model_limits ADD COLUMN total_tokens INTEGER NOT NULL DEFAULT 0;
