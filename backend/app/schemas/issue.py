from datetime import date, datetime
from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class IssuePriority(str, Enum):
    NONE = "none"
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    URGENT = "urgent"


class IssueCreate(BaseModel):
    team_id: Optional[str] = None
    team_key: Optional[str] = None
    source_team_id: Optional[str] = None
    title: str = Field(..., max_length=500)
    description_json: Optional[Dict[str, Any]] = None
    description_text: Optional[str] = None
    priority: IssuePriority = IssuePriority.NONE
    estimate: Optional[int] = None
    state_id: Optional[str] = None
    assignee_id: Optional[str] = None
    project_id: Optional[str] = None
    cycle_id: Optional[str] = None
    parent_id: Optional[str] = None
    due_date: Optional[date] = None
    client_session_id: Optional[str] = None


class IssueUpdate(BaseModel):
    title: Optional[str] = Field(None, max_length=500)
    description_json: Optional[Dict[str, Any]] = None
    description_text: Optional[str] = None
    priority: Optional[IssuePriority] = None
    estimate: Optional[int] = None
    state_id: Optional[str] = None
    assignee_id: Optional[str] = None
    project_id: Optional[str] = None
    cycle_id: Optional[str] = None
    due_date: Optional[date] = None
    snoozed_until: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    canceled_at: Optional[datetime] = None
    # Concurrency control & echo suppression
    expected_version: int
    client_session_id: Optional[str] = None


class IssueReorderRequest(BaseModel):
    state_id: Optional[str] = None
    prev_position: Optional[str] = None
    next_position: Optional[str] = None
    client_session_id: Optional[str] = None


class BatchReorderItem(BaseModel):
    issue_id: str
    state_id: str
    position: str


class BatchReorderRequest(BaseModel):
    items: List[BatchReorderItem]
    client_session_id: Optional[str] = None


class BatchUpdateItem(BaseModel):
    issue_id: str
    state_id: Optional[str] = None
    assignee_id: Optional[str] = None
    priority: Optional[IssuePriority] = None
    cycle_id: Optional[str] = None


class BatchUpdateRequest(BaseModel):
    updates: List[BatchUpdateItem]
    client_session_id: Optional[str] = None


class SubtaskCreate(BaseModel):
    title: str = Field(..., max_length=500)
    assignee_id: Optional[str] = None
    estimate: Optional[int] = None
    priority: IssuePriority = IssuePriority.NONE


class IssueAssigneeUser(BaseModel):
    id: str
    email: Optional[str] = None
    name: Optional[str] = None
    avatar_url: Optional[str] = None


class IssueResponse(BaseModel):
    id: str
    organization_id: str
    team_id: str
    number: int
    identifier: str
    title: str
    description_json: Optional[Dict[str, Any]] = None
    description_text: Optional[str] = None
    priority: str
    estimate: Optional[int] = None
    state_id: str
    state: Optional[Dict[str, Any]] = None
    assignee_id: Optional[str] = None
    assignee: Optional[IssueAssigneeUser] = None
    creator_id: str
    project_id: Optional[str] = None
    cycle_id: Optional[str] = None
    parent_id: Optional[str] = None
    sort_order: str
    version: int
    due_date: Optional[date] = None
    snoozed_until: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    canceled_at: Optional[datetime] = None
    last_modified_by_session: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    deleted_at: Optional[datetime] = None


class IssueDetailResponse(IssueResponse):
    labels: List[Dict[str, Any]] = []
    subtasks: List[IssueResponse] = []


class ActivityLogResponse(BaseModel):
    id: str
    organization_id: str
    issue_id: Optional[str] = None
    actor_id: str
    actor: Optional[Dict[str, Any]] = None
    action: str
    changes: Optional[Dict[str, Any]] = None
    created_at: datetime


class CommentCreate(BaseModel):
    body_json: Optional[Dict[str, Any]] = None
    body_text: str = Field(..., min_length=1)


class CommentUpdate(BaseModel):
    body_json: Optional[Dict[str, Any]] = None
    body_text: str = Field(..., min_length=1)


class CommentReactionToggle(BaseModel):
    emoji: str


class CommentReactionResponse(BaseModel):
    emoji: str
    count: int
    user_ids: List[str]


class CommentResponse(BaseModel):
    id: str
    issue_id: str
    user_id: str
    body_json: Dict[str, Any]
    body_text: str
    created_at: datetime
    updated_at: datetime
    reactions: List[CommentReactionResponse] = []
