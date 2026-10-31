-- Components a team makes in the designer (from a description, an image or a Figma frame), offered in the palette of
-- the workspace. html, css and script are what a screen element gets when the component is placed.
CREATE TABLE custom_component (
    id           UUID PRIMARY KEY,
    workspace_id UUID          NOT NULL REFERENCES workspace (id) ON DELETE CASCADE,
    name         VARCHAR(200)  NOT NULL,
    tag          VARCHAR(200)  NOT NULL,
    description  TEXT,
    html         TEXT          NOT NULL,
    css          TEXT,
    script       TEXT,
    source       VARCHAR(300),
    created_at   TIMESTAMPTZ   NOT NULL,
    created_by   VARCHAR(200),
    UNIQUE (workspace_id, tag)
);
