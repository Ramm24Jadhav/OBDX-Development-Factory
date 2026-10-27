ALTER TABLE workspace ADD COLUMN svn_username VARCHAR(200);
ALTER TABLE workspace ADD COLUMN svn_password_encrypted TEXT;
ALTER TABLE workspace ADD COLUMN indexed_revision BIGINT;

-- One run of "check out or update from SVN, then index".
CREATE TABLE import_job (
    id                 UUID PRIMARY KEY,
    workspace_id       UUID         NOT NULL REFERENCES workspace (id) ON DELETE CASCADE,
    status             VARCHAR(20)  NOT NULL,
    from_revision      BIGINT,
    to_revision        BIGINT,
    files_scanned      INTEGER      NOT NULL DEFAULT 0,
    files_indexed      INTEGER      NOT NULL DEFAULT 0,
    files_removed      INTEGER      NOT NULL DEFAULT 0,
    chunks_indexed     INTEGER      NOT NULL DEFAULT 0,
    embeddings_created INTEGER      NOT NULL DEFAULT 0,
    message            TEXT,
    created_at         TIMESTAMP WITH TIME ZONE NOT NULL,
    started_at         TIMESTAMP WITH TIME ZONE,
    finished_at        TIMESTAMP WITH TIME ZONE
);
CREATE INDEX import_job_workspace_idx ON import_job (workspace_id, created_at DESC);

-- A source file in a workspace's working copy. content_hash finds changed files on the next import.
CREATE TABLE code_file (
    id           UUID PRIMARY KEY,
    workspace_id UUID          NOT NULL REFERENCES workspace (id) ON DELETE CASCADE,
    path         VARCHAR(2000) NOT NULL,
    language     VARCHAR(30)   NOT NULL,
    size_bytes   INTEGER       NOT NULL,
    content_hash CHAR(64)      NOT NULL,
    revision     BIGINT        NOT NULL,
    UNIQUE (workspace_id, path)
);

-- A searchable piece of a file: a Java class or method, or a window of lines for other files.
-- search_text holds the path, symbol, content and identifiers split into words ("FundTransfer" -> "fund transfer").
-- embedding has no fixed size because it depends on the embedding model.
CREATE TABLE code_chunk (
    id            UUID PRIMARY KEY,
    workspace_id  UUID          NOT NULL REFERENCES workspace (id) ON DELETE CASCADE,
    file_id       UUID          NOT NULL REFERENCES code_file (id) ON DELETE CASCADE,
    path          VARCHAR(2000) NOT NULL,
    language      VARCHAR(30)   NOT NULL,
    kind          VARCHAR(30)   NOT NULL,
    symbol        VARCHAR(500),
    start_line    INTEGER       NOT NULL,
    end_line      INTEGER       NOT NULL,
    content       TEXT          NOT NULL,
    search_text   TEXT          NOT NULL,
    search_vector TSVECTOR GENERATED ALWAYS AS (to_tsvector('simple', search_text)) STORED,
    embedding     VECTOR
);
CREATE INDEX code_chunk_workspace_idx ON code_chunk (workspace_id);
CREATE INDEX code_chunk_file_idx ON code_chunk (file_id);
CREATE INDEX code_chunk_search_idx ON code_chunk USING GIN (search_vector);
