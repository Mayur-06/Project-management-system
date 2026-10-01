from datetime import datetime
from enum import Enum
from typing import Optional, List
from pydantic import BaseModel, Field, ConfigDict


class StateCategory(str, Enum):
    TRIAGE = "triage"
    BACKLOG = "backlog"
    UNSTARTED = "unstarted"
    STARTED = "started"
    COMPLETED = "completed"
    CANCELED = "canceled"


class WorkflowStateBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    color: str = Field(..., min_length=1, max_length=20)
    category: StateCategory
    position: str = Field(..., description="Fractional rank position")
    is_default: bool = False


class WorkflowStateCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    color: str = Field(..., min_length=1, max_length=20)
    category: StateCategory
    position: Optional[str] = None
    is_default: Optional[bool] = False


class WorkflowStateResponse(WorkflowStateBase):
    model_config = ConfigDict(from_attributes=True)

    id: str
    team_id: str
    created_at: datetime


class WorkflowStateReorderItem(BaseModel):
    state_id: str
    position: str


class WorkflowStateReorderRequest(BaseModel):
    states: List[WorkflowStateReorderItem]
