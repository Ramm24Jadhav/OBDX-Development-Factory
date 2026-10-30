-- Which version of the reading split a document into sections. When the reading improves (version 2: the PDF's
-- bookmarks are the headings, numbered steps stay in their procedure), older documents are read again at startup.
ALTER TABLE knowledge_document ADD COLUMN reader_version INTEGER NOT NULL DEFAULT 1;
