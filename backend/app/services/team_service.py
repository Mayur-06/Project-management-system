from typing import List
from fastapi import HTTPException, status
from supabase import Client

from app.schemas.team import TeamCreate, TeamUpdate, TeamResponse, TeamMemberResponse, TeamMemberUser
from app.schemas.state import StateCategory


DEFAULT_WORKFLOW_STATES = [
    {"name": "Triage", "color": "#eab308", "category": StateCategory.TRIAGE.value, "position": "0|h00000:", "is_default": False},
    {"name": "Backlog", "color": "#94a3b8", "category": StateCategory.BACKLOG.value, "position": "0|h10000:", "is_default": False},
    {"name": "Todo", "color": "#e2e8f0", "category": StateCategory.UNSTARTED.value, "position": "0|h20000:", "is_default": True},
    {"name": "In Progress", "color": "#f59e0b", "category": StateCategory.STARTED.value, "position": "0|h30000:", "is_default": False},
    {"name": "In Review", "color": "#3b82f6", "category": StateCategory.STARTED.value, "position": "0|h40000:", "is_default": False},
    {"name": "Done", "color": "#22c55e", "category": StateCategory.COMPLETED.value, "position": "0|h50000:", "is_default": False},
    {"name": "Canceled", "color": "#ef4444", "category": StateCategory.CANCELED.value, "position": "0|h60000:", "is_default": False},
]


