from typing import List
from fastapi import APIRouter, Depends
from supabase import Client

from app.core.security import AuthenticatedUser
from app.core.dependencies import get_current_user, get_admin_db
from app.schemas.team import TeamMemberResponse, TeamMemberAdd, TeamUpdate, TeamResponse
from app.schemas.state import WorkflowStateResponse, WorkflowStateReorderRequest
from app.services.team_service import TeamService
from app.services.state_service import StateService

router = APIRouter(prefix="/teams", tags=["Teams & Workflow States"])


@router.patch(
    "/{team_id}",
    response_model=TeamResponse,
    summary="Update team settings (name, key, sprint cadence)",
)
async def update_team(
    team_id: str,
    payload: TeamUpdate,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Client = Depends(get_admin_db),
):
    return TeamService.update_team(team_id, payload, current_user.id, db)


@router.get(
    "/{team_id}/members",
    response_model=List[TeamMemberResponse],
    summary="List members and assignable users for a specific team",
)
async def list_team_members(
    team_id: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Client = Depends(get_admin_db),
):
    return TeamService.list_team_members(team_id, current_user.id, db)


@router.post(
    "/{team_id}/members",
    response_model=TeamMemberResponse,
    summary="Add an existing workspace member to a team",
)
async def add_team_member(
    team_id: str,
    payload: TeamMemberAdd,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Client = Depends(get_admin_db),
):
    return TeamService.add_team_member(team_id, payload.user_id, current_user.id, db)


@router.delete(
    "/{team_id}/members/{user_id}",
    summary="Remove a member from a team",
)
async def remove_team_member(
    team_id: str,
    user_id: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Client = Depends(get_admin_db),
):
    return TeamService.remove_team_member(team_id, user_id, current_user.id, db)



@router.get(
    "/{team_id}/states",
    response_model=List[WorkflowStateResponse],
    summary="List customizable workflow states for a team in display order",
)
async def list_workflow_states(
    team_id: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Client = Depends(get_admin_db),
):
    return StateService.list_workflow_states(team_id, current_user.id, db)


@router.put(
    "/{team_id}/states/reorder",
    response_model=List[WorkflowStateResponse],
    summary="Reorder team workflow states (fractional indexing)",
)
async def reorder_workflow_states(
    team_id: str,
    payload: WorkflowStateReorderRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Client = Depends(get_admin_db),
):
    return StateService.reorder_workflow_states(team_id, payload, current_user.id, db)
