-- Code search can use its own model server, for example chat from a cloud API and embeddings from Ollama on this
-- computer. Null: the embedding model is on the chat model server (base_url, api_key).
ALTER TABLE model_settings ADD COLUMN embedding_base_url VARCHAR(1000);
ALTER TABLE model_settings ADD COLUMN embedding_api_key TEXT;  -- encrypted with FACTORY_SECRET_KEY; null: the server needs none
