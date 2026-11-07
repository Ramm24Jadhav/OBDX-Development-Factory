-- Modernization (docs/MODERNIZATION.md): the path a workspace chose, the plans of both paths, the runs that build a wave
-- or a module as a change, and the settings of a target technology.

-- The chosen path: ui (premium components) or migration (another technology), its scope and how it runs.
CREATE TABLE modernization_choice (
    workspace_id UUID PRIMARY KEY REFERENCES workspace (id) ON DELETE CASCADE,
    path         VARCHAR(20)              NOT NULL,
    scope        VARCHAR(20)              NOT NULL,
    modules      JSONB                    NOT NULL DEFAULT '[]',
    mode         VARCHAR(20)              NOT NULL,
    analysis     VARCHAR(20)              NOT NULL,
    technology   VARCHAR(40),
    state        VARCHAR(20)              NOT NULL,
    saved_by     VARCHAR(200),
    saved_at     TIMESTAMP WITH TIME ZONE NOT NULL,
    started_at   TIMESTAMP WITH TIME ZONE
);

-- The plan of one path: the UI path's waves or the migration's module order and the team's weeks.
CREATE TABLE modernization_plan (
    workspace_id UUID                     NOT NULL REFERENCES workspace (id) ON DELETE CASCADE,
    path         VARCHAR(20)              NOT NULL,
    plan         JSONB                    NOT NULL,
    saved_by     VARCHAR(200),
    saved_at     TIMESTAMP WITH TIME ZONE NOT NULL,
    PRIMARY KEY (workspace_id, path)
);

-- One wave (UI path) or module (migration) being built: the brief became an approved requirement and a change. Its state
-- follows the change; rejected and the reason are kept here.
CREATE TABLE modernization_run (
    id             UUID PRIMARY KEY,
    workspace_id   UUID                     NOT NULL REFERENCES workspace (id) ON DELETE CASCADE,
    path           VARCHAR(20)              NOT NULL,
    subject        VARCHAR(300)             NOT NULL,
    screens        JSONB                    NOT NULL DEFAULT '[]',
    technology     VARCHAR(40),
    requirement_id UUID REFERENCES requirement (id) ON DELETE SET NULL,
    change_id      UUID REFERENCES change_request (id) ON DELETE SET NULL,
    rejected       BOOLEAN                  NOT NULL DEFAULT FALSE,
    reason         TEXT,
    started_by     VARCHAR(200),
    started_at     TIMESTAMP WITH TIME ZONE NOT NULL,
    finished_at    TIMESTAMP WITH TIME ZONE
);
CREATE INDEX modernization_run_workspace_idx ON modernization_run (workspace_id, started_at DESC);
CREATE INDEX modernization_run_change_idx ON modernization_run (change_id);

-- A workspace's settings for one target technology (React, React Native, Angular); the OBDX connection is not stored here.
CREATE TABLE technology_setting (
    workspace_id UUID                     NOT NULL REFERENCES workspace (id) ON DELETE CASCADE,
    technology   VARCHAR(40)              NOT NULL,
    settings     JSONB                    NOT NULL,
    saved_by     VARCHAR(200),
    saved_at     TIMESTAMP WITH TIME ZONE NOT NULL,
    PRIMARY KEY (workspace_id, technology)
);
