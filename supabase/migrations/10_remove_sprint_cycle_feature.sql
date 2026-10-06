-- ==============================================================================
-- Migration: Remove Sprint/Cycle Feature
-- Removes cycles table, cycle_id from issues, cycle_duration_weeks from teams
-- ==============================================================================

-- 1. Drop cycle_id index on issues
DROP INDEX IF EXISTS idx_issues_cycle_id;

-- 2. Remove cycle_id column from issues table
ALTER TABLE issues DROP COLUMN IF EXISTS cycle_id;

-- 3. Drop cycles table
DROP TABLE IF EXISTS cycles CASCADE;

-- 4. Remove cycle_duration_weeks from teams table
ALTER TABLE teams DROP COLUMN IF EXISTS cycle_duration_weeks;