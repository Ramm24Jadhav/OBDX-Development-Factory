-- A workspace's component style, saved in the Component factory: the default design option, motion and preview theme,
-- and the components that have their own. New code and premium pack upgrades use it.
CREATE TABLE component_style (
    workspace_id UUID PRIMARY KEY REFERENCES workspace (id) ON DELETE CASCADE,
    style        JSONB        NOT NULL,
    saved_by     VARCHAR(200),
    saved_at     TIMESTAMP WITH TIME ZONE NOT NULL
);
