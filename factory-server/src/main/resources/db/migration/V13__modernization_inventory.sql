-- The modernization inventory of a workspace (screens, services, roles, flows), scanned from its imported code.
CREATE TABLE modernization_inventory (
    workspace_id UUID PRIMARY KEY REFERENCES workspace (id) ON DELETE CASCADE,
    revision     BIGINT,
    scanned_at   TIMESTAMP WITH TIME ZONE NOT NULL,
    inventory    JSONB NOT NULL
);
