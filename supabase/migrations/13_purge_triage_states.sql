-- ==============================================================================
-- Migration: 13_purge_triage_states.sql
-- Permanently remove all triage workflow states from the database
-- ==============================================================================

-- 1. Reassign any remaining issues if any exist (safety guard)
UPDATE issues
SET state_id = (
    SELECT ws.id 
    FROM workflow_states ws 
    WHERE ws.team_id = issues.team_id AND ws.is_default = TRUE 
    LIMIT 1
)
WHERE state_id IN (
    SELECT id FROM workflow_states WHERE category::text ILIKE '%triage%' OR name ILIKE '%triage%'
);

-- 2. Delete all workflow_states with category 'triage' or name 'Triage'
DELETE FROM workflow_states
WHERE category::text ILIKE '%triage%' OR name ILIKE '%triage%';
