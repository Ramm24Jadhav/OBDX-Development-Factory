-- Detected facts about a workspace's codebase (JSON list of facts), replaced on every scan.
CREATE TABLE project_profile (
    workspace_id UUID PRIMARY KEY REFERENCES workspace (id) ON DELETE CASCADE,
    revision     BIGINT,
    detected_at  TIMESTAMP WITH TIME ZONE NOT NULL,
    facts        JSONB NOT NULL
);

-- Values a developer confirmed or corrected. Kept across scans; they win over detected values.
CREATE TABLE project_profile_override (
    workspace_id UUID         NOT NULL REFERENCES workspace (id) ON DELETE CASCADE,
    fact_key     VARCHAR(100) NOT NULL,
    value        TEXT         NOT NULL,
    updated_at   TIMESTAMP WITH TIME ZONE NOT NULL,
    PRIMARY KEY (workspace_id, fact_key)
);
