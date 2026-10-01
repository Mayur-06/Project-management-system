from typing import Any, Dict, List
from fastapi import APIRouter, Depends, status
from supabase import Client

from app.core.security import AuthenticatedUser
from app.core.dependencies import get_current_user, get_admin_db
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
from app.services.phase3_service import Phase3Service

router = APIRouter(tags=["Cycles, Projects, Milestones & Triage"])


# ==============================================================================
# 1. Cycles (Sprints) Endpoints
# ==============================================================================

@router.get(
    "/teams/{team_id}/cycles",
    response_model=List[CycleResponse],
    summary="List active, upcoming, and past completed sprints for a team",
)
async def list_team_cycles(
    team_id: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Client = Depends(get_admin_db),
):
    return Phase3Service.list_cycles(team_id, current_user.id, db)


@router.post(
    "/teams/{team_id}/cycles",
    response_model=CycleResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a custom sprint cycle with sequential numbering",
)
async def create_team_cycle(
    team_id: str,
    payload: CycleCreate,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Client = Depends(get_admin_db),
):
    return Phase3Service.create_cycle(team_id, payload, current_user.id, db)


@router.get(
    "/cycles/{cycle_id}",
    response_model=CycleMetricsResponse,
    summary="Get cycle detail, velocity metrics, and burnup data",
)
async def get_cycle_metrics(
    cycle_id: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Client = Depends(get_admin_db),
):
    return Phase3Service.get_cycle_metrics(cycle_id, current_user.id, db)


@router.post(
    "/cycles/{cycle_id}/complete",
    response_model=CycleCompleteResponse,
    summary="Close active cycle, calculate final metrics, and rollover unfinished issues to next cycle or backlog",
)
async def complete_cycle(
    cycle_id: str,
    payload: CycleCompleteRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Client = Depends(get_admin_db),
):
    return Phase3Service.complete_cycle(cycle_id, payload, current_user.id, db)


# ==============================================================================
# 2. Projects & Milestones Endpoints
# ==============================================================================

@router.get(
    "/organizations/{org_slug}/projects",
    response_model=List[ProjectSummaryResponse],
    summary="List all projects with progress percentage, milestone count, and health status",
)
async def list_projects(
    org_slug: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Client = Depends(get_admin_db),
):
    return Phase3Service.list_projects(org_slug, current_user.id, db)


@router.post(
    "/organizations/{org_slug}/projects",
    response_model=ProjectSummaryResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new project container with unique slug and initial health",
)
async def create_project(
    org_slug: str,
    payload: ProjectCreate,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Client = Depends(get_admin_db),
):
    return Phase3Service.create_project(org_slug, payload, current_user.id, db)


@router.get(
    "/projects/{project_id}",
    response_model=ProjectDetailResponse,
    summary="Get project overview, milestones, and linked issues",
)
async def get_project(
    project_id: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Client = Depends(get_admin_db),
):
    return Phase3Service.get_project(project_id, current_user.id, db)


@router.patch(
    "/projects/{project_id}",
    response_model=ProjectSummaryResponse,
    summary="Update project metadata or direct health status ('on_track', 'at_risk', 'off_track')",
)
async def update_project(
    project_id: str,
    payload: ProjectUpdate,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Client = Depends(get_admin_db),
):
    return Phase3Service.update_project(project_id, payload, current_user.id, db)


@router.post(
    "/projects/{project_id}/milestones",
    response_model=MilestoneResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a milestone checkpoint for a project",
)
async def create_milestone(
    project_id: str,
    payload: MilestoneCreate,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Client = Depends(get_admin_db),
):
    return Phase3Service.create_milestone(project_id, payload, current_user.id, db)


@router.patch(
    "/milestones/{milestone_id}",
    response_model=MilestoneResponse,
    summary="Update milestone checkpoint details or set completed_at",
)
async def update_milestone(
    milestone_id: str,
    payload: MilestoneUpdate,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Client = Depends(get_admin_db),
):
    return Phase3Service.update_milestone(milestone_id, payload, current_user.id, db)


# ==============================================================================
# 3. Triage Inbox Endpoints
# ==============================================================================

@router.get(
    "/teams/{team_id}/triage",
    response_model=List[IssueResponse],
    summary="Fetch all active (unsnoozed) triage issues for a team",
)
async def list_triage_issues(
    team_id: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Client = Depends(get_admin_db),
):
    return Phase3Service.list_triage_issues(team_id, current_user.id, db)


@router.post(
    "/triage/{issue_id}/accept",
    response_model=IssueResponse,
    summary="Accept triage issue into an active workflow state, assign cycle/assignee",
)
async def accept_triage_issue(
    issue_id: str,
    payload: TriageAcceptRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Client = Depends(get_admin_db),
):
    return Phase3Service.accept_triage_issue(issue_id, payload, current_user.id, db)


@router.post(
    "/triage/{issue_id}/snooze",
    response_model=Dict[str, Any],
    summary="Snooze triage issue until a future timestamp",
)
async def snooze_triage_issue(
    issue_id: str,
    payload: TriageSnoozeRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Client = Depends(get_admin_db),
):
    return Phase3Service.snooze_triage_issue(issue_id, payload, current_user.id, db)


@router.post(
    "/triage/{issue_id}/decline",
    response_model=Dict[str, Any],
    summary="Decline/cancel triage issue with a recorded reason",
)
async def decline_triage_issue(
    issue_id: str,
    payload: TriageDeclineRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Client = Depends(get_admin_db),
):
    return Phase3Service.decline_triage_issue(issue_id, payload, current_user.id, db)
