-- ==============================================================================
-- Migration: 12_add_assigned_by_to_issues.sql
-- Add assigned_by_id tracking to issues to support dynamic "who assigned to whom"
-- ==============================================================================

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'issues' AND column_name = 'assigned_by_id'
    ) THEN
        ALTER TABLE issues ADD COLUMN assigned_by_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
        CREATE INDEX IF NOT EXISTS idx_issues_assigned_by_id ON issues (assigned_by_id) WHERE deleted_at IS NULL;
    END IF;
END $$;

-- Backfill existing issues: if assignee_id is set, default assigned_by_id to creator_id
UPDATE issues
SET assigned_by_id = creator_id
WHERE assignee_id IS NOT NULL AND assigned_by_id IS NULL;
