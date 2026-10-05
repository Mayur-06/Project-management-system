-- ==============================================================================
-- Migration: Phase 2 - Core Issues Engine, Labels, Comments, Reactions,
-- Activity Logs, LexoRank Support, and Cascading Soft-Delete Trigger
-- Strict Alignment with plan2/linear_system_implementation_plan.md
-- ==============================================================================

-- 1. Enums
DO $$ BEGIN
    CREATE TYPE issue_priority AS ENUM ('none', 'low', 'medium', 'high', 'urgent');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE project_health AS ENUM ('on_track', 'at_risk', 'off_track');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Projects & Cycles Containers (Minimal schemas required for Issue FK references)
CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL,
    health project_health DEFAULT 'on_track',
    sort_order VARCHAR(255) COLLATE "C" NOT NULL DEFAULT '0|h00000:',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(organization_id, slug)
);

CREATE TABLE IF NOT EXISTS cycles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    number INT NOT NULL,
    name VARCHAR(255),
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(team_id, number)
);

-- 3. Labels Table
CREATE TABLE IF NOT EXISTS labels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(50) NOT NULL,
    color VARCHAR(20) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(organization_id, name)
);

-- 4. Issues Core Table
CREATE TABLE IF NOT EXISTS issues (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE RESTRICT,
    number INT NOT NULL,
    identifier VARCHAR(30) NOT NULL,
    title VARCHAR(500) NOT NULL,
    description_json JSONB,
    description_text TEXT,
    priority issue_priority DEFAULT 'none' NOT NULL,
    estimate INT CHECK (estimate IS NULL OR estimate >= 0),
    state_id UUID NOT NULL REFERENCES workflow_states(id),
    assignee_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    creator_id UUID NOT NULL REFERENCES auth.users(id),
    project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
    cycle_id UUID REFERENCES cycles(id) ON DELETE SET NULL,
    parent_id UUID REFERENCES issues(id) ON DELETE SET NULL,
    sort_order VARCHAR(255) COLLATE "C" NOT NULL,
    version INT DEFAULT 1 NOT NULL,
    last_modified_by_session VARCHAR(100),
    due_date DATE,
    snoozed_until TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    canceled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    UNIQUE(team_id, number),
    UNIQUE(team_id, identifier)
);

-- 5. Issue Labels Join Table
CREATE TABLE IF NOT EXISTS issue_labels (
    issue_id UUID NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    label_id UUID NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
    PRIMARY KEY (issue_id, label_id)
);

-- 6. Issue Comments Table
CREATE TABLE IF NOT EXISTS issue_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    issue_id UUID NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    body_json JSONB NOT NULL,
    body_text TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

-- 7. Comment Reactions Table
CREATE TABLE IF NOT EXISTS comment_reactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    comment_id UUID NOT NULL REFERENCES issue_comments(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    emoji VARCHAR(32) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(comment_id, user_id, emoji)
);

-- 8. Activity Audit Logs Table
CREATE TABLE IF NOT EXISTS activity_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    issue_id UUID REFERENCES issues(id) ON DELETE CASCADE,
    actor_id UUID NOT NULL REFERENCES auth.users(id),
    action VARCHAR(100) NOT NULL,
    changes JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================================================
-- Indexes for High Performance & Board Acceleration
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_issues_board_sort ON issues (team_id, state_id, sort_order) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_issues_org_id ON issues (organization_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_issues_assignee_id ON issues (assignee_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_issues_cycle_id ON issues (cycle_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_issues_project_id ON issues (project_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_issues_parent_id ON issues (parent_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_issues_identifier ON issues (identifier);
CREATE INDEX IF NOT EXISTS idx_issue_comments_issue ON issue_comments (issue_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_comment_reactions_comment ON comment_reactions (comment_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_issue ON activity_logs (issue_id);

-- ==============================================================================
-- Triggers: Soft-Delete Cascading Across Hierarchical Subtasks (Problem Set 6)
-- ==============================================================================
CREATE OR REPLACE FUNCTION cascade_issue_soft_delete()
RETURNS TRIGGER AS $$
BEGIN
    -- If deleted_at was changed from NULL to timestamp, cascade down to subtasks
    IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
        UPDATE issues
        SET deleted_at = NEW.deleted_at
        WHERE parent_id = NEW.id AND deleted_at IS NULL;
    -- If deleted_at was restored from timestamp to NULL, restore immediate children
    ELSIF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN
        UPDATE issues
        SET deleted_at = NULL
        WHERE parent_id = NEW.id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_cascade_issue_soft_delete ON issues;
CREATE TRIGGER trigger_cascade_issue_soft_delete
AFTER UPDATE OF deleted_at ON issues
FOR EACH ROW
EXECUTE FUNCTION cascade_issue_soft_delete();

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

DROP TRIGGER IF EXISTS trigger_auto_issue_identifier ON issues;
CREATE TRIGGER trigger_auto_issue_identifier
BEFORE INSERT ON issues
FOR EACH ROW
EXECUTE FUNCTION trigger_set_issue_identifier();

-- Permissions and Role Grants
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, anon, authenticated, service_role;
