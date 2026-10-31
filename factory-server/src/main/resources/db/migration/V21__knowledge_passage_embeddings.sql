-- Notes are embedded again as passages (for the embedding models that tell questions from passages, nomic-embed-text
-- and e5); the documents are read again at startup for the same reason (KnowledgeImporter.READER_VERSION 3).
UPDATE knowledge_note SET embedding = NULL;
