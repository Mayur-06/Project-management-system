-- ==============================================================================
-- Migration: 07_enable_rls_and_secure_permissions.sql
-- Fixes C-1, C-5: Enable RLS on all remaining public tables, add tenant isolation
-- policies, revoke broad permissions from 'anon', and secure workspace invitations.
-- ==============================================================================

-- 1. Secure workspace_invitations (C-5)
ALTER TABLE IF EXISTS workspace_invitations ENABLE ROW LEVEL SECURITY;

-- Drop permissive policy
DROP POLICY IF EXISTS "Public or backend access for workspace invitations" ON workspace_invitations;
DROP POLICY IF EXISTS "Admins can view and manage workspace invitations" ON workspace_invitations;
DROP POLICY IF EXISTS "Users can view pending invitations for their email" ON workspace_invitations;

-- Only organization admins can view workspace invitations
CREATE POLICY "Admins can view and manage workspace invitations"
ON workspace_invitations FOR ALL
TO authenticated
USING (
    organization_id IN (
        SELECT organization_id FROM workspace_members
        WHERE user_id = auth.uid() AND role = 'admin'
    )
);

-- Users can view invitations addressed to their email
CREATE POLICY "Users can view pending invitations for their email"
ON workspace_invitations FOR SELECT
TO authenticated
USING (
    LOWER(email) = LOWER(auth.jwt()->>'email')
);

-- 2. Enable RLS on all previously unshielded tables (C-1)
ALTER TABLE IF EXISTS issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS issue_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS comment_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS issue_labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS project_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS issue_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS issue_embeddings ENABLE ROW LEVEL SECURITY;

-- 3. Tenant Isolation Policies for Authenticated Users

-- Issues policies
DROP POLICY IF EXISTS "Tenant isolation for issues" ON issues;
CREATE POLICY "Tenant isolation for issues"
ON issues FOR ALL
TO authenticated
USING (organization_id IN (SELECT get_user_org_ids()))
WITH CHECK (organization_id IN (SELECT get_user_org_ids()));

-- Issue Comments policies
DROP POLICY IF EXISTS "Tenant isolation for issue_comments" ON issue_comments;
CREATE POLICY "Tenant isolation for issue_comments"
ON issue_comments FOR ALL
TO authenticated
USING (
    issue_id IN (
        SELECT id FROM issues WHERE organization_id IN (SELECT get_user_org_ids())
    )
)
WITH CHECK (
    issue_id IN (
        SELECT id FROM issues WHERE organization_id IN (SELECT get_user_org_ids())
    )
);

-- Comment Reactions policies
DROP POLICY IF EXISTS "Tenant isolation for comment_reactions" ON comment_reactions;
CREATE POLICY "Tenant isolation for comment_reactions"
ON comment_reactions FOR ALL
TO authenticated
USING (
    comment_id IN (
        SELECT ic.id FROM issue_comments ic
        JOIN issues i ON ic.issue_id = i.id
        WHERE i.organization_id IN (SELECT get_user_org_ids())
    )
)
WITH CHECK (
    comment_id IN (
        SELECT ic.id FROM issue_comments ic
        JOIN issues i ON ic.issue_id = i.id
        WHERE i.organization_id IN (SELECT get_user_org_ids())
    )
);

-- Activity Logs policies: read-only for tenant members; inserts allowed for their org
DROP POLICY IF EXISTS "Tenant members can view activity logs" ON activity_logs;
CREATE POLICY "Tenant members can view activity logs"
ON activity_logs FOR SELECT
TO authenticated
USING (organization_id IN (SELECT get_user_org_ids()));

DROP POLICY IF EXISTS "Tenant members can append activity logs" ON activity_logs;
CREATE POLICY "Tenant members can append activity logs"
ON activity_logs FOR INSERT
TO authenticated
WITH CHECK (organization_id IN (SELECT get_user_org_ids()));

-- Labels policies
DROP POLICY IF EXISTS "Tenant isolation for labels" ON labels;
CREATE POLICY "Tenant isolation for labels"
ON labels FOR ALL
TO authenticated
USING (organization_id IN (SELECT get_user_org_ids()))
WITH CHECK (organization_id IN (SELECT get_user_org_ids()));

-- Issue Labels policies
DROP POLICY IF EXISTS "Tenant isolation for issue_labels" ON issue_labels;
CREATE POLICY "Tenant isolation for issue_labels"
ON issue_labels FOR ALL
TO authenticated
USING (
    issue_id IN (
        SELECT id FROM issues WHERE organization_id IN (SELECT get_user_org_ids())
    )
)
WITH CHECK (
    issue_id IN (
        SELECT id FROM issues WHERE organization_id IN (SELECT get_user_org_ids())
    )
);

-- Projects policies
DROP POLICY IF EXISTS "Tenant isolation for projects" ON projects;
CREATE POLICY "Tenant isolation for projects"
ON projects FOR ALL
TO authenticated
USING (organization_id IN (SELECT get_user_org_ids()))
WITH CHECK (organization_id IN (SELECT get_user_org_ids()));

-- Cycles policies (cycles are attached to teams)
DROP POLICY IF EXISTS "Tenant isolation for cycles" ON cycles;
CREATE POLICY "Tenant isolation for cycles"
ON cycles FOR ALL
TO authenticated
USING (
    team_id IN (
        SELECT id FROM teams WHERE organization_id IN (SELECT get_user_org_ids())
    )
)
WITH CHECK (
    team_id IN (
        SELECT id FROM teams WHERE organization_id IN (SELECT get_user_org_ids())
    )
);

-- Project Milestones policies
DROP POLICY IF EXISTS "Tenant isolation for project_milestones" ON project_milestones;
CREATE POLICY "Tenant isolation for project_milestones"
ON project_milestones FOR ALL
TO authenticated
USING (
    project_id IN (
        SELECT id FROM projects WHERE organization_id IN (SELECT get_user_org_ids())
    )
)
WITH CHECK (
    project_id IN (
        SELECT id FROM projects WHERE organization_id IN (SELECT get_user_org_ids())
    )
);

-- Issue Attachments policies
DROP POLICY IF EXISTS "Tenant isolation for issue_attachments" ON issue_attachments;
CREATE POLICY "Tenant isolation for issue_attachments"
ON issue_attachments FOR ALL
TO authenticated
USING (
    issue_id IN (
        SELECT id FROM issues WHERE organization_id IN (SELECT get_user_org_ids())
    )
)
WITH CHECK (
    issue_id IN (
        SELECT id FROM issues WHERE organization_id IN (SELECT get_user_org_ids())
    )
);

-- Issue Embeddings policies
DROP POLICY IF EXISTS "Tenant isolation for issue_embeddings" ON issue_embeddings;
CREATE POLICY "Tenant isolation for issue_embeddings"
ON issue_embeddings FOR ALL
TO authenticated
USING (organization_id IN (SELECT get_user_org_ids()))
WITH CHECK (organization_id IN (SELECT get_user_org_ids()));

-- 4. Revoke anonymous access to protect against anon key leakage (C-1)
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;

-- Re-grant minimum required schema usage and sequences to authenticated and service_role
GRANT USAGE ON SCHEMA public TO authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO authenticated, service_role;
