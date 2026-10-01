-- ==============================================================================
-- Migration: Phase 3 - Project Milestones & Cycle Closure / Rollover Engine
-- Strict Alignment with plan2/linear_system_implementation_plan.md
-- ==============================================================================

-- 1. Project Milestones Table
CREATE TABLE IF NOT EXISTS project_milestones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    target_date DATE,
    completed_at TIMESTAMPTZ,
    sort_order VARCHAR(255) COLLATE "C" NOT NULL DEFAULT '0|h00000:',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Performance Index for Milestones
CREATE INDEX IF NOT EXISTS idx_project_milestones_proj ON project_milestones (project_id, sort_order);

-- Permissions and Role Grants
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, anon, authenticated, service_role;
