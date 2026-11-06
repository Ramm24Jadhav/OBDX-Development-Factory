-- Issue Analyzer: errors a bank reports (description, logs, screenshots), the evidence found in them and the bank's
-- code, the model's diagnosis, and what fixed it.
CREATE TABLE issue (
    id          UUID PRIMARY KEY,
    workspace_id UUID        NOT NULL REFERENCES workspace (id) ON DELETE CASCADE,
    title       VARCHAR(300) NOT NULL,
    description TEXT,
    environment VARCHAR(10),
    log_text    TEXT,
    status      VARCHAR(20)  NOT NULL,
    message     TEXT,
    evidence    JSONB,
    diagnosis   JSONB,
    signature   TEXT,          -- exception classes, error codes and top code frame, lower case, space separated
    resolution  TEXT,
    sr_draft    TEXT,
    created_by  VARCHAR(200),
    created_at  TIMESTAMPTZ  NOT NULL,
    updated_at  TIMESTAMPTZ  NOT NULL
);
CREATE INDEX issue_workspace_idx ON issue (workspace_id, updated_at DESC);

-- Log files and screenshots of an issue; for screenshots, the text read from them (editable).
CREATE TABLE issue_file (
    issue_id       UUID         NOT NULL REFERENCES issue (id) ON DELETE CASCADE,
    position       INTEGER      NOT NULL,
    name           VARCHAR(300) NOT NULL,
    kind           VARCHAR(10)  NOT NULL,
    mime_type      VARCHAR(100) NOT NULL,
    content        BYTEA        NOT NULL,
    extracted_text TEXT,
    PRIMARY KEY (issue_id, position)
);

-- Resolutions a lead shared as product knowledge for every workspace. No logs, screenshots or bank data; the source
-- workspace is kept for audit only.
CREATE TABLE issue_knowledge (
    id                  UUID PRIMARY KEY,
    source_issue_id     UUID REFERENCES issue (id) ON DELETE SET NULL,
    source_workspace_id UUID REFERENCES workspace (id) ON DELETE SET NULL,
    obdx_version        VARCHAR(20),
    component           VARCHAR(200),
    category            VARCHAR(20)  NOT NULL,
    signature           TEXT,
    title               VARCHAR(300) NOT NULL,
    root_cause          TEXT         NOT NULL,
    resolution          TEXT         NOT NULL,
    shared_by           VARCHAR(200) NOT NULL,
    shared_at           TIMESTAMPTZ  NOT NULL
);

ALTER TABLE model_settings ADD COLUMN vision_model VARCHAR(300);
