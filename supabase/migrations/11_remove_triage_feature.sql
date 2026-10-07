-- ==============================================================================
-- Migration: Remove Triage Inbox Feature
-- Removes triage from state_category enum, removes snoozed_until from issues
-- ==============================================================================

-- 1. Remove snoozed_until column from issues table
ALTER TABLE issues DROP COLUMN IF EXISTS snoozed_until;

-- 2. Note: We cannot easily remove 'triage' from the state_category enum
--    in PostgreSQL without recreating the enum. The enum value remains
--    but is no longer used by application logic. New teams will not 
--    have a triage state created during provisioning.