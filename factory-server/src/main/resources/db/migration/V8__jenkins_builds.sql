-- How to build a workspace's code with the bank's Jenkins.
CREATE TABLE jenkins_settings (
    workspace_id     UUID PRIMARY KEY REFERENCES workspace (id) ON DELETE CASCADE,
    url              VARCHAR(1000) NOT NULL,
    jobs             VARCHAR(2000) NOT NULL,
    mode             VARCHAR(10)   NOT NULL,
    branch_parameter VARCHAR(100)  NOT NULL,
    branch_value     VARCHAR(10)   NOT NULL,
    patch_parameter  VARCHAR(100)  NOT NULL,
    username         VARCHAR(200),
    token_encrypted  TEXT,
    updated_at       TIMESTAMP WITH TIME ZONE NOT NULL
);

-- Each Jenkins build of a change, with the errors found and the files the model fixed after it.
CREATE TABLE change_build (
    id           UUID PRIMARY KEY,
    change_id    UUID        NOT NULL REFERENCES change_request (id) ON DELETE CASCADE,
    round        INTEGER     NOT NULL,
    job          VARCHAR(300) NOT NULL,
    build_number INTEGER,
    build_url    VARCHAR(1000),
    result       VARCHAR(20) NOT NULL,
    errors       TEXT,
    log_excerpt  TEXT,
    fixed_files  TEXT,
    started_at   TIMESTAMP WITH TIME ZONE NOT NULL,
    finished_at  TIMESTAMP WITH TIME ZONE
);
CREATE INDEX change_build_change_idx ON change_build (change_id, started_at);

ALTER TABLE change_request ADD COLUMN build_status VARCHAR(20);
ALTER TABLE change_request ADD COLUMN build_message TEXT;
