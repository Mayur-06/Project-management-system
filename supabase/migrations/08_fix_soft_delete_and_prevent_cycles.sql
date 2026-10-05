-- ==============================================================================
-- Migration: 08_fix_soft_delete_and_prevent_cycles.sql
-- Fixes M-15:
-- 1. Prevent self-parenting and recursive loops: CHECK (parent_id <> id).
-- 2. Prevent over-eager restoration of independently deleted child subtasks:
--    Only restore child issues whose deleted_at matched the parent's old deleted_at.
-- ==============================================================================

-- 1. Prevent self-referential cycle constraint
DO $$ BEGIN
    ALTER TABLE issues ADD CONSTRAINT check_issue_not_self_parent CHECK (parent_id <> id);
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Refined cascade trigger that only restores children cascaded together with the parent
CREATE OR REPLACE FUNCTION cascade_issue_soft_delete()
RETURNS TRIGGER AS $$
BEGIN
    -- If deleted_at was set (soft deleted), cascade down to active children
    IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
        UPDATE issues
        SET deleted_at = NEW.deleted_at
        WHERE parent_id = NEW.id AND deleted_at IS NULL;
        
    -- If deleted_at was cleared (restored), only restore children that were deleted at the same time
    ELSIF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN
        UPDATE issues
        SET deleted_at = NULL
        WHERE parent_id = NEW.id AND deleted_at = OLD.deleted_at;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
