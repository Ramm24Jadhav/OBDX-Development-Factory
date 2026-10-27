-- A screen being designed, usually created from an approved requirement spec.
CREATE TABLE screen_design (
    id                UUID PRIMARY KEY,
    workspace_id      UUID         NOT NULL REFERENCES workspace (id) ON DELETE CASCADE,
    requirement_id    UUID REFERENCES requirement (id) ON DELETE SET NULL,
    name              VARCHAR(300) NOT NULL,
    status            VARCHAR(20)  NOT NULL,
    current_version   INTEGER      NOT NULL,
    review_token      VARCHAR(64) UNIQUE,
    review_expires_at TIMESTAMP WITH TIME ZONE,
    approved_version  INTEGER,
    approved_by       VARCHAR(200),
    approved_at       TIMESTAMP WITH TIME ZONE,
    created_at        TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at        TIMESTAMP WITH TIME ZONE NOT NULL
);
CREATE INDEX screen_design_workspace_idx ON screen_design (workspace_id, created_at);

-- Every saved version of a design's Screen Model.
CREATE TABLE screen_design_version (
    design_id  UUID        NOT NULL REFERENCES screen_design (id) ON DELETE CASCADE,
    version    INTEGER     NOT NULL,
    origin     VARCHAR(20) NOT NULL,
    note       TEXT,
    model      JSONB       NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    PRIMARY KEY (design_id, version)
);

-- Comments from the team or from customer reviewers, optionally about one component.
CREATE TABLE screen_design_comment (
    id           UUID PRIMARY KEY,
    design_id    UUID          NOT NULL REFERENCES screen_design (id) ON DELETE CASCADE,
    version      INTEGER       NOT NULL,
    component_id VARCHAR(200),
    author       VARCHAR(200)  NOT NULL,
    from_review  BOOLEAN       NOT NULL,
    text         TEXT          NOT NULL,
    created_at   TIMESTAMP WITH TIME ZONE NOT NULL
);
CREATE INDEX screen_design_comment_idx ON screen_design_comment (design_id, created_at);
