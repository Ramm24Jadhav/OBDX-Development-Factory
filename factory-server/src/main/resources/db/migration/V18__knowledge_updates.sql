-- Keeping the knowledge base current. Oracle republishes manuals for patchsets and fixes, and banks keep their own and
-- patchset-specific documents: a newer file of a document becomes a new revision (the old one is kept as history,
-- without sections), folders are watched for new and changed files, and notes that cite a section that changed are
-- flagged for review.

ALTER TABLE knowledge_document ADD COLUMN patchset VARCHAR(100);           -- e.g. 25.2.0.1 or a patch number; null: the release
ALTER TABLE knowledge_document ADD COLUMN superseded_by UUID REFERENCES knowledge_document (id) ON DELETE SET NULL;
ALTER TABLE knowledge_document ADD COLUMN superseded_at TIMESTAMPTZ;
ALTER TABLE knowledge_document ADD COLUMN source_id UUID;                  -- the watched folder it came from

-- A folder whose documents are imported again when they change (checked on a schedule and on request).
CREATE TABLE knowledge_source (
    id           UUID PRIMARY KEY,
    workspace_id UUID REFERENCES workspace (id) ON DELETE CASCADE,
    folder       VARCHAR(1000) NOT NULL,
    obdx_version VARCHAR(20)   NOT NULL,
    patchset     VARCHAR(100),
    last_scan_at TIMESTAMPTZ,
    last_result  TEXT,
    created_by   VARCHAR(100),
    created_at   TIMESTAMPTZ   NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX knowledge_source_folder_idx ON knowledge_source (folder, obdx_version, COALESCE(workspace_id, '00000000-0000-0000-0000-000000000000'));

ALTER TABLE knowledge_note ADD COLUMN needs_review TEXT;                   -- why the note must be checked again
