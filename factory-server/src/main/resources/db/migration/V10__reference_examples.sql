-- Files of a bank's codebase that developers chose as reference examples for a version pack recipe part.
CREATE TABLE workspace_reference_example (
    workspace_id UUID          NOT NULL REFERENCES workspace (id) ON DELETE CASCADE,
    recipe_id    VARCHAR(64)   NOT NULL,
    part_id      VARCHAR(64)   NOT NULL,
    path         VARCHAR(2000) NOT NULL,
    pinned_by    VARCHAR(200),
    pinned_at    TIMESTAMP WITH TIME ZONE NOT NULL,
    PRIMARY KEY (workspace_id, recipe_id, part_id, path)
);
