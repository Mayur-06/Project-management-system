# @related-files:
# - backend/app/schemas/phase3.py
# - backend/app/services/phase3_service.py
# - frontend/lib/api.ts

from typing import Any, Dict, List
from fastapi import APIRouter, Depends, Query, status
from supabase import Client

from app.core.security import AuthenticatedUser
from app.core.dependencies import get_current_user, get_admin_db
from app.schemas.phase3 import (
    InboxItemResponse,
    ProjectCreate,
    ProjectUpdate,
    ProjectSummaryResponse,
    ProjectDetailResponse,
    MilestoneCreate,
    MilestoneUpdate,
    MilestoneResponse,
)
from app.schemas.issue import IssueResponse
from app.services.phase3_service import Phase3Service

router = APIRouter(tags=["Projects & Milestones"])


# ==============================================================================
# 0. Org Inbox
# ==============================================================================

@router.get(
    "/organizations/{org_slug}/inbox",
    response_model=List[InboxItemResponse],
    summary="Recent activity feed across the organization",
)
async def list_inbox(
    org_slug: str,
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Client = Depends(get_admin_db),
):
    return Phase3Service.list_inbox(org_slug, current_user.id, db, limit=limit, offset=offset)


# ==============================================================================
# 1. Projects & Milestones Endpoints
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