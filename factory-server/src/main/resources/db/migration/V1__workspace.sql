-- pgvector backs code search. Creating an extension needs a superuser, so a DBA usually runs
-- "CREATE EXTENSION vector;" once per database before the first start; this line is then a no-op.
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE workspace (
    id           UUID PRIMARY KEY,
    name         VARCHAR(100)  NOT NULL UNIQUE,
    bank_name    VARCHAR(200)  NOT NULL,
    obdx_version VARCHAR(20)   NOT NULL,
    svn_url      VARCHAR(1000),
    created_at   TIMESTAMP WITH TIME ZONE NOT NULL
);
