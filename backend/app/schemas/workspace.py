from datetime import datetime
from enum import Enum
from typing import Optional, List
from pydantic import BaseModel, Field, ConfigDict


class MemberRole(str, Enum):
    ADMIN = "admin"
    MEMBER = "member"
    GUEST = "guest"


class OrganizationBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=255, description="Organization workspace name")
    slug: str = Field(..., min_length=2, max_length=100, pattern=r"^[a-z0-9-]+$", description="URL-friendly unique slug")
    logo_url: Optional[str] = None


class OrganizationCreate(OrganizationBase):
    pass


class OrganizationResponse(OrganizationBase):
    model_config = ConfigDict(from_attributes=True)

    id: str
    created_at: datetime
    updated_at: datetime


class WorkspaceMemberUser(BaseModel):
    id: str
    email: Optional[str] = None
    name: Optional[str] = None
    avatar_url: Optional[str] = None


class WorkspaceMemberResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    organization_id: str
    user_id: str
    role: MemberRole
    created_at: datetime
    user: Optional[WorkspaceMemberUser] = None


class TeamSummary(BaseModel):
    id: str
    name: str
    key: str
    organization_id: str


class UserWorkspaceItem(BaseModel):
    organization: OrganizationResponse
    role: MemberRole
    teams: List[TeamSummary] = []


class UserWorkspacesResponse(BaseModel):
    workspaces: List[UserWorkspaceItem]
