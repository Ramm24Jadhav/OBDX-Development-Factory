-- Every content a change's file had, in the order it was written (by the model, written again with a note, or edited),
-- so Review can compare two versions of the change: which files changed between them, and how.
CREATE TABLE change_file_revision (
    id         BIGSERIAL PRIMARY KEY,
    change_id  UUID        NOT NULL REFERENCES change_request (id) ON DELETE CASCADE,
    path       TEXT        NOT NULL,
    content    TEXT        NOT NULL,
    edited     BOOLEAN     NOT NULL DEFAULT FALSE,
    written_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX change_file_revision_change ON change_file_revision (change_id, id);
