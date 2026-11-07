-- A premium component pack installed (or being installed, or upgraded) in a workspace's code: the version and the
-- modernization run whose change writes it. The pack counts as installed once that change is delivered.
CREATE TABLE component_pack_install (
    workspace_id UUID         NOT NULL REFERENCES workspace (id) ON DELETE CASCADE,
    pack_id      VARCHAR(40)  NOT NULL,
    version      VARCHAR(40)  NOT NULL,
    from_version VARCHAR(40),
    run_id       UUID         NOT NULL,
    started_by   VARCHAR(200),
    started_at   TIMESTAMP WITH TIME ZONE NOT NULL,
    PRIMARY KEY (workspace_id, pack_id, version)
);
