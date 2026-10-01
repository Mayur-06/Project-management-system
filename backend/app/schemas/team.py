from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field, ConfigDict


class TeamBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=255, description="Team display name")
    key: str = Field(..., min_length=1, max_length=10, pattern=r"^[A-Z0-9]+$", description="Team issue prefix key (e.g. ENG, PROD)")
    cycle_duration_weeks: Optional[int] = Field(2, ge=1, le=12, description="Default cycle duration in weeks")


class TeamCreate(TeamBase):
    pass


class TeamResponse(TeamBase):
    model_config = ConfigDict(from_attributes=True)

    id: str
    organization_id: str
    issue_counter: int = 0
    cycle_duration_weeks: int = 2
    created_at: datetime


class TeamMemberUser(BaseModel):
    id: str
    email: Optional[str] = None
    name: Optional[str] = None
    avatar_url: Optional[str] = None


class TeamMemberResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    team_id: str
    user_id: str
    created_at: datetime
    user: Optional[TeamMemberUser] = None
