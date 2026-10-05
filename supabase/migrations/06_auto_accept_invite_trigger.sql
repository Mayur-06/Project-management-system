-- 06_auto_accept_invite_trigger.sql: Automatically activate workspace membership on signup for invited users
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

-- Trigger on auth.users after insert
DROP TRIGGER IF EXISTS on_auth_user_created_accept_invites ON auth.users;
CREATE TRIGGER on_auth_user_created_accept_invites
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_user_invitation_acceptance();
