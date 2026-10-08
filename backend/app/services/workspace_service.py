from datetime import datetime
from typing import List, Optional, Dict
from fastapi import HTTPException, status
from supabase import Client

from app.schemas.workspace import (
    OrganizationCreate,
    OrganizationUpdate,
    MemberInviteRequest,
    MemberRoleUpdate,
    OrganizationResponse,
    WorkspaceMemberResponse,
    WorkspaceMemberUser,
    UserWorkspaceItem,
    TeamSummary,
    MemberRole,
)


class WorkspaceService:
    @staticmethod
    def reconcile_user_invitations(user_id: str, email: Optional[str], db: Client) -> None:
        """
        Reconciles pending workspace invitations for a newly registered or authenticated user.
        If any invitations exist matching this user's verified email, adds them to workspace_members
        and marks the invitation status as 'accepted'.
        """
        if not email:
            return
        try:
            email_clean = email.strip().lower()
            # Fast check: skip immediately if there are no pending invitations for this email
            inv_res = (
                db.table("workspace_invitations")
                .select("id, organization_id, role")
                .eq("email", email_clean)
                .eq("status", "pending")
                .execute()
            )
            if not inv_res.data:
                return

            for inv in inv_res.data:
                    org_id = inv["organization_id"]
                    role = inv.get("role", "member")
                    db.table("workspace_members").upsert(
                        {
                            "organization_id": org_id,
                            "user_id": user_id,
                            "role": role,
                        },
                        on_conflict="organization_id,user_id",
                    ).execute()
                    db.table("workspace_invitations").update(
                        {"status": "accepted"}
                    ).eq("id", inv["id"]).execute()
        except Exception:
            pass

    @classmethod
    def get_user_workspaces(cls, user_id: str, db: Client, email: Optional[str] = None) -> List[UserWorkspaceItem]:
        """
        Retrieves all organizations/workspaces the authenticated user is a member of,
        including their role and available teams.
        """
        if email:
            cls.reconcile_user_invitations(user_id, email, db)

        # Query workspace_members joining organizations
        member_res = (
            db.table("workspace_members")
            .select("organization_id, role, organizations(*)")
            .eq("user_id", user_id)
            .execute()
        )

        workspaces: List[UserWorkspaceItem] = []
        if not member_res.data:
            return workspaces

        # Bulk-fetch all teams across all user organizations in a single query (eliminating N+1 overhead)
        org_ids = [
            row["organizations"]["id"]
            for row in member_res.data
            if row.get("organizations") and "id" in row["organizations"]
        ]

        teams_by_org: Dict[str, List[TeamSummary]] = {oid: [] for oid in org_ids}
        if len(org_ids) == 1:
            teams_res = (
                db.table("teams")
                .select("id, name, key, organization_id")
                .eq("organization_id", org_ids[0])
                .execute()
            )
            for t in (teams_res.data or []):
                oid = t.get("organization_id")
                if oid in teams_by_org:
                    teams_by_org[oid].append(TeamSummary(**t))
        elif len(org_ids) > 1:
            teams_res = (
                db.table("teams")
                .select("id, name, key, organization_id")
                .in_("organization_id", org_ids)
                .execute()
            )
            for t in (teams_res.data or []):
                oid = t.get("organization_id")
                if oid in teams_by_org:
                    teams_by_org[oid].append(TeamSummary(**t))

        for row in member_res.data:
            org_data = row.get("organizations")
            if not org_data:
                continue

            org_id = org_data["id"]
            teams_list = teams_by_org.get(org_id, [])

            workspaces.append(
                UserWorkspaceItem(
                    organization=OrganizationResponse(**org_data),
                    role=MemberRole(row.get("role", "member")),
                    teams=teams_list,
                )
            )

        return workspaces

    @classmethod
    def get_workspace_by_slug(cls, slug: str, user_id: str, db: Client, email: Optional[str] = None) -> OrganizationResponse:
        """
        Retrieves a workspace by its URL slug, ensuring the user has access.
        """
        if email:
            cls.reconcile_user_invitations(user_id, email, db)

        org_res = (
            db.table("organizations")
            .select("*")
            .eq("slug", slug)
            .limit(1)
            .execute()
        )

        if not org_res.data or len(org_res.data) == 0:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Workspace with slug '{slug}' not found",
            )

        org = org_res.data[0]

        # Verify membership
        member_check = (
            db.table("workspace_members")
            .select("id")
            .eq("organization_id", org["id"])
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )

        if not member_check.data or len(member_check.data) == 0:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have access to this workspace",
            )

        return OrganizationResponse(**org)

    @staticmethod
    def create_workspace(
        data: OrganizationCreate, user_id: str, db: Client
    ) -> OrganizationResponse:
        """
        Creates a new organization workspace and adds the creator as admin.
        """
        # Check slug uniqueness
        existing_res = (
            db.table("organizations")
            .select("id")
            .eq("slug", data.slug)
            .limit(1)
            .execute()
        )
        if existing_res.data and len(existing_res.data) > 0:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Organization with slug '{data.slug}' already exists",
            )

        # Insert organization
        insert_org = (
            db.table("organizations")
            .insert(
                {
                    "name": data.name,
                    "slug": data.slug,
                    "logo_url": data.logo_url,
                }
            )
            .execute()
        )

        if not insert_org.data or len(insert_org.data) == 0:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create organization",
            )

        created_org = insert_org.data[0]
        org_id = created_org["id"]

        # Insert membership as admin
        try:
            db.table("workspace_members").insert(
                {
                    "organization_id": org_id,
                    "user_id": user_id,
                    "role": MemberRole.ADMIN.value,
                }
            ).execute()
        except Exception as e:
            # Clean up the orphaned organization so the slug is not locked
            db.table("organizations").delete().eq("id", org_id).execute()
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Failed to assign workspace membership: {str(e)}",
            )

        return OrganizationResponse(**created_org)

    @staticmethod
    def update_workspace(
        slug: str, data: OrganizationUpdate, user_id: str, db: Client
    ) -> OrganizationResponse:
        org_res = db.table("organizations").select("*").eq("slug", slug).limit(1).execute()
        if not org_res.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Workspace with slug '{slug}' not found",
            )
        org = org_res.data[0]

        member_check = (
            db.table("workspace_members")
            .select("role")
            .eq("organization_id", org["id"])
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
        if not member_check.data or member_check.data[0].get("role") != "admin":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only organization admins can update workspace settings",
            )

        update_dict = {}
        if data.name is not None:
            update_dict["name"] = data.name
        if data.logo_url is not None:
            update_dict["logo_url"] = data.logo_url

        if update_dict:
            res = db.table("organizations").update(update_dict).eq("id", org["id"]).execute()
            if res.data:
                org = res.data[0]

        return OrganizationResponse(**org)

    @staticmethod
    def resolve_user_info(user_id: str, db: Client) -> tuple[str, str]:
        """
        Resolves real email and display name for a user_id from Supabase Auth admin
        or workspace invitations, with graceful fallback.
        """
        try:
            admin_user = db.auth.admin.get_user_by_id(user_id)
            if admin_user and hasattr(admin_user, "user") and admin_user.user:
                raw_email = getattr(admin_user.user, "email", None)
                if isinstance(raw_email, str) and "@" in raw_email:
                    meta = getattr(admin_user.user, "user_metadata", {})
                    raw_name = meta.get("full_name") if isinstance(meta, dict) else None
                    name = raw_name if isinstance(raw_name, str) else raw_email.split("@")[0]
                    return raw_email, name
        except Exception:
            pass

        try:
            inv_res = (
                db.table("workspace_invitations")
                .select("email")
                .or_(f"id.eq.{user_id},invited_by.eq.{user_id}")
                .limit(1)
                .execute()
            )
            if inv_res.data and isinstance(inv_res.data, list) and len(inv_res.data) > 0:
                raw_email = inv_res.data[0].get("email")
                if isinstance(raw_email, str) and "@" in raw_email:
                    return raw_email, raw_email.split("@")[0]
        except Exception:
            pass

        return f"user-{str(user_id)[:6]}@workspace.internal", f"Member {str(user_id)[:4]}"

    @classmethod
    def list_workspace_members(
        cls, slug: str, user_id: str, db: Client, email: Optional[str] = None
    ) -> List[WorkspaceMemberResponse]:
        if email:
            cls.reconcile_user_invitations(user_id, email, db)

        org_res = db.table("organizations").select("id").eq("slug", slug).limit(1).execute()
        if not org_res.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Workspace with slug '{slug}' not found",
            )
        org_id = org_res.data[0]["id"]

        member_check = (
            db.table("workspace_members")
            .select("id")
            .eq("organization_id", org_id)
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
        if not member_check.data:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have access to this workspace",
            )

        members_res = (
            db.table("workspace_members")
            .select("*")
            .eq("organization_id", org_id)
            .order("created_at")
            .execute()
        )

        results: List[WorkspaceMemberResponse] = []
        for m in (members_res.data or []):
            m_uid = m["user_id"]
            user_email, user_name = cls.resolve_user_info(m_uid, db)
            results.append(
                WorkspaceMemberResponse(
                    id=m["id"],
                    organization_id=m["organization_id"],
                    user_id=m_uid,
                    role=MemberRole(m.get("role", "member")),
                    created_at=m["created_at"],
                    status="active",
                    user=WorkspaceMemberUser(
                        id=m_uid,
                        email=user_email,
                        name=user_name,
                    ),
                )
            )

        # Also fetch pending invitations from workspace_invitations
        inv_res = (
            db.table("workspace_invitations")
            .select("*")
            .eq("organization_id", org_id)
            .eq("status", "pending")
            .order("created_at")
            .execute()
        )
        for inv in (inv_res.data or []):
            results.append(
                WorkspaceMemberResponse(
                    id=inv["id"],
                    organization_id=inv["organization_id"],
                    user_id=inv["id"],
                    role=MemberRole(inv.get("role", "member")),
                    created_at=inv["created_at"],
                    status="invited",
                    user=WorkspaceMemberUser(
                        id=inv["id"],
                        email=inv["email"],
                        name=inv["email"].split("@")[0],
                    ),
                )
            )

        return results

    @staticmethod
    def invite_workspace_member(
        slug: str, data: MemberInviteRequest, user_id: str, db: Client
    ) -> WorkspaceMemberResponse:
        org_res = db.table("organizations").select("id, name").eq("slug", slug).limit(1).execute()
        if not org_res.data:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found")
        org = org_res.data[0]
        org_id = org["id"]

        member_check = (
            db.table("workspace_members")
            .select("role")
            .eq("organization_id", org_id)
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
        if not member_check.data or member_check.data[0].get("role") != "admin":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only organization admins can invite members",
            )

        email_clean = data.email.strip().lower()

        # Attempt to trigger real email via Supabase Auth Admin if available
        invite_link = None
        redirect_target = "http://localhost:3000/accept-invite"
        try:
            db.auth.admin.invite_user_by_email(email_clean, options={"redirect_to": redirect_target})
        except Exception as e:
            # If email sending is rate-limited or SMTP not configured, generate link directly without SMTP
            try:
                link_res = db.auth.admin.generate_link({
                    "type": "invite",
                    "email": email_clean,
                    "options": {"redirect_to": redirect_target}
                })
                if link_res and hasattr(link_res, "properties") and hasattr(link_res.properties, "action_link"):
                    invite_link = link_res.properties.action_link
            except Exception:
                pass

        # Save to workspace_invitations table
        inv_res = (
            db.table("workspace_invitations")
            .upsert(
                {
                    "organization_id": org_id,
                    "email": email_clean,
                    "role": data.role.value,
                    "invited_by": user_id,
                    "status": "pending",
                },
                on_conflict="organization_id,email"
            )
            .execute()
        )

        inv_row = inv_res.data[0] if inv_res.data else {
            "id": f"inv-{int(datetime.now().timestamp())}",
            "organization_id": org_id,
            "role": data.role.value,
            "created_at": datetime.now().isoformat(),
        }

        return WorkspaceMemberResponse(
            id=inv_row["id"],
            organization_id=org_id,
            user_id=inv_row["id"],
            role=data.role,
            created_at=inv_row["created_at"],
            status="invited",
            user=WorkspaceMemberUser(
                id=inv_row["id"],
                email=email_clean,
                name=email_clean.split("@")[0],
            ),
        )

    @classmethod
    def update_member_role(
        cls, slug: str, target_user_id: str, data: MemberRoleUpdate, current_user_id: str, db: Client
    ) -> WorkspaceMemberResponse:
        """
        Updates the role of a workspace member (admin, member, guest).
        Requires org admin role and prevents demoting the last admin.
        """
        org_res = db.table("organizations").select("id").eq("slug", slug).limit(1).execute()
        if not org_res.data:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found")
        org_id = org_res.data[0]["id"]

        # Ensure current user is admin
        actor_check = (
            db.table("workspace_members")
            .select("role")
            .eq("organization_id", org_id)
            .eq("user_id", current_user_id)
            .limit(1)
            .execute()
        )
        if not actor_check.data or actor_check.data[0].get("role") != "admin":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only organization admins can update member roles",
            )

        # Check target member exists
        target_res = (
            db.table("workspace_members")
            .select("*")
            .eq("organization_id", org_id)
            .eq("user_id", target_user_id)
            .limit(1)
            .execute()
        )
        if not target_res.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Workspace member not found",
            )
        target_member = target_res.data[0]

        # Prevent demoting the last admin
        if target_member.get("role") == "admin" and data.role != MemberRole.ADMIN:
            admin_count_res = (
                db.table("workspace_members")
                .select("id")
                .eq("organization_id", org_id)
                .eq("role", "admin")
                .execute()
            )
            if admin_count_res.data and len(admin_count_res.data) <= 1:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Cannot demote the last organization administrator",
                )

        updated_res = (
            db.table("workspace_members")
            .update({"role": data.role.value})
            .eq("id", target_member["id"])
            .execute()
        )
        updated = updated_res.data[0] if updated_res.data else {**target_member, "role": data.role.value}

        email, name = cls.resolve_user_info(target_user_id, db)
        return WorkspaceMemberResponse(
            id=updated["id"],
            organization_id=org_id,
            user_id=target_user_id,
            role=data.role,
            created_at=updated["created_at"],
            status="active",
            user=WorkspaceMemberUser(
                id=target_user_id,
                email=email,
                name=name,
            ),
        )

    @classmethod
    def remove_workspace_member(
        cls, slug: str, target_user_id: str, current_user_id: str, db: Client
    ) -> dict:
        """
        Removes a member from the workspace and cascades removal from team memberships.
        Requires org admin role and prevents removing the last admin.
        """
        org_res = db.table("organizations").select("id").eq("slug", slug).limit(1).execute()
        if not org_res.data:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found")
        org_id = org_res.data[0]["id"]

        # Ensure current user is admin
        actor_check = (
            db.table("workspace_members")
            .select("role")
            .eq("organization_id", org_id)
            .eq("user_id", current_user_id)
            .limit(1)
            .execute()
        )
        if not actor_check.data or actor_check.data[0].get("role") != "admin":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only organization admins can remove workspace members",
            )

        # Check target member exists
        target_res = (
            db.table("workspace_members")
            .select("*")
            .eq("organization_id", org_id)
            .eq("user_id", target_user_id)
            .limit(1)
            .execute()
        )
        if not target_res.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Workspace member not found",
            )
        target_member = target_res.data[0]

        # Prevent removing the last admin
        if target_member.get("role") == "admin":
            admin_count_res = (
                db.table("workspace_members")
                .select("id")
                .eq("organization_id", org_id)
                .eq("role", "admin")
                .execute()
            )
            if admin_count_res.data and len(admin_count_res.data) <= 1:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Cannot remove the last organization administrator",
                )

        # 1. Clean up team memberships belonging to teams in this organization
        teams_res = db.table("teams").select("id").eq("organization_id", org_id).execute()
        team_ids = [t["id"] for t in (teams_res.data or [])]
        if team_ids:
            for t_id in team_ids:
                try:
                    db.table("team_members").delete().eq("team_id", t_id).eq("user_id", target_user_id).execute()
                except Exception:
                    pass

        # 2. Delete workspace membership
        db.table("workspace_members").delete().eq("id", target_member["id"]).execute()

        return {"message": "Member removed from workspace successfully", "user_id": target_user_id}

    @staticmethod
    def revoke_invitation(
        slug: str, invitation_id: str, current_user_id: str, db: Client
    ) -> dict:
        """
        Revokes (cancels/deletes) a pending workspace invitation.
        Requires org admin role.
        """
        org_res = db.table("organizations").select("id").eq("slug", slug).limit(1).execute()
        if not org_res.data:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found")
        org_id = org_res.data[0]["id"]

        actor_check = (
            db.table("workspace_members")
            .select("role")
            .eq("organization_id", org_id)
            .eq("user_id", current_user_id)
            .limit(1)
            .execute()
        )
        if not actor_check.data or actor_check.data[0].get("role") != "admin":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only organization admins can revoke invitations",
            )

        inv_check = (
            db.table("workspace_invitations")
            .select("id")
            .eq("organization_id", org_id)
            .eq("id", invitation_id)
            .limit(1)
            .execute()
        )
        if not inv_check.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Workspace invitation not found",
            )

        db.table("workspace_invitations").delete().eq("id", invitation_id).execute()
        return {"message": "Invitation revoked successfully", "invitation_id": invitation_id}
