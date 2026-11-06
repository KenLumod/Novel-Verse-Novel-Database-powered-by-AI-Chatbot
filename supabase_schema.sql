-- =================================================================
-- NovelVerse: Supabase PostgreSQL Schema & pgvector Setup
-- Run this script inside your Supabase Project -> SQL Editor
-- =================================================================

-- 1. Enable the pgvector extension to work with embedding vectors
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Drop existing table if recreating (Careful in production!)
-- DROP TABLE IF EXISTS novels CASCADE;

-- 3. Create the novels table
-- Note: Default embedding dimension is 384 for all-MiniLM-L6-v2 (or 768 if using text-embedding-004)
CREATE TABLE IF NOT EXISTS novels (
    id BIGSERIAL PRIMARY KEY,
    novel_id BIGINT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    associated_names TEXT,
    img_url TEXT,
    genres TEXT,
    tags TEXT,
    description TEXT NOT NULL,
    rating TEXT,
    language TEXT,
    authors TEXT,
    year INT,
    status_coo TEXT,
    chapters TEXT,
    embedding vector(384), -- Change to vector(768) if using Gemini embeddings
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Deny direct access from browser-facing Supabase roles. The backend uses the
-- service_role key (kept only in server environment variables), which bypasses
-- RLS. Admin mutations are separately authenticated by FastAPI.
ALTER TABLE novels ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE novels FROM anon, authenticated;
DROP POLICY IF EXISTS "No direct client access" ON novels;
CREATE POLICY "No direct client access" ON novels
    FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

-- 4. Create an HNSW index on the embedding vector for fast cosine similarity search
CREATE INDEX IF NOT EXISTS novels_embedding_hnsw_idx 
ON novels 
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- 5. Create an index on title and novel_id for fast lookup
CREATE INDEX IF NOT EXISTS novels_novel_id_idx ON novels(novel_id);
CREATE INDEX IF NOT EXISTS novels_title_idx ON novels USING gin (to_tsvector('english', title));

-- 6. Create RPC stored procedure for semantic similarity search
-- This function computes cosine distance between query_embedding and description embeddings
CREATE OR REPLACE FUNCTION match_novels (
    query_embedding vector,
    match_threshold float DEFAULT 0.25,
    match_count int DEFAULT 5
)
RETURNS TABLE (
    id BIGINT,
    novel_id BIGINT,
    title TEXT,
    img_url TEXT,
    description TEXT,
    rating TEXT,
    language TEXT,
    authors TEXT,
    status_coo TEXT,
    similarity float
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
    RETURN QUERY
    SELECT
        n.id,
        n.novel_id,
        n.title,
        n.img_url,
        n.description,
        n.rating,
        n.language,
        n.authors,
        n.status_coo,
        1 - (n.embedding <=> query_embedding) AS similarity
    FROM novels n
    WHERE n.embedding IS NOT NULL
      AND 1 - (n.embedding <=> query_embedding) > match_threshold
    ORDER BY n.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

-- Prevent browser-facing roles from calling the search RPC directly.
REVOKE ALL ON FUNCTION match_novels(vector, float, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION match_novels(vector, float, int) TO service_role;

