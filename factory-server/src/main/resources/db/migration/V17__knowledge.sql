-- The OBDX knowledge base: Oracle manuals and the bank's own documents, split into sections for search, plus
-- knowledge notes that users and agents add as the factory learns. version_line is the OBDX major version the
-- knowledge is for ("22", "25"); workspace_id set means the bank's own document or note, seen only in that workspace.

CREATE TABLE knowledge_document (
    id           UUID PRIMARY KEY,
    workspace_id UUID REFERENCES workspace (id) ON DELETE CASCADE,
    obdx_version VARCHAR(20)  NOT NULL,           -- as given at import, e.g. 22.2 or 25.2
    version_line VARCHAR(10)  NOT NULL,           -- 22, 25
    title        VARCHAR(300) NOT NULL,
    file_name    VARCHAR(500) NOT NULL,
    sha256       VARCHAR(64)  NOT NULL,
    pages        INTEGER      NOT NULL DEFAULT 0,
    sections     INTEGER      NOT NULL DEFAULT 0,
    embedded     INTEGER      NOT NULL DEFAULT 0,
    status       VARCHAR(20)  NOT NULL,           -- QUEUED, READING, EMBEDDING, READY, FAILED
    message      TEXT,
    imported_by  VARCHAR(100),
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX knowledge_document_file_idx ON knowledge_document (obdx_version, sha256, COALESCE(workspace_id, '00000000-0000-0000-0000-000000000000'));

-- embedding has no fixed size because it depends on the embedding model (as code_chunk).
CREATE TABLE knowledge_chunk (
    id            UUID PRIMARY KEY,
    document_id   UUID         NOT NULL REFERENCES knowledge_document (id) ON DELETE CASCADE,
    workspace_id  UUID,
    version_line  VARCHAR(10)  NOT NULL,
    heading       VARCHAR(500),
    page_from     INTEGER      NOT NULL,
    page_to       INTEGER      NOT NULL,
    position      INTEGER      NOT NULL,
    content       TEXT         NOT NULL,
    search_vector TSVECTOR GENERATED ALWAYS AS (to_tsvector('english', coalesce(heading, '') || ' ' || content)) STORED,
    embedding     VECTOR
);
CREATE INDEX knowledge_chunk_search_idx ON knowledge_chunk USING GIN (search_vector);
CREATE INDEX knowledge_chunk_scope_idx ON knowledge_chunk (version_line, workspace_id);
CREATE INDEX knowledge_chunk_document_idx ON knowledge_chunk (document_id, position);

-- Notes: SUGGESTED until someone approves them (TRUSTED) or turns them down (REJECTED). Code generation uses only
-- trusted notes; the AI chat also shows suggested ones, marked as such. sources is a JSON list of citations.
CREATE TABLE knowledge_note (
    id            UUID PRIMARY KEY,
    workspace_id  UUID REFERENCES workspace (id) ON DELETE CASCADE,
    version_line  VARCHAR(10),                    -- null: every OBDX version
    topic         VARCHAR(200),                   -- a transaction or area, e.g. Fund Transfer
    title         VARCHAR(300) NOT NULL,
    body          TEXT         NOT NULL,
    status        VARCHAR(20)  NOT NULL,          -- SUGGESTED, TRUSTED, REJECTED
    origin        VARCHAR(20)  NOT NULL,          -- USER, AGENT, SUMMARY
    sources       TEXT         NOT NULL DEFAULT '[]',
    created_by    VARCHAR(100),
    reviewed_by   VARCHAR(100),
    reviewed_at   TIMESTAMPTZ,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    search_vector TSVECTOR GENERATED ALWAYS AS (to_tsvector('english', coalesce(topic, '') || ' ' || title || ' ' || body)) STORED,
    embedding     VECTOR
);
CREATE INDEX knowledge_note_search_idx ON knowledge_note USING GIN (search_vector);
CREATE INDEX knowledge_note_scope_idx ON knowledge_note (status, version_line, workspace_id);

-- Was an answer helpful? Collected from the AI chat to see whether the knowledge gets better.
CREATE TABLE knowledge_feedback (
    id           UUID PRIMARY KEY,
    workspace_id UUID REFERENCES workspace (id) ON DELETE CASCADE,
    question     TEXT         NOT NULL,
    answer       TEXT         NOT NULL,
    helpful      BOOLEAN      NOT NULL,
    comment      TEXT,
    sources      TEXT         NOT NULL DEFAULT '[]',
    created_by   VARCHAR(100),
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);
