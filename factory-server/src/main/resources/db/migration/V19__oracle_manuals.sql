-- Oracle's manuals straight from Oracle's documentation site. An administrator follows an OBDX version (22.2, 25.2):
-- its technical guides, or all its manuals. Each file is remembered with the markers Oracle sent (ETag, Last-Modified),
-- so a check downloads only what Oracle changed; the document it became is in knowledge_document.

CREATE TABLE knowledge_oracle_follow (
    obdx_version  VARCHAR(20) PRIMARY KEY,
    scope         VARCHAR(20) NOT NULL,       -- TECHNICAL, ALL
    followed_by   VARCHAR(100),
    followed_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    release       VARCHAR(30),                -- the newest release found, 25.2.0.0.0
    check_started TIMESTAMPTZ,
    last_check_at TIMESTAMPTZ,
    last_result   TEXT
);

CREATE TABLE knowledge_oracle_file (
    url           TEXT PRIMARY KEY,
    obdx_version  VARCHAR(20) NOT NULL REFERENCES knowledge_oracle_follow (obdx_version) ON DELETE CASCADE,
    title         VARCHAR(300) NOT NULL,
    patchset      VARCHAR(30),
    etag          VARCHAR(300),
    last_modified VARCHAR(100),
    document_id   UUID REFERENCES knowledge_document (id) ON DELETE SET NULL,
    checked_at    TIMESTAMPTZ,
    result        TEXT
);
CREATE INDEX knowledge_oracle_file_version_idx ON knowledge_oracle_file (obdx_version);
