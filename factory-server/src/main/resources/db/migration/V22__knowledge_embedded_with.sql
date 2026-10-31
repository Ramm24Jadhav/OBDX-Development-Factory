-- Which embedding server and model embedded a document's sections ("http://localhost:11434/v1 nomic-embed-text:latest"),
-- so that when the model changes on the Models page the documents it did not embed are embedded again.
ALTER TABLE knowledge_document ADD COLUMN embedded_with VARCHAR(500);
