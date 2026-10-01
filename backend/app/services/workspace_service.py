from typing import List, Optional
from fastapi import HTTPException, status
from supabase import Client

from app.schemas.workspace import (
    OrganizationCreate,
    OrganizationUpdate,
    OrganizationResponse,
    WorkspaceMemberResponse,
    WorkspaceMemberUser,
    UserWorkspaceItem,
    TeamSummary,
    MemberRole,
)


class WorkspaceService:
    @staticmethod
    def get_user_workspaces(user_id: str, db: Client) -> List[UserWorkspaceItem]:
        """
        Retrieves all organizations/workspaces the authenticated user is a member of,
        including their role and available teams.
        """
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

        for row in member_res.data:
            org_data = row.get("organizations")
            if not org_data:
                continue

            org_id = org_data["id"]
            # Fetch teams belonging to this organization
            teams_res = (
                db.table("teams")
                .select("id, name, key, organization_id")
                .eq("organization_id", org_id)
                .execute()
            )
            teams_list = [TeamSummary(**t) for t in (teams_res.data or [])]

            workspaces.append(
                UserWorkspaceItem(
                    organization=OrganizationResponse(**org_data),
                    role=MemberRole(row.get("role", "member")),
                    teams=teams_list,
                )
            )

        return workspaces

    @staticmethod
    def get_workspace_by_slug(slug: str, user_id: str, db: Client) -> OrganizationResponse:
        """
        Retrieves a workspace by its URL slug, ensuring the user has access.
        """
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
        db.table("workspace_members").insert(
            {
                "organization_id": org_id,
                "user_id": user_id,
                "role": MemberRole.ADMIN.value,
            }
        ).execute()

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
    def list_workspace_members(
        slug: str, user_id: str, db: Client
    ) -> List[WorkspaceMemberResponse]:
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
            is_alex = m["user_id"] == "00000000-0000-0000-0000-000000000001" or m["user_id"] == user_id
            results.append(
                WorkspaceMemberResponse(
                    id=m["id"],
                    organization_id=m["organization_id"],
                    user_id=m["user_id"],
                    role=MemberRole(m.get("role", "member")),
                    created_at=m["created_at"],
                    user=WorkspaceMemberUser(
                        id=m["user_id"],
                        email="alex@acme.inc" if is_alex else f"user-{m['user_id'][:6]}@acme.inc",
                        name="Alex Chen" if is_alex else f"Team Member {m['user_id'][:4]}",
                    ),
                )
            )
        return results
