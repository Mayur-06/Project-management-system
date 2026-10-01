-- 05_invitations.sql: Workspace Invitations Table
CREATE TABLE IF NOT EXISTS workspace_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    role member_role NOT NULL DEFAULT 'member',
    invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(organization_id, email)
);

-- RLS
ALTER TABLE workspace_invitations ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    DROP POLICY IF EXISTS "Public or backend access for workspace invitations" ON workspace_invitations;
    CREATE POLICY "Public or backend access for workspace invitations" ON workspace_invitations FOR ALL USING (true);
EXCEPTION
    WHEN undefined_object THEN null;
END $$;
