-- Turning an approved requirement (and its approved screen designs) into code: impact analysis, a reviewed plan,
-- generated files, and delivery as a patch or an SVN branch.
CREATE TABLE change_request (
    id                 UUID PRIMARY KEY,
    workspace_id       UUID         NOT NULL REFERENCES workspace (id) ON DELETE CASCADE,
    requirement_id     UUID REFERENCES requirement (id) ON DELETE SET NULL,
    title              VARCHAR(300) NOT NULL,
    status             VARCHAR(20)  NOT NULL,
    message            TEXT,
    base_revision      BIGINT,
    plan               JSONB,
    plan_approved_by   VARCHAR(200),
    plan_approved_at   TIMESTAMP WITH TIME ZONE,
    branch_url         VARCHAR(1000),
    delivered_revision BIGINT,
    created_by         VARCHAR(200),
    created_at         TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at         TIMESTAMP WITH TIME ZONE NOT NULL
);
CREATE INDEX change_request_workspace_idx ON change_request (workspace_id, created_at DESC);

-- One file of a change: its content before (empty for new files) and after generation, and the result of checks.
CREATE TABLE change_file (
    change_id     UUID          NOT NULL REFERENCES change_request (id) ON DELETE CASCADE,
    position      INTEGER       NOT NULL,
    path          VARCHAR(2000) NOT NULL,
    action        VARCHAR(10)   NOT NULL,
    layer         VARCHAR(20)   NOT NULL,
    purpose       TEXT,
    status        VARCHAR(20)   NOT NULL,
    original      TEXT,
    generated     TEXT,
    edited        BOOLEAN       NOT NULL DEFAULT FALSE,
    check_status  VARCHAR(20),
    check_message TEXT,
    attempts      INTEGER       NOT NULL DEFAULT 0,
    PRIMARY KEY (change_id, path)
);
