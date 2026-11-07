-- Review comments: a comment the team has dealt with is marked resolved (by whom and when), and a reviewer's approval
-- through a review link is a decision rather than a comment.
ALTER TABLE screen_design_comment ADD COLUMN kind VARCHAR(20) NOT NULL DEFAULT 'COMMENT';
ALTER TABLE screen_design_comment ADD COLUMN resolved_by VARCHAR(200);
ALTER TABLE screen_design_comment ADD COLUMN resolved_at TIMESTAMP WITH TIME ZONE;

-- Approvals recorded before this migration were stored as a fixed comment text
UPDATE screen_design_comment SET kind = 'APPROVAL'
WHERE from_review AND component_id IS NULL AND text ~ '^Approved version [0-9]+\.$';
