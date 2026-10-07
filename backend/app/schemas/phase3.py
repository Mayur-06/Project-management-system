# @related-files:
# - backend/app/schemas/issue.py
# - backend/app/services/phase3_service.py
# - backend/app/api/v1/phase3.py

from datetime import date, datetime
from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field

from app.schemas.issue import IssueAssigneeUser, IssueResponse


class InboxItemResponse(BaseModel):
    id: str
    action: str
    changes: Optional[Dict[str, Any]] = None
    actor: Optional[IssueAssigneeUser] = None
    issue_id: Optional[str] = None
    issue_identifier: Optional[str] = None
    issue_title: Optional[str] = None
    team_key: Optional[str] = None
    is_deleted: bool = False
    state: Optional[Dict[str, Any]] = None
    priority: Optional[str] = None
    created_at: datetime


# ==============================================================================
# 1. Projects & Milestones Schemas
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
