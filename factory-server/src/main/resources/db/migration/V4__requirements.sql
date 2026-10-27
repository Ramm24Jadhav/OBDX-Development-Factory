-- A requirement document (or pasted request) and its review status.
CREATE TABLE requirement (
    id              UUID PRIMARY KEY,
    workspace_id    UUID         NOT NULL REFERENCES workspace (id) ON DELETE CASCADE,
    title           VARCHAR(300) NOT NULL,
    file_name       VARCHAR(500),
    size_bytes      INTEGER      NOT NULL,
    document_text   TEXT         NOT NULL,
    status          VARCHAR(20)  NOT NULL,
    message         TEXT,
    current_version INTEGER,
    created_at      TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at      TIMESTAMP WITH TIME ZONE NOT NULL,
    approved_at     TIMESTAMP WITH TIME ZONE
);
CREATE INDEX requirement_workspace_idx ON requirement (workspace_id, created_at DESC);

-- Every version of the structured spec: drafted by the model, updated with answers, or edited by an analyst.
CREATE TABLE requirement_spec (
    requirement_id UUID        NOT NULL REFERENCES requirement (id) ON DELETE CASCADE,
    version        INTEGER     NOT NULL,
    origin         VARCHAR(20) NOT NULL,
    spec           JSONB       NOT NULL,
    created_at     TIMESTAMP WITH TIME ZONE NOT NULL,
    PRIMARY KEY (requirement_id, version)
);
