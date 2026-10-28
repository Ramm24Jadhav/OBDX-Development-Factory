-- The model server and models chosen on the Models page. One row; while it is absent, the FACTORY_MODEL_* settings apply.
CREATE TABLE model_settings (
    id              INT PRIMARY KEY CHECK (id = 1),
    base_url        VARCHAR(1000) NOT NULL,
    api_key         TEXT,          -- encrypted with FACTORY_SECRET_KEY; null: the server needs none
    chat_model      VARCHAR(300)  NOT NULL,
    embedding_model VARCHAR(300)  NOT NULL,
    updated_at      TIMESTAMPTZ   NOT NULL,
    updated_by      VARCHAR(200)
);
