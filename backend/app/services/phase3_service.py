from datetime import datetime, timezone, date
from typing import Any, Dict, List, Optional
from fastapi import HTTPException, status
from supabase import Client

from app.schemas.phase3 import (
    ProjectCreate,
    ProjectUpdate,
    ProjectSummaryResponse,
    ProjectDetailResponse,
    MilestoneCreate,
    MilestoneUpdate,
    MilestoneResponse,
)
from app.schemas.issue import IssueResponse
from app.core.lexorank import calculate_midpoint_rank


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

    @staticmethod
    def _verify_project_access(project_id: str, user_id: str, db: Client) -> dict:
        p_res = db.table("projects").select("*").eq("id", project_id).limit(1).execute()
        if not p_res.data:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
        project = p_res.data[0]

        member_check = (
            db.table("workspace_members")
            .select("id, role")
            .eq("organization_id", project["organization_id"])
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
        if not member_check.data:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied to project")
        return project

    # ==============================================================================
    # 0. Org Inbox
    # ==============================================================================

    @classmethod
    def list_inbox(cls, org_slug: str, user_id: str, db: Client) -> List[IssueResponse]:
        org = cls._verify_org_access(org_slug, user_id, db)
        res = (
            db.table("issues")
            .select("*, workflow_states(category), teams!inner(key, name)")
            .eq("organization_id", org["id"])
            .is_("deleted_at", "null")
            .order("created_at", desc=True)
            .limit(50)
            .execute()
        )
        issues = [IssueResponse(**iss) for iss in (res.data or [])]
        return issues

    # ==============================================================================
    # 1. Projects & Milestones Implementation
    # ==============================================================================

    @classmethod
    def list_projects(cls, org_slug: str, user_id: str, db: Client) -> List[ProjectSummaryResponse]:
        org = cls._verify_org_access(org_slug, user_id, db)
        p_res = (
            db.table("projects")
            .select("*")
            .eq("organization_id", org["id"])
            .order("sort_order")
            .execute()
        )
        projects = p_res.data or []
        if not projects:
            return []

        project_ids = [p["id"] for p in projects]

        # Milestone counts per project
        m_res = (
            db.table("project_milestones")
            .select("project_id")
            .in_("project_id", project_ids)
            .execute()
        )
        m_counts: Dict[str, int] = {}
        for m in (m_res.data or []):
            pid = m["project_id"]
            m_counts[pid] = m_counts.get(pid, 0) + 1

        # Issue completion counts per project
        iss_res = (
            db.table("issues")
            .select("project_id, completed_at, workflow_states(category)")
            .in_("project_id", project_ids)
            .is_("deleted_at", "null")
            .execute()
        )
        iss_stats: Dict[str, Dict[str, int]] = {}
        for iss in (iss_res.data or []):
            pid = iss["project_id"]
            if pid not in iss_stats:
                iss_stats[pid] = {"total": 0, "completed": 0}
            iss_stats[pid]["total"] += 1
            cat = (iss.get("workflow_states") or {}).get("category")
            if cat == "completed" or iss.get("completed_at") is not None:
                iss_stats[pid]["completed"] += 1

        result = []
        for p in projects:
            pid = p["id"]
            total = iss_stats.get(pid, {}).get("total", 0)
            completed = iss_stats.get(pid, {}).get("completed", 0)
            pct = round((completed / total) * 100, 2) if total > 0 else 0.0
            result.append(
                ProjectSummaryResponse(
                    **p,
                    total_issues=total,
                    completed_issues=completed,
                    progress_percentage=pct,
                    milestones_count=m_counts.get(pid, 0),
                )
            )
        return result

    @classmethod
    def create_project(cls, org_slug: str, data: ProjectCreate, user_id: str, db: Client) -> ProjectSummaryResponse:
        org = cls._verify_org_access(org_slug, user_id, db)

        # Check unique slug within org
        existing = (
            db.table("projects")
            .select("id")
            .eq("organization_id", org["id"])
            .eq("slug", data.slug)
            .limit(1)
            .execute()
        )
        if existing.data:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Project slug already exists in organization")

        # Initial LexoRank position
        last_p = (
            db.table("projects")
            .select("sort_order")
            .eq("organization_id", org["id"])
            .order("sort_order", desc=True)
            .limit(1)
            .execute()
        )
        prev_rank = last_p.data[0]["sort_order"] if last_p.data else None
        sort_order = calculate_midpoint_rank(prev_rank=prev_rank, next_rank=None)

        payload = {
            "organization_id": org["id"],
            "name": data.name,
            "slug": data.slug,
            "health": data.health.value,
            "sort_order": sort_order,
        }
        res = db.table("projects").insert(payload).execute()
        if not res.data:
            raise HTTPException(status_code=500, detail="Failed to create project")
        return ProjectSummaryResponse(**res.data[0])

    @classmethod
    def get_project(cls, project_id: str, user_id: str, db: Client) -> ProjectDetailResponse:
        project = cls._verify_project_access(project_id, user_id, db)

        # Fetch milestones
        m_res = (
            db.table("project_milestones")
            .select("*")
            .eq("project_id", project_id)
            .order("sort_order")
            .execute()
        )
        milestones = [MilestoneResponse(**m) for m in (m_res.data or [])]

        # Fetch linked issues
        iss_res = (
            db.table("issues")
            .select("*")
            .eq("project_id", project_id)
            .is_("deleted_at", "null")
            .order("sort_order")
            .execute()
        )
        issues = [IssueResponse(**iss) for iss in (iss_res.data or [])]

        total = len(issues)
        completed = sum(1 for iss in issues if iss.completed_at is not None)
        pct = round((completed / total) * 100, 2) if total > 0 else 0.0

        return ProjectDetailResponse(
            **project,
            total_issues=total,
            completed_issues=completed,
            progress_percentage=pct,
            milestones_count=len(milestones),
            milestones=milestones,
            issues=issues,
        )

    @classmethod
    def update_project(cls, project_id: str, data: ProjectUpdate, user_id: str, db: Client) -> ProjectSummaryResponse:
        project = cls._verify_project_access(project_id, user_id, db)
        update_dict = {}
        if data.name is not None:
            update_dict["name"] = data.name
        if data.health is not None:
            update_dict["health"] = data.health.value

        if not update_dict:
            return ProjectSummaryResponse(**project)

        res = db.table("projects").update(update_dict).eq("id", project_id).execute()
        if not res.data:
            raise HTTPException(status_code=500, detail="Failed to update project")
        return ProjectSummaryResponse(**res.data[0])

    @classmethod
    def create_milestone(cls, project_id: str, data: MilestoneCreate, user_id: str, db: Client) -> MilestoneResponse:
        cls._verify_project_access(project_id, user_id, db)

        # LexoRank position within project milestones
        last_m = (
            db.table("project_milestones")
            .select("sort_order")
            .eq("project_id", project_id)
            .order("sort_order", desc=True)
            .limit(1)
            .execute()
        )
        prev_rank = last_m.data[0]["sort_order"] if last_m.data else None
        sort_order = calculate_midpoint_rank(prev_rank=prev_rank, next_rank=None)

        payload = {
            "project_id": project_id,
            "name": data.name,
            "target_date": data.target_date.isoformat() if data.target_date else None,
            "sort_order": sort_order,
        }
        res = db.table("project_milestones").insert(payload).execute()
        if not res.data:
            raise HTTPException(status_code=500, detail="Failed to create milestone")
        return MilestoneResponse(**res.data[0])

    @classmethod
    def update_milestone(cls, milestone_id: str, data: MilestoneUpdate, user_id: str, db: Client) -> MilestoneResponse:
        m_res = db.table("project_milestones").select("*").eq("id", milestone_id).limit(1).execute()
        if not m_res.data:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Milestone not found")
        milestone = m_res.data[0]
        cls._verify_project_access(milestone["project_id"], user_id, db)

        update_dict = {}
        dumped = data.model_dump(exclude_unset=True)
        for field, val in dumped.items():
            if val is None:
                update_dict[field] = None
            elif isinstance(val, (datetime, date)):
                update_dict[field] = val.isoformat()
            else:
                update_dict[field] = val

        if not update_dict:
            return MilestoneResponse(**milestone)

        res = db.table("project_milestones").update(update_dict).eq("id", milestone_id).execute()
        if not res.data:
            raise HTTPException(status_code=500, detail="Failed to update milestone")
        return MilestoneResponse(**res.data[0])
