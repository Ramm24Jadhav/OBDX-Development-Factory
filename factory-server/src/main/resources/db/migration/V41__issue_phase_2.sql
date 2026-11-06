-- Issue Analyzer phase 2: Oracle notes in the Library, bank administrators' issue links, fix checks, questions and
-- groups of repeated issues.

-- What a Library document is: an OBDX manual or an Oracle support note (bug text, patch readme, knowledge article),
-- with Oracle's own reference as the uploader typed it ("Doc ID 2345678.1", "Bug 34567890").
ALTER TABLE knowledge_document ADD COLUMN kind VARCHAR(20) NOT NULL DEFAULT 'MANUAL';
ALTER TABLE knowledge_document ADD COLUMN reference VARCHAR(200);

-- FACTORY: filed by a signed-in user; BANK: through an issue link. released_at: when an engineer released the
-- diagnosis to the bank. group_id: the first issue of a group with the same error.
ALTER TABLE issue ADD COLUMN source VARCHAR(10) NOT NULL DEFAULT 'FACTORY';
ALTER TABLE issue ADD COLUMN reporter_email VARCHAR(200);
ALTER TABLE issue ADD COLUMN released_at TIMESTAMPTZ;
ALTER TABLE issue ADD COLUMN group_id UUID;
CREATE INDEX issue_group_idx ON issue (group_id);

-- Links bank administrators use to file issues without an account. Only the SHA-256 of the token is stored.
CREATE TABLE issue_link (
    id           UUID PRIMARY KEY,
    workspace_id UUID         NOT NULL REFERENCES workspace (id) ON DELETE CASCADE,
    label        VARCHAR(200) NOT NULL,
    token_hash   VARCHAR(64)  NOT NULL UNIQUE,
    expires_at   TIMESTAMPTZ  NOT NULL,
    revoked_at   TIMESTAMPTZ,
    created_by   VARCHAR(200) NOT NULL,
    created_at   TIMESTAMPTZ  NOT NULL
);

-- The follow link of an issue filed through an issue link.
CREATE TABLE issue_follow (
    issue_id   UUID PRIMARY KEY REFERENCES issue (id) ON DELETE CASCADE,
    link_id    UUID REFERENCES issue_link (id) ON DELETE SET NULL,
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL
);

-- New logs or screenshots after a fix, compared with the original error.
CREATE TABLE issue_check (
    id         UUID PRIMARY KEY,
    issue_id   UUID         NOT NULL REFERENCES issue (id) ON DELETE CASCADE,
    result     VARCHAR(20)  NOT NULL,
    summary    TEXT         NOT NULL,
    evidence   JSONB        NOT NULL,
    created_by VARCHAR(200) NOT NULL,
    created_at TIMESTAMPTZ  NOT NULL
);
CREATE INDEX issue_check_issue_idx ON issue_check (issue_id, created_at);
ALTER TABLE issue_file ADD COLUMN check_id UUID REFERENCES issue_check (id) ON DELETE CASCADE;

-- Questions engineers ask about an issue, answered by the model in the background.
CREATE TABLE issue_question (
    id          UUID PRIMARY KEY,
    issue_id    UUID         NOT NULL REFERENCES issue (id) ON DELETE CASCADE,
    question    TEXT         NOT NULL,
    answer      TEXT,
    status      VARCHAR(20)  NOT NULL,
    model       VARCHAR(200),
    asked_by    VARCHAR(200) NOT NULL,
    created_at  TIMESTAMPTZ  NOT NULL,
    answered_at TIMESTAMPTZ
);
CREATE INDEX issue_question_issue_idx ON issue_question (issue_id, created_at);
