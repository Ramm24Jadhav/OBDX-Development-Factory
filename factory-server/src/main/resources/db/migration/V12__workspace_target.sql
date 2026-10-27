-- The UI technology a workspace generates screens for (target pack) and, for a new app, its folder in the repository.
ALTER TABLE workspace ADD COLUMN target VARCHAR(40) NOT NULL DEFAULT 'jet';
ALTER TABLE workspace ADD COLUMN app_folder VARCHAR(500);
