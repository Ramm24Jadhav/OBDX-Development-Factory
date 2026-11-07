-- Issue Analyzer phase 3: who released a diagnosis, screenshots with customer data hidden, and issue events for the
-- bell menu.

ALTER TABLE issue ADD COLUMN released_by VARCHAR(200);

-- How many areas with customer data were blacked out in a screenshot; null when it was not checked (no local model).
ALTER TABLE issue_file ADD COLUMN hidden_areas INTEGER;

-- What happened to an issue, for notifications: FILED, BANK_ANSWER, ANALYZED, CHECK_DONE, ANSWERED, GROUPED.
CREATE TABLE issue_event (
    id           UUID PRIMARY KEY,
    workspace_id UUID         NOT NULL REFERENCES workspace (id) ON DELETE CASCADE,
    issue_id     UUID         NOT NULL REFERENCES issue (id) ON DELETE CASCADE,
    kind         VARCHAR(20)  NOT NULL,
    text         VARCHAR(500) NOT NULL,
    failed       BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at   TIMESTAMPTZ  NOT NULL
);
CREATE INDEX issue_event_workspace_idx ON issue_event (workspace_id, created_at DESC);
