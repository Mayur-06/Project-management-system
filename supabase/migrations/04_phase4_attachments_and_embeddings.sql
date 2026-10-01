-- ==============================================================================
-- Migration: Phase 4 - Attachments, pgvector Embeddings & Match Function
-- Strict Alignment with plan/linear_system_implementation_plan.md
-- ==============================================================================

-- 1. Enable pgvector Extension
CREATE EXTENSION IF NOT EXISTS "vector";

-- 2. File Attachments Table
CREATE TABLE IF NOT EXISTS issue_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    issue_id UUID NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id),
    file_name VARCHAR(255) NOT NULL,
    file_size INT NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    storage_path TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. pgvector Semantic Embeddings Table
CREATE TABLE IF NOT EXISTS issue_embeddings (
    issue_id UUID PRIMARY KEY REFERENCES issues(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    embedding VECTOR(768),
    embedding_model VARCHAR(50) DEFAULT 'gemini-embedding-001',
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_issue_attachments_issue ON issue_attachments (issue_id);
CREATE INDEX IF NOT EXISTS idx_issue_embeddings_org ON issue_embeddings (organization_id);

-- HNSW Vector Index
CREATE INDEX IF NOT EXISTS idx_issue_embeddings_hnsw ON issue_embeddings 
USING hnsw (embedding vector_cosine_ops) 
WITH (m = 16, ef_construction = 64);

-- 4. Match Function with Iterative Scan Configuration (Problem Set 5)
CREATE OR REPLACE FUNCTION match_similar_issues(
    query_embedding VECTOR(768),
    match_threshold FLOAT,
    match_count INT,
    p_organization_id UUID
)
RETURNS TABLE (
    issue_id UUID,
    similarity FLOAT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Ensure multi-tenant filtered query does not get truncated by global HNSW limits
    SET LOCAL hnsw.iterative_scan = 'relaxed_order';
    
    RETURN QUERY
    SELECT 
        ie.issue_id,
        (1 - (ie.embedding <=> query_embedding))::FLOAT AS similarity
    FROM issue_embeddings ie
    WHERE ie.organization_id = p_organization_id
      AND (1 - (ie.embedding <=> query_embedding)) >= match_threshold
    ORDER BY ie.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

-- Permissions and Role Grants
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, anon, authenticated, service_role;
