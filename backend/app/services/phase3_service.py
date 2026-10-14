# @related-files:
# - backend/app/schemas/phase3.py
# - backend/app/api/v1/phase3.py
# - backend/app/services/workspace_service.py

from typing import Any, Dict, List, Optional
from fastapi import HTTPException, status
from supabase import Client

from app.schemas.phase3 import InboxItemResponse
from app.schemas.issue import IssueAssigneeUser
from app.services.workspace_service import WorkspaceService


class Phase3Service:

    # ==============================================================================
    # Authorization & Helper Methods
    # ==============================================================================

    @staticmethod
    def _verify_team_access(team_id: str, user_id: str, db: Client) -> dict:
        team_res = db.table("teams").select("id, organization_id, key").eq("id", team_id).limit(1).execute()
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
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied to team")
        return team

    @staticmethod
    def _verify_org_access(org_slug: str, user_id: str, db: Client) -> dict:
        org_res = db.table("organizations").select("id, name, slug").eq("slug", org_slug).limit(1).execute()
        if not org_res.data:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")
        org = org_res.data[0]

        member_check = (
            db.table("workspace_members")
            .select("id, role")
            .eq("organization_id", org["id"])
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
        if not member_check.data:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied to organization")
        return org

    # ==============================================================================
    # 0. Org Inbox (Activity Notification Feed)
    # ==============================================================================

    @classmethod
    def list_inbox(
        cls, org_slug: str, user_id: str, db: Client, limit: int = 50, offset: int = 0
    ) -> List[InboxItemResponse]:
        org = cls._verify_org_access(org_slug, user_id, db)

        safe_limit = max(1, min(limit, 100))
        safe_offset = max(0, offset)

        act_res = (
            db.table("activity_logs")
            .select("*")
            .eq("organization_id", org["id"])
            .order("created_at", desc=True)
            .range(safe_offset, safe_offset + safe_limit - 1)
            .execute()
        )
        logs = act_res.data or []
        if not logs:
            return []

        # Gather referenced issue_ids and actor_ids
        issue_ids = list({log["issue_id"] for log in logs if log.get("issue_id")})
        actor_ids = list({log["actor_id"] for log in logs if log.get("actor_id")})

        # Batch fetch issues with joined workflow_states and teams
        issue_map: Dict[str, dict] = {}
        if issue_ids:
            try:
                iss_res = (
                    db.table("issues")
                    .select("id, identifier, title, priority, deleted_at, team_id, state_id, workflow_states(id, name, category, color), teams(id, key, name)")
                    .in_("id", issue_ids)
                    .execute()
                )
                for iss in (iss_res.data or []):
                    issue_map[iss["id"]] = iss
            except Exception:
                try:
                    iss_res = (
                        db.table("issues")
                        .select("id, identifier, title, priority, deleted_at, team_id, state_id, workflow_states(id, name, category), teams(key, name)")
                        .in_("id", issue_ids)
                        .execute()
                    )
                    for iss in (iss_res.data or []):
                        issue_map[iss["id"]] = iss
                except Exception:
                    pass

        # Batch resolve actor metadata
        user_cache: Dict[str, IssueAssigneeUser] = {}
        for a_id in actor_ids:
            try:
                email, name = WorkspaceService.resolve_user_info(a_id, db)
                user_cache[a_id] = IssueAssigneeUser(id=a_id, email=email, name=name)
            except Exception:
                user_cache[a_id] = IssueAssigneeUser(id=a_id, name="Workspace Member")

        # Map to InboxItemResponse
        items: List[InboxItemResponse] = []
        for log in logs:
            log_changes = log.get("changes") or {}
            target_issue = issue_map.get(log.get("issue_id"))

            identifier = None
            title = None
            team_key = None
            state_data = None
            priority = None
            is_deleted = False

            if target_issue:
                identifier = target_issue.get("identifier")
                title = target_issue.get("title")
                state_data = target_issue.get("workflow_states")
                priority = target_issue.get("priority")
                is_deleted = target_issue.get("deleted_at") is not None
                teams_data = target_issue.get("teams")
                if isinstance(teams_data, dict):
                    team_key = teams_data.get("key")
                elif identifier and "-" in identifier:
                    team_key = identifier.split("-")[0]
            else:
                identifier = log_changes.get("identifier")
                title = log_changes.get("title")
                if identifier and "-" in identifier:
                    team_key = identifier.split("-")[0]
                is_deleted = True

            if log.get("action") == "issue_deleted":
                is_deleted = True

            actor_meta = user_cache.get(log.get("actor_id"))

            items.append(
                InboxItemResponse(
                    id=log["id"],
                    action=log.get("action", "activity"),
                    changes=log_changes,
                    actor=actor_meta,
                    issue_id=log.get("issue_id"),
                    issue_identifier=identifier,
                    issue_title=title,
                    team_key=team_key,
                    is_deleted=is_deleted,
                    state=state_data,
                    priority=priority,
                    created_at=log["created_at"],
                )
            )

        return items
