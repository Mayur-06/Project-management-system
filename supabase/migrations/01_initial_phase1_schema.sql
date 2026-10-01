-- ==============================================================================
-- Migration: Phase 1 - Organizations, Workspaces, Teams, Members, Workflow States,
-- Security Definer Functions, Atomic Numbering Trigger, and Row-Level Security (RLS)
-- Strict Alignment with plan/linear_system_implementation_plan.md
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Enum Types
DO $$ BEGIN
    CREATE TYPE member_role AS ENUM ('admin', 'member', 'guest');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE state_category AS ENUM ('triage', 'backlog', 'unstarted', 'started', 'completed', 'canceled');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Organizations Table
CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    logo_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Workspace Members Table
CREATE TABLE IF NOT EXISTS workspace_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role member_role NOT NULL DEFAULT 'member',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(organization_id, user_id)
);

-- 4. Teams Table
CREATE TABLE IF NOT EXISTS teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    key VARCHAR(10) NOT NULL,
    issue_counter INT DEFAULT 0 NOT NULL,
    cycle_duration_weeks INT DEFAULT 2,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(organization_id, key)
);

-- 5. Team Members Table
CREATE TABLE IF NOT EXISTS team_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(team_id, user_id)
);

-- 6. Workflow States Table
CREATE TABLE IF NOT EXISTS workflow_states (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    color VARCHAR(20) NOT NULL,
    category state_category NOT NULL,
    position VARCHAR(255) COLLATE "C" NOT NULL,
    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_workspace_members_user ON workspace_members(user_id);
CREATE INDEX IF NOT EXISTS idx_workspace_members_org ON workspace_members(organization_id);
CREATE INDEX IF NOT EXISTS idx_teams_org ON teams(organization_id);
CREATE INDEX IF NOT EXISTS idx_team_members_team ON team_members(team_id);
CREATE INDEX IF NOT EXISTS idx_team_members_user ON team_members(user_id);
CREATE INDEX IF NOT EXISTS idx_workflow_states_team ON workflow_states(team_id, position);

-- ==============================================================================
-- 7. Security Definer Helper: User Organization IDs
-- ==============================================================================
CREATE OR REPLACE FUNCTION get_user_org_ids()
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT organization_id 
    FROM workspace_members 
    WHERE user_id = auth.uid();
$$;

-- ==============================================================================
-- 8. Atomic Issue Sequence Function & Trigger
-- ==============================================================================
CREATE OR REPLACE FUNCTION allocate_issue_identifier(p_team_id UUID)
RETURNS TABLE (issue_number INT, issue_identifier VARCHAR(30)) AS $$
DECLARE
    v_key VARCHAR(10);
    v_counter INT;
BEGIN
    UPDATE teams
    SET issue_counter = issue_counter + 1
    WHERE id = p_team_id
    RETURNING key, issue_counter INTO v_key, v_counter;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Team % not found', p_team_id;
    END IF;

    issue_number := v_counter;
    issue_identifier := v_key || '-' || v_counter;
    RETURN NEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to atomically allocate number and identifier before inserting issue if not pre-populated
CREATE OR REPLACE FUNCTION trigger_set_issue_identifier()
RETURNS TRIGGER AS $$
DECLARE
    v_num INT;
    v_ident VARCHAR(30);
BEGIN
    IF NEW.number IS NULL OR NEW.identifier IS NULL OR NEW.identifier = '' THEN
        SELECT issue_number, issue_identifier INTO v_num, v_ident
        FROM allocate_issue_identifier(NEW.team_id);
        
        NEW.number := v_num;
        NEW.identifier := v_ident;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==============================================================================
-- 9. Row-Level Security (RLS) Policies
-- ==============================================================================
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_states ENABLE ROW LEVEL SECURITY;

-- Organizations policies
DROP POLICY IF EXISTS "Users can view organizations they belong to" ON organizations;
CREATE POLICY "Users can view organizations they belong to"
ON organizations FOR SELECT
TO authenticated
USING (id IN (SELECT get_user_org_ids()));

-- Workspace members policies
DROP POLICY IF EXISTS "Users can view members in their organizations" ON workspace_members;
CREATE POLICY "Users can view members in their organizations"
ON workspace_members FOR SELECT
TO authenticated
USING (organization_id IN (SELECT get_user_org_ids()));

-- Teams policies
DROP POLICY IF EXISTS "Users can view teams in their organizations" ON teams;
CREATE POLICY "Users can view teams in their organizations"
ON teams FOR SELECT
TO authenticated
USING (organization_id IN (SELECT get_user_org_ids()));

-- Team members policies
DROP POLICY IF EXISTS "Users can view team memberships in their organizations" ON team_members;
CREATE POLICY "Users can view team memberships in their organizations"
ON team_members FOR SELECT
TO authenticated
USING (team_id IN (
    SELECT t.id FROM teams t WHERE t.organization_id IN (SELECT get_user_org_ids())
));

-- Workflow states policies
DROP POLICY IF EXISTS "Users can view workflow states in their organizations" ON workflow_states;
CREATE POLICY "Users can view workflow states in their organizations"
ON workflow_states FOR SELECT
TO authenticated
USING (team_id IN (
    SELECT t.id FROM teams t WHERE t.organization_id IN (SELECT get_user_org_ids())
));

-- ==============================================================================
-- 10. Permissions and Role Grants for Supabase
-- ==============================================================================
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres, anon, authenticated, service_role;
