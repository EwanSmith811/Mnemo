-- Store extracted document text for RAG chat
ALTER TABLE documents ADD COLUMN content text;
