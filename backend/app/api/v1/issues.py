from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, Query, status
from supabase import Client

from app.core.security import AuthenticatedUser
from app.core.dependencies import get_current_user, get_admin_db
from app.schemas.issue import (
    IssueCreate,
    IssueUpdate,
    IssueReorderRequest,
    BatchReorderRequest,
    BatchUpdateRequest,
    SubtaskCreate,
    IssueResponse,
    IssueDetailResponse,
    ActivityLogResponse,
    CommentCreate,
    CommentUpdate,
    CommentResponse,
    CommentReactionToggle,
    CommentReactionResponse,
)
from app.services.issue_service import IssueService

router = APIRouter(tags=["Issues, Comments & Reordering"])


# ==============================================================================
# Issues Core Endpoints
# ==============================================================================

@router.get(
    "/issues",
    response_model=List[IssueResponse],
    summary="List issues with multi-parameter filtering, ordered by sort order",
)
async def list_issues(
    team_id: str = Query(..., description="Target team UUID"),
    state_id: Optional[str] = Query(None, description="Filter by workflow state UUID"),
    assignee_id: Optional[str] = Query(None, description="Filter by assigned user UUID"),
    cycle_id: Optional[str] = Query(None, description="Filter by sprint cycle UUID"),
    project_id: Optional[str] = Query(None, description="Filter by project UUID"),
    priority: Optional[str] = Query(None, description="Filter by priority tier"),
    search: Optional[str] = Query(None, description="Search issue titles"),
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Client = Depends(get_admin_db),
):
    return IssueService.list_issues(
        team_id=team_id,
        user_id=current_user.id,
        db=db,
        state_id=state_id,
        assignee_id=assignee_id,
        cycle_id=cycle_id,
        project_id=project_id,
        priority=priority,
        search=search,
    )


@router.post(
    "/issues",
    response_model=IssueResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new issue with auto-generated sequential identifier and sort position",
)
async def create_issue(
    payload: IssueCreate,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Client = Depends(get_admin_db),
):
    return IssueService.create_issue(payload, current_user.id, db)


@router.post(
    "/issues/batch-reorder",
    response_model=Dict[str, Any],
    summary="Atomically reorder multiple issues in a batch",
)
async def batch_reorder_issues(
    payload: BatchReorderRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Client = Depends(get_admin_db),
):
    return IssueService.batch_reorder(payload, current_user.id, db)


@router.post(
    "/issues/batch-update",
    response_model=List[str],
    summary="Apply bulk updates to selected issues",
)
async def batch_update_issues(
    payload: BatchUpdateRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Client = Depends(get_admin_db),
):
    return IssueService.batch_update(payload, current_user.id, db)


@router.get(
    "/issues/{issue_id}",
    response_model=IssueDetailResponse,
    summary="Retrieve issue details by UUID or key identifier (e.g. ENG-104)",
)
async def get_issue(
    issue_id: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Client = Depends(get_admin_db),
):
    return IssueService.get_issue(issue_id, current_user.id, db)


@router.patch(
    "/issues/{issue_id}",
    response_model=IssueResponse,
    summary="Update issue properties with OCC concurrency verification (409 Conflict if stale)",
)
async def update_issue(
    issue_id: str,
    payload: IssueUpdate,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Client = Depends(get_admin_db),
):
    return IssueService.update_issue(issue_id, payload, current_user.id, db)


@router.delete(
    "/issues/{issue_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Soft-delete an issue (cascades to subtasks via database trigger)",
)
async def delete_issue(
    issue_id: str,
    client_session_id: Optional[str] = Query(None, description="Client session ID for echo suppression"),
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Client = Depends(get_admin_db),
):
    IssueService.delete_issue(issue_id, current_user.id, db, client_session_id=client_session_id)


@router.put(
    "/issues/{issue_id}/reorder",
    response_model=IssueResponse,
    summary="Reorder single issue in Kanban/list view using fractional LexoRank midpoint",
)
async def reorder_issue(
    issue_id: str,
    payload: IssueReorderRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Client = Depends(get_admin_db),
):
    return IssueService.reorder_issue(issue_id, payload, current_user.id, db)


# ==============================================================================
# Subtasks & Activity Logs
# ==============================================================================

@router.get(
    "/issues/{issue_id}/subtasks",
    response_model=List[IssueResponse],
    summary="List all child subtasks for an issue",
)
async def list_subtasks(
    issue_id: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Client = Depends(get_admin_db),
):
    return IssueService.list_subtasks(issue_id, current_user.id, db)


@router.post(
    "/issues/{issue_id}/subtasks",
    response_model=IssueResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new child subtask linked to a parent issue",
)
async def create_subtask(
    issue_id: str,
    payload: SubtaskCreate,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Client = Depends(get_admin_db),
):
    return IssueService.create_subtask(issue_id, payload, current_user.id, db)


@router.get(
    "/issues/{issue_id}/activity",
    response_model=List[ActivityLogResponse],
    summary="Retrieve chronological audit trail of changes for an issue",
)
async def list_activity(
    issue_id: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Client = Depends(get_admin_db),
):
    return IssueService.list_activity_logs(issue_id, current_user.id, db)


# ==============================================================================
# Comments & Reactions Endpoints
# ==============================================================================

@router.get(
    "/issues/{issue_id}/comments",
    response_model=List[CommentResponse],
    summary="List all comments with reactions for an issue",
)
async def list_comments(
    issue_id: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Client = Depends(get_admin_db),
):
    return IssueService.list_comments(issue_id, current_user.id, db)


@router.post(
    "/issues/{issue_id}/comments",
    response_model=CommentResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a comment on an issue",
)
async def create_comment(
    issue_id: str,
    payload: CommentCreate,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Client = Depends(get_admin_db),
):
    return IssueService.create_comment(issue_id, payload, current_user.id, db)


@router.patch(
    "/comments/{comment_id}",
    response_model=CommentResponse,
    summary="Update an existing comment (author only)",
)
async def update_comment(
    comment_id: str,
    payload: CommentUpdate,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Client = Depends(get_admin_db),
):
    return IssueService.update_comment(comment_id, payload, current_user.id, db)


@router.delete(
    "/comments/{comment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Soft-delete a comment (author or admin)",
)
async def delete_comment(
    comment_id: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Client = Depends(get_admin_db),
):
    IssueService.delete_comment(comment_id, current_user.id, db)


@router.post(
    "/comments/{comment_id}/reactions",
    response_model=List[CommentReactionResponse],
    summary="Toggle emoji reaction on a comment (add if absent, remove if present)",
)
async def toggle_reaction(
    comment_id: str,
    payload: CommentReactionToggle,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Client = Depends(get_admin_db),
):
    return IssueService.toggle_reaction(comment_id, payload.emoji, current_user.id, db)
