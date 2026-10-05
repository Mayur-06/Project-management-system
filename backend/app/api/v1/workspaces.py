from typing import List
from fastapi import APIRouter, Depends, status
from supabase import Client

from app.core.security import AuthenticatedUser
from app.core.dependencies import get_current_user, get_admin_db
from app.schemas.workspace import (
    OrganizationCreate,
    OrganizationUpdate,
    MemberInviteRequest,
    MemberRoleUpdate,
    OrganizationResponse,
    WorkspaceMemberResponse,
    UserWorkspacesResponse,
)
from app.schemas.team import TeamCreate, TeamResponse
from app.services.workspace_service import WorkspaceService
from app.services.team_service import TeamService

router = APIRouter(prefix="/workspaces", tags=["Workspaces & Organizations"])


@router.get(
    "/me",
    response_model=UserWorkspacesResponse,
    summary="Fetch authenticated user's organizations, teams, and role memberships",
)
async def get_my_workspaces(
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Client = Depends(get_admin_db),
):
    workspaces = WorkspaceService.get_user_workspaces(current_user.id, db, email=current_user.email)
    return UserWorkspacesResponse(workspaces=workspaces)


@router.post(
    "",
    response_model=OrganizationResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new organization workspace",
)
async def create_workspace(
    data: OrganizationCreate,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Client = Depends(get_admin_db),
):
    return WorkspaceService.create_workspace(data, current_user.id, db)


@router.get(
    "/{org_slug}",
    response_model=OrganizationResponse,
    summary="Retrieve workspace by organization slug",
)
async def get_workspace(
    org_slug: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Client = Depends(get_admin_db),
):
    return WorkspaceService.get_workspace_by_slug(org_slug, current_user.id, db, email=current_user.email)


@router.patch(
    "/{org_slug}",
    response_model=OrganizationResponse,
    summary="Update organization workspace settings (name, logo)",
)
async def update_workspace(
    org_slug: str,
    data: OrganizationUpdate,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Client = Depends(get_admin_db),
):
    return WorkspaceService.update_workspace(org_slug, data, current_user.id, db)


@router.get(
    "/{org_slug}/members",
    response_model=List[WorkspaceMemberResponse],
    summary="List all members belonging to an organization workspace",
)
async def list_workspace_members(
    org_slug: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Client = Depends(get_admin_db),
):
    return WorkspaceService.list_workspace_members(org_slug, current_user.id, db, email=current_user.email)


@router.post(
    "/{org_slug}/members/invite",
    response_model=WorkspaceMemberResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Invite a new member to the organization workspace by email",
)
async def invite_workspace_member(
    org_slug: str,
    data: MemberInviteRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Client = Depends(get_admin_db),
):
    return WorkspaceService.invite_workspace_member(org_slug, data, current_user.id, db)


@router.patch(
    "/{org_slug}/members/{user_id}",
    response_model=WorkspaceMemberResponse,
    summary="Update a workspace member's role (admin, member, guest)",
)
async def update_workspace_member_role(
    org_slug: str,
    user_id: str,
    data: MemberRoleUpdate,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Client = Depends(get_admin_db),
):
    return WorkspaceService.update_member_role(org_slug, user_id, data, current_user.id, db)


@router.delete(
    "/{org_slug}/members/{user_id}",
    summary="Remove a member from the workspace and associated teams",
)
async def remove_workspace_member(
    org_slug: str,
    user_id: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Client = Depends(get_admin_db),
):
    return WorkspaceService.remove_workspace_member(org_slug, user_id, current_user.id, db)


@router.delete(
    "/{org_slug}/invitations/{invitation_id}",
    summary="Revoke a pending workspace invitation",
)
async def revoke_workspace_invitation(
    org_slug: str,
    invitation_id: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Client = Depends(get_admin_db),
):
    return WorkspaceService.revoke_invitation(org_slug, invitation_id, current_user.id, db)


@router.get(
    "/{org_slug}/teams",
    response_model=List[TeamResponse],
    summary="List all teams within an organization",
)
async def list_workspace_teams(
    org_slug: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Client = Depends(get_admin_db),
):
    return TeamService.list_teams_by_org_slug(org_slug, current_user.id, db, email=current_user.email)


@router.post(
    "/{org_slug}/teams",
    response_model=TeamResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new team (with custom identifier key, e.g., ENG)",
)
async def create_workspace_team(
    org_slug: str,
    data: TeamCreate,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Client = Depends(get_admin_db),
):
    return TeamService.create_team(org_slug, data, current_user.id, db)
