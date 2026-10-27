-- Version pack rules turned off for a workspace, because the bank's codebase does it differently.
CREATE TABLE workspace_disabled_rule (
    workspace_id UUID         NOT NULL REFERENCES workspace (id) ON DELETE CASCADE,
    rule_id      VARCHAR(64)  NOT NULL,
    disabled_by  VARCHAR(200),
    disabled_at  TIMESTAMP WITH TIME ZONE NOT NULL,
    PRIMARY KEY (workspace_id, rule_id)
);
