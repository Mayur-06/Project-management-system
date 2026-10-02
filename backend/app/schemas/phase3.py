from datetime import date, datetime
from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field

from app.schemas.issue import IssueResponse


# ==============================================================================
# 1. Cycles Schemas
# ==============================================================================

class CycleCreate(BaseModel):
    name: Optional[str] = None
    starts_at: datetime
    ends_at: datetime


class CycleResponse(BaseModel):
    id: str
    team_id: str
    number: int
    name: Optional[str] = None
    starts_at: datetime
    ends_at: datetime
    completed_at: Optional[datetime] = None
    created_at: datetime


class CycleMetricsResponse(BaseModel):
    cycle: CycleResponse
    total_issues: int
    completed_issues: int
    total_estimate_points: int
    completed_estimate_points: int
    completion_percentage: float
    burnup_data: List[Dict[str, Any]] = []


class CycleCompleteRequest(BaseModel):
    destination: str = Field(
        ...,
        description="'backlog' or cycle UUID where unfinished issues will be transferred",
    )


class CycleCompleteResponse(BaseModel):
    cycle: CycleResponse
    transferred_issues_count: int
    destination: str


# ==============================================================================
# 2. Projects & Milestones Schemas
# ==============================================================================

class ProjectHealth(str, Enum):
    ON_TRACK = "on_track"
    AT_RISK = "at_risk"
    OFF_TRACK = "off_track"


class ProjectCreate(BaseModel):
    name: str = Field(..., max_length=255)
    slug: str = Field(..., max_length=255)
    health: ProjectHealth = ProjectHealth.ON_TRACK


class ProjectUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=255)
    health: Optional[ProjectHealth] = None


class MilestoneCreate(BaseModel):
    name: str = Field(..., max_length=255)
    target_date: Optional[date] = None


class MilestoneUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=255)
    target_date: Optional[date] = None
    completed_at: Optional[datetime] = None


class MilestoneResponse(BaseModel):
    id: str
    project_id: str
    name: str
    target_date: Optional[date] = None
    completed_at: Optional[datetime] = None
    sort_order: str
    created_at: datetime


class ProjectSummaryResponse(BaseModel):
    id: str
    organization_id: str
    name: str
    slug: str
    health: str
    sort_order: str
    created_at: datetime
    total_issues: int = 0
    completed_issues: int = 0
    progress_percentage: float = 0.0
    milestones_count: int = 0


class ProjectDetailResponse(ProjectSummaryResponse):
    milestones: List[MilestoneResponse] = []
    issues: List[IssueResponse] = []


# ==============================================================================
# 3. Triage Inbox Schemas
# ==============================================================================

class TriageAcceptRequest(BaseModel):
    target_state_id: str
    assignee_id: Optional[str] = None
    cycle_id: Optional[str] = None
    priority: Optional[str] = None
    estimate: Optional[int] = None


class TriageSnoozeRequest(BaseModel):
    snoozed_until: datetime


class TriageDeclineRequest(BaseModel):
    reason: str = Field(..., min_length=1, max_length=500)
