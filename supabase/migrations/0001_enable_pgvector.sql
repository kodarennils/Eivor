-- Enables the pgvector extension so we can store embeddings for the
-- RAG system (retrieval over bygglov regulations / plan- och bygglagen)
-- that gets built in a later step.
create extension if not exists vector with schema extensions;
