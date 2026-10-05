-- ==============================================================================
-- Migration: 09_fix_security_and_schema_audit_defects.sql
-- Fixes:
-- 1. C-4: Guard invitation acceptance trigger against unconfirmed emails.
-- 2. H-7: Add UNIQUE (team_id, identifier) constraint on issues.
-- 3. M-7: Add CHECK (estimate IS NULL OR estimate >= 0) constraint on issues.
-- 4. L-14: Add updated_at column to projects table.
-- ==============================================================================

-- 1. Guard invitation acceptance trigger (C-4)
CREATE OR REPLACE FUNCTION public.handle_user_invitation_acceptance()
RETURNS TRIGGER AS $$
BEGIN
    -- Security (C-4): Only grant workspace membership if the user's email has been confirmed
    IF NEW.email_confirmed_at IS NULL THEN
        RETURN NEW;
    END IF;

    -- Check if there are pending invitations for this new user's email
    INSERT INTO public.workspace_members (organization_id, user_id, role)
    SELECT organization_id, NEW.id, role
    FROM public.workspace_invitations
    WHERE LOWER(email) = LOWER(NEW.email)
      AND status = 'pending'
    ON CONFLICT (organization_id, user_id) DO NOTHING;

    -- Update invitation status to accepted
    UPDATE public.workspace_invitations
    SET status = 'accepted'
    WHERE LOWER(email) = LOWER(NEW.email)
      AND status = 'pending';

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Re-create trigger on both INSERT and UPDATE of email_confirmed_at
DROP TRIGGER IF EXISTS on_auth_user_created_accept_invites ON auth.users;
CREATE TRIGGER on_auth_user_created_accept_invites
    AFTER INSERT OR UPDATE OF email_confirmed_at ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_user_invitation_acceptance();

-- 2. Add UNIQUE(team_id, identifier) on issues (H-7)
DO $$ BEGIN
    ALTER TABLE issues ADD CONSTRAINT check_issues_team_identifier_unique UNIQUE (team_id, identifier);
EXCEPTION
    WHEN duplicate_table OR duplicate_object THEN null;
END $$;

-- 3. Add CHECK (estimate >= 0) on issues (M-7)
DO $$ BEGIN
    ALTER TABLE issues ADD CONSTRAINT check_issue_estimate_non_negative CHECK (estimate IS NULL OR estimate >= 0);
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 4. Add updated_at column on projects (L-14)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
