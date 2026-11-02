-- Every plan a change has had (from the impact analysis, or edited before approval), so revisions can be compared,
-- and what reviewers said about them: comments, a request for changes, and the approval.
CREATE TABLE change_plan_revision (
    change_id  UUID                     NOT NULL REFERENCES change_request (id) ON DELETE CASCADE,
    revision   INTEGER                  NOT NULL,
    plan       JSONB                    NOT NULL,
    origin     VARCHAR(20)              NOT NULL,
    created_by VARCHAR(200),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    PRIMARY KEY (change_id, revision)
);

CREATE TABLE change_plan_comment (
    id         UUID PRIMARY KEY,
    seq        BIGINT GENERATED ALWAYS AS IDENTITY,
    change_id  UUID                     NOT NULL REFERENCES change_request (id) ON DELETE CASCADE,
    revision   INTEGER,
    kind       VARCHAR(30)              NOT NULL,
    author     VARCHAR(200)             NOT NULL,
    text       TEXT                     NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL
);
CREATE INDEX change_plan_comment_change_idx ON change_plan_comment (change_id, seq);

-- The plans changes have now become their first revision; an approved one also gets its approval
INSERT INTO change_plan_revision (change_id, revision, plan, origin, created_by, created_at)
SELECT id, 1, plan, 'ANALYZED', NULL, COALESCE(plan_approved_at, updated_at)
FROM change_request
WHERE plan IS NOT NULL;

INSERT INTO change_plan_comment (id, change_id, revision, kind, author, text, created_at)
SELECT md5('approval:' || id::text)::uuid, id, 1, 'APPROVED', plan_approved_by, '', plan_approved_at
FROM change_request
WHERE plan IS NOT NULL AND plan_approved_at IS NOT NULL AND plan_approved_by IS NOT NULL;
