from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from fastapi import HTTPException, status
from supabase import Client

from app.schemas.phase3 import (
    CycleCreate,
    CycleResponse,
    CycleMetricsResponse,
    CycleCompleteRequest,
    CycleCompleteResponse,
    ProjectCreate,
    ProjectUpdate,
    ProjectSummaryResponse,
    ProjectDetailResponse,
    MilestoneCreate,
    MilestoneUpdate,
    MilestoneResponse,
    TriageAcceptRequest,
    TriageSnoozeRequest,
    TriageDeclineRequest,
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
    # 1. Cycles (Sprints) Implementation
    # ==============================================================================

    @classmethod
    def list_cycles(cls, team_id: str, user_id: str, db: Client) -> List[CycleResponse]:
        cls._verify_team_access(team_id, user_id, db)
        res = (
            db.table("cycles")
            .select("*")
            .eq("team_id", team_id)
            .order("number", desc=True)
            .execute()
        )
        return [CycleResponse(**c) for c in (res.data or [])]

    @classmethod
    def create_cycle(cls, team_id: str, data: CycleCreate, user_id: str, db: Client) -> CycleResponse:
        cls._verify_team_access(team_id, user_id, db)

        # Sequential cycle numbering
        last_cycle = (
            db.table("cycles")
            .select("number")
            .eq("team_id", team_id)
            .order("number", desc=True)
            .limit(1)
            .execute()
        )
        next_number = (last_cycle.data[0]["number"] + 1) if last_cycle.data else 1
        name = data.name or f"Cycle {next_number}"

        payload = {
            "team_id": team_id,
            "number": next_number,
            "name": name,
            "starts_at": data.starts_at.isoformat(),
            "ends_at": data.ends_at.isoformat(),
        }
        res = db.table("cycles").insert(payload).execute()
        if not res.data:
            raise HTTPException(status_code=500, detail="Failed to create cycle")
        return CycleResponse(**res.data[0])

    @classmethod
    def get_cycle_metrics(cls, cycle_id: str, user_id: str, db: Client) -> CycleMetricsResponse:
        c_res = db.table("cycles").select("*").eq("id", cycle_id).limit(1).execute()
        if not c_res.data:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cycle not found")
        cycle = c_res.data[0]
        cls._verify_team_access(cycle["team_id"], user_id, db)

        # Fetch cycle issues
        issues_res = (
            db.table("issues")
            .select("id, estimate, completed_at, workflow_states(category)")
            .eq("cycle_id", cycle_id)
            .is_("deleted_at", "null")
            .execute()
        )
        issues = issues_res.data or []

        total_issues = len(issues)
        completed_issues = 0
        total_points = 0
        completed_points = 0

        for iss in issues:
            est = iss.get("estimate") or 0
            total_points += est
            state_info = iss.get("workflow_states") or {}
            is_completed = state_info.get("category") == "completed" or iss.get("completed_at") is not None
            if is_completed:
                completed_issues += 1
                completed_points += est

        completion_pct = (
            round((completed_points / total_points) * 100, 2)
            if total_points > 0
            else (round((completed_issues / total_issues) * 100, 2) if total_issues > 0 else 0.0)
        )

        burnup_data = [
            {"date": cycle["starts_at"], "completed_points": 0, "total_points": total_points},
            {"date": cycle["ends_at"], "completed_points": completed_points, "total_points": total_points},
        ]

        return CycleMetricsResponse(
            cycle=CycleResponse(**cycle),
            total_issues=total_issues,
            completed_issues=completed_issues,
            total_estimate_points=total_points,
            completed_estimate_points=completed_points,
            completion_percentage=completion_pct,
            burnup_data=burnup_data,
        )

    @classmethod
    def complete_cycle(
        cls, cycle_id: str, data: CycleCompleteRequest, user_id: str, db: Client
    ) -> CycleCompleteResponse:
        c_res = db.table("cycles").select("*").eq("id", cycle_id).limit(1).execute()
        if not c_res.data:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cycle not found")
        cycle = c_res.data[0]
        team = cls._verify_team_access(cycle["team_id"], user_id, db)

        now_iso = datetime.now(timezone.utc).isoformat()

        # Destination validation: either 'backlog' or a valid cycle ID
        destination_cycle_id = None
        if data.destination != "backlog":
            target_cycle = db.table("cycles").select("id").eq("id", data.destination).limit(1).execute()
            if not target_cycle.data:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Destination cycle not found")
            destination_cycle_id = data.destination

        # 1. Mark cycle as completed
        db.table("cycles").update({"completed_at": now_iso}).eq("id", cycle_id).execute()
        cycle["completed_at"] = now_iso

        # 2. Find unfinished issues (issues not in category 'completed' or 'canceled')
        issues_res = (
            db.table("issues")
            .select("id, state_id, workflow_states(category)")
            .eq("cycle_id", cycle_id)
            .is_("deleted_at", "null")
            .execute()
        )
        unresolved_ids = []
        for iss in (issues_res.data or []):
            cat = (iss.get("workflow_states") or {}).get("category")
            if cat not in ("completed", "canceled"):
                unresolved_ids.append(iss["id"])

        # 3. Transfer incomplete issues to destination atomically
        if unresolved_ids:
            update_payload = {"cycle_id": destination_cycle_id, "updated_at": now_iso}
            db.table("issues").update(update_payload).in_("id", unresolved_ids).execute()

            # Batch activity audit log
            for iid in unresolved_ids:
                db.table("activity_logs").insert({
                    "organization_id": team["organization_id"],
                    "issue_id": iid,
                    "actor_id": user_id,
                    "action": "cycle_rollover",
                    "changes": {
                        "from_cycle": cycle_id,
                        "to_cycle": destination_cycle_id,
                        "destination": data.destination,
                    },
                }).execute()

        return CycleCompleteResponse(
            cycle=CycleResponse(**cycle),
            transferred_issues_count=len(unresolved_ids),
            destination=data.destination,
        )

    @classmethod
    def auto_rollover_expired_cycles(cls, db: Client) -> List[Dict[str, Any]]:
        """
        Background automated rollover worker:
        Scans for cycles where ends_at < NOW() and completed_at IS NULL.
        For each expired cycle:
        1. Finds or creates the next sequential cycle for the team.
        2. Rolls over incomplete issues (not completed/canceled) into the next cycle.
        3. Marks the expired cycle completed_at = NOW().
        """
        now = datetime.now(timezone.utc)
        now_iso = now.isoformat()

        # Query all active cycles that have passed their ends_at
        cycles_res = (
            db.table("cycles")
            .select("id, team_id, number, name, starts_at, ends_at")
            .is_("completed_at", "null")
            .lt("ends_at", now_iso)
            .execute()
        )
        expired_cycles = cycles_res.data or []
        if not expired_cycles:
            return []

        results = []
        for cycle in expired_cycles:
            cycle_id = cycle["id"]
            team_id = cycle["team_id"]

            # Fetch team info to determine organization and cycle cadence
            team_res = db.table("teams").select("id, organization_id, cycle_duration_weeks").eq("id", team_id).limit(1).execute()
            if not team_res.data:
                continue
            team = team_res.data[0]
            duration_weeks = team.get("cycle_duration_weeks") or 2

            # Find next upcoming cycle for this team (number = cycle.number + 1)
            next_num = cycle["number"] + 1
            next_cycle_res = (
                db.table("cycles")
                .select("id")
                .eq("team_id", team_id)
                .eq("number", next_num)
                .limit(1)
                .execute()
            )

            next_cycle_id = None
            if next_cycle_res.data:
                next_cycle_id = next_cycle_res.data[0]["id"]
            else:
                # Automatically create the next cycle if not already present
                from datetime import timedelta
                new_starts_at = now
                new_ends_at = new_starts_at + timedelta(weeks=duration_weeks)
                new_cycle_payload = {
                    "team_id": team_id,
                    "number": next_num,
                    "name": f"Cycle {next_num}",
                    "starts_at": new_starts_at.isoformat(),
                    "ends_at": new_ends_at.isoformat(),
                }
                new_c_res = db.table("cycles").insert(new_cycle_payload).execute()
                if new_c_res.data:
                    next_cycle_id = new_c_res.data[0]["id"]

            # Find unresolved issues in expired cycle
            issues_res = (
                db.table("issues")
                .select("id, workflow_states(category)")
                .eq("cycle_id", cycle_id)
                .is_("deleted_at", "null")
                .execute()
            )
            unresolved_ids = []
            for iss in (issues_res.data or []):
                cat = (iss.get("workflow_states") or {}).get("category")
                if cat not in ("completed", "canceled"):
                    unresolved_ids.append(iss["id"])

            # Transfer unresolved issues to the next cycle
            if unresolved_ids:
                db.table("issues").update({
                    "cycle_id": next_cycle_id,
                    "updated_at": now_iso
                }).in_("id", unresolved_ids).execute()

                # Audit log system-driven rollover
                for iid in unresolved_ids:
                    try:
                        db.table("activity_logs").insert({
                            "organization_id": team["organization_id"],
                            "issue_id": iid,
                            "actor_id": "00000000-0000-0000-0000-000000000000",
                            "action": "auto_cycle_rollover",
                            "changes": {
                                "from_cycle": cycle_id,
                                "to_cycle": next_cycle_id,
                                "reason": "cycle_ended",
                            },
                        }).execute()
                    except Exception:
                        pass

            # Mark cycle completed
            db.table("cycles").update({"completed_at": now_iso}).eq("id", cycle_id).execute()

            results.append({
                "cycle_id": cycle_id,
                "team_id": team_id,
                "transferred_count": len(unresolved_ids),
                "next_cycle_id": next_cycle_id,
            })

        return results

    # ==============================================================================
    # 2. Projects & Milestones Implementation
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
        if data.name is not None:
            update_dict["name"] = data.name
        if data.target_date is not None:
            update_dict["target_date"] = data.target_date.isoformat()
        if data.completed_at is not None:
            update_dict["completed_at"] = data.completed_at.isoformat()

        if not update_dict:
            return MilestoneResponse(**milestone)

        res = db.table("project_milestones").update(update_dict).eq("id", milestone_id).execute()
        if not res.data:
            raise HTTPException(status_code=500, detail="Failed to update milestone")
        return MilestoneResponse(**res.data[0])

    # ==============================================================================
    # 3. Triage Inbox Implementation
    # ==============================================================================

    @classmethod
    def list_triage_issues(cls, team_id: str, user_id: str, db: Client) -> List[IssueResponse]:
        cls._verify_team_access(team_id, user_id, db)

        # 1. Resolve triage state ID for team
        triage_state = (
            db.table("workflow_states")
            .select("id")
            .eq("team_id", team_id)
            .eq("category", "triage")
            .limit(1)
            .execute()
        )
        if not triage_state.data:
            return []
        triage_state_id = triage_state.data[0]["id"]

        query = (
            db.table("issues")
            .select("*")
            .eq("team_id", team_id)
            .eq("state_id", triage_state_id)
            .is_("deleted_at", "null")
            .order("created_at", desc=True)
        )
        res = query.execute()

        now_dt = datetime.now(timezone.utc)
        active_triage = []
        for iss in (res.data or []):
            snoozed = iss.get("snoozed_until")
            if snoozed:
                try:
                    if isinstance(snoozed, str):
                        snoozed_dt = datetime.fromisoformat(snoozed.replace("Z", "+00:00"))
                    elif isinstance(snoozed, datetime):
                        snoozed_dt = snoozed
                    else:
                        snoozed_dt = None
                    if snoozed_dt:
                        if snoozed_dt.tzinfo is None:
                            snoozed_dt = snoozed_dt.replace(tzinfo=timezone.utc)
                        if snoozed_dt > now_dt:
                            continue
                except Exception:
                    pass
            active_triage.append(IssueResponse(**iss))
        return active_triage

    @classmethod
    def accept_triage_issue(
        cls, issue_id: str, data: TriageAcceptRequest, user_id: str, db: Client
    ) -> IssueResponse:
        i_res = db.table("issues").select("*").eq("id", issue_id).limit(1).execute()
        if not i_res.data:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Issue not found")
        issue = i_res.data[0]
        cls._verify_team_access(issue["team_id"], user_id, db)

        # Update to target state, assign metadata, clear snooze
        now_iso = datetime.now(timezone.utc).isoformat()
        update_dict = {
            "state_id": data.target_state_id,
            "snoozed_until": None,
            "updated_at": now_iso,
            "version": issue["version"] + 1,
        }
        if data.assignee_id is not None:
            update_dict["assignee_id"] = data.assignee_id
        if data.cycle_id is not None:
            update_dict["cycle_id"] = data.cycle_id
        if data.priority is not None:
            update_dict["priority"] = data.priority
        if data.estimate is not None:
            update_dict["estimate"] = data.estimate

        res = db.table("issues").update(update_dict).eq("id", issue_id).execute()
        if not res.data:
            raise HTTPException(status_code=500, detail="Failed to accept triage issue")
        updated = res.data[0]

        changes_logged = {
            "target_state_id": data.target_state_id,
            "assignee_id": data.assignee_id,
        }
        if data.cycle_id is not None:
            changes_logged["cycle_id"] = data.cycle_id
        if data.priority is not None:
            changes_logged["priority"] = data.priority
        if data.estimate is not None:
            changes_logged["estimate"] = data.estimate

        db.table("activity_logs").insert({
            "organization_id": issue["organization_id"],
            "issue_id": issue_id,
            "actor_id": user_id,
            "action": "triage_accepted",
            "changes": changes_logged,
        }).execute()

        return IssueResponse(**updated)

    @classmethod
    def snooze_triage_issue(
        cls, issue_id: str, data: TriageSnoozeRequest, user_id: str, db: Client
    ) -> Dict[str, Any]:
        i_res = db.table("issues").select("*").eq("id", issue_id).limit(1).execute()
        if not i_res.data:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Issue not found")
        issue = i_res.data[0]
        cls._verify_team_access(issue["team_id"], user_id, db)

        snooze_iso = data.snoozed_until.isoformat()
        now_iso = datetime.now(timezone.utc).isoformat()
        db.table("issues").update({
            "snoozed_until": snooze_iso,
            "updated_at": now_iso,
            "version": issue["version"] + 1,
        }).eq("id", issue_id).execute()

        db.table("activity_logs").insert({
            "organization_id": issue["organization_id"],
            "issue_id": issue_id,
            "actor_id": user_id,
            "action": "triage_snoozed",
            "changes": {"snoozed_until": snooze_iso},
        }).execute()

        return {"status": "snoozed", "issue_id": issue_id, "snoozed_until": snooze_iso}

    @classmethod
    def decline_triage_issue(
        cls, issue_id: str, data: TriageDeclineRequest, user_id: str, db: Client
    ) -> Dict[str, Any]:
        i_res = db.table("issues").select("*").eq("id", issue_id).limit(1).execute()
        if not i_res.data:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Issue not found")
        issue = i_res.data[0]
        cls._verify_team_access(issue["team_id"], user_id, db)

        # Move to canceled workflow state
        canceled_state = (
            db.table("workflow_states")
            .select("id")
            .eq("team_id", issue["team_id"])
            .eq("category", "canceled")
            .limit(1)
            .execute()
        )
        now_iso = datetime.now(timezone.utc).isoformat()
        update_dict = {
            "canceled_at": now_iso,
            "updated_at": now_iso,
            "version": issue["version"] + 1,
        }
        if canceled_state.data:
            update_dict["state_id"] = canceled_state.data[0]["id"]

        db.table("issues").update(update_dict).eq("id", issue_id).execute()

        db.table("activity_logs").insert({
            "organization_id": issue["organization_id"],
            "issue_id": issue_id,
            "actor_id": user_id,
            "action": "triage_declined",
            "changes": {"reason": data.reason, "canceled_at": now_iso},
        }).execute()

        return {"status": "declined", "issue_id": issue_id, "reason": data.reason}