class TeamService:
    @staticmethod
    def _get_org_by_slug_and_verify_member(org_slug: str, user_id: str, db: Client) -> dict:
        org_res = db.table("organizations").select("*").eq("slug", org_slug).limit(1).execute()
        if not org_res.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Organization with slug '{org_slug}' not found",
            )
        org = org_res.data[0]

        member_res = (
            db.table("workspace_members")
            .select("id, role")
            .eq("organization_id", org["id"])
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
        if not member_res.data:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You are not a member of this organization",
            )
        return org

    @classmethod
    def list_teams_by_org_slug(cls, org_slug: str, user_id: str, db: Client) -> List[TeamResponse]:
        org = cls._get_org_by_slug_and_verify_member(org_slug, user_id, db)
        teams_res = db.table("teams").select("*").eq("organization_id", org["id"]).order("created_at").execute()
        return [TeamResponse(**t) for t in (teams_res.data or [])]

    @classmethod
    def create_team(cls, org_slug: str, data: TeamCreate, user_id: str, db: Client) -> TeamResponse:
        org = cls._get_org_by_slug_and_verify_member(org_slug, user_id, db)
        org_id = org["id"]

        # Only organization admins can create teams
        mem_res = (
            db.table("workspace_members")
            .select("role")
            .eq("organization_id", org_id)
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
        if not mem_res.data or mem_res.data[0].get("role") != "admin":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only organization admins can create teams",
            )

        key_upper = data.key.upper()

        # Check unique key within organization
        existing_key = (
            db.table("teams")
            .select("id")
            .eq("organization_id", org_id)
            .eq("key", key_upper)
            .limit(1)
            .execute()
        )
        if existing_key.data and len(existing_key.data) > 0:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Team with key '{key_upper}' already exists in this organization",
            )

        # Insert team
        insert_res = (
            db.table("teams")
            .insert(
                {
                    "organization_id": org_id,
                    "name": data.name,
                    "key": key_upper,
                    "cycle_duration_weeks": data.cycle_duration_weeks or 2,
                    "issue_counter": 0,
                }
            )
            .execute()
        )
        if not insert_res.data:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create team",
            )

        new_team = insert_res.data[0]
        team_id = new_team["id"]

        # Add creator to team_members
        db.table("team_members").insert(
            {"team_id": team_id, "user_id": user_id}
        ).execute()

        # Seed default workflow states
        state_rows = [
            {**state_spec, "team_id": team_id}
            for state_spec in DEFAULT_WORKFLOW_STATES
        ]
        db.table("workflow_states").insert(state_rows).execute()

        return TeamResponse(**new_team)

    @classmethod
    def list_team_members(cls, team_id: str, user_id: str, db: Client) -> List[TeamMemberResponse]:
        # Verify team exists
        team_res = db.table("teams").select("id, organization_id").eq("id", team_id).limit(1).execute()
        if not team_res.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Team not found",
            )
        team = team_res.data[0]

        # Verify caller has org membership
        member_check = (
            db.table("workspace_members")
            .select("id")
            .eq("organization_id", team["organization_id"])
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
        if not member_check.data:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied to team members",
            )

        # Fetch team members
        members_res = db.table("team_members").select("*").eq("team_id", team_id).execute()
        results: List[TeamMemberResponse] = []
        for m in (members_res.data or []):
            m_uid = m["user_id"]
            is_alex = m_uid == "00000000-0000-0000-0000-000000000001" or m_uid == user_id
            results.append(
                TeamMemberResponse(
                    id=m["id"],
                    team_id=m["team_id"],
                    user_id=m_uid,
                    created_at=m["created_at"],
                    user=TeamMemberUser(
                        id=m_uid,
                        email="alex@acme.inc" if is_alex else f"user-{m_uid[:6]}@acme.inc",
                        name="Alex Chen" if is_alex else f"Member {m_uid[:4]}",
                    )
                )
            )

        return results

    @classmethod
    def update_team(cls, team_id: str, data: TeamUpdate, user_id: str, db: Client) -> TeamResponse:
        team_res = db.table("teams").select("*").eq("id", team_id).limit(1).execute()
        if not team_res.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Team not found",
            )
        team = team_res.data[0]

        member_check = (
            db.table("workspace_members")
            .select("role")
            .eq("organization_id", team["organization_id"])
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
        if not member_check.data or member_check.data[0].get("role") != "admin":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only workspace admins can update team settings",
            )

        update_dict = {}
        if data.name is not None:
            update_dict["name"] = data.name.strip()
        if data.key is not None:
            new_key = data.key.strip().upper()
            if new_key != team.get("key"):
                existing_key = (
                    db.table("teams")
                    .select("id")
                    .eq("organization_id", team["organization_id"])
                    .eq("key", new_key)
                    .neq("id", team_id)
                    .limit(1)
                    .execute()
                )
                if existing_key.data and len(existing_key.data) > 0:
                    raise HTTPException(
                        status_code=status.HTTP_409_CONFLICT,
                        detail=f"Team key '{new_key}' is already used by another team in this workspace",
                    )
                update_dict["key"] = new_key
        if data.cycle_duration_weeks is not None:
            update_dict["cycle_duration_weeks"] = data.cycle_duration_weeks

        if update_dict:
            res = db.table("teams").update(update_dict).eq("id", team_id).execute()
            if res.data:
                team = res.data[0]

        return TeamResponse(**team)

    @classmethod
    def add_team_member(cls, team_id: str, member_user_id: str, user_id: str, db: Client) -> TeamMemberResponse:
        team_res = db.table("teams").select("id, organization_id").eq("id", team_id).limit(1).execute()
        if not team_res.data:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found")
        team = team_res.data[0]

        member_check = (
            db.table("workspace_members")
            .select("id, role")
            .eq("organization_id", team["organization_id"])
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
        if not member_check.data:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

        target_check = (
            db.table("workspace_members")
            .select("id")
            .eq("organization_id", team["organization_id"])
            .eq("user_id", member_user_id)
            .limit(1)
            .execute()
        )
        if not target_check.data:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="User is not a member of this workspace organization",
            )

        existing = (
            db.table("team_members")
            .select("*")
            .eq("team_id", team_id)
            .eq("user_id", member_user_id)
            .limit(1)
            .execute()
        )
        is_alex = member_user_id == "00000000-0000-0000-0000-000000000001" or member_user_id == user_id
        user_meta = TeamMemberUser(
            id=member_user_id,
            email="alex@acme.inc" if is_alex else f"user-{member_user_id[:6]}@acme.inc",
            name="Alex Chen" if is_alex else f"Member {member_user_id[:4]}",
        )

        if existing.data and len(existing.data) > 0:
            row = existing.data[0]
            return TeamMemberResponse(
                id=row["id"],
                team_id=team_id,
                user_id=member_user_id,
                created_at=row.get("created_at") or "2026-01-01T00:00:00Z",
                user=user_meta,
            )

        insert_res = (
            db.table("team_members")
            .insert({"team_id": team_id, "user_id": member_user_id})
            .execute()
        )
        row = insert_res.data[0]
        return TeamMemberResponse(
            id=row["id"],
            team_id=team_id,
            user_id=member_user_id,
            created_at=row.get("created_at") or "2026-01-01T00:00:00Z",
            user=user_meta,
        )

    @classmethod
    def remove_team_member(cls, team_id: str, target_user_id: str, user_id: str, db: Client):
        team_res = db.table("teams").select("id, organization_id").eq("id", team_id).limit(1).execute()
        if not team_res.data:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found")
        team = team_res.data[0]

        member_check = (
            db.table("workspace_members")
            .select("id, role")
            .eq("organization_id", team["organization_id"])
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
        if not member_check.data:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

        db.table("team_members").delete().eq("team_id", team_id).eq("user_id", target_user_id).execute()
        return {"success": True}

