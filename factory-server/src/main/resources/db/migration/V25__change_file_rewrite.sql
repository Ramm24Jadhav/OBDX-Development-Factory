-- A rewrite (Write again) the model's limit stopped part-way: kept beside the file's current version, which stays its content
-- for review and delivery, so the next Write again or Continue goes on from it instead of starting over.
ALTER TABLE change_file ADD COLUMN rewrite TEXT;
