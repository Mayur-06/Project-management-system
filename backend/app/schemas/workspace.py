from datetime import datetime
from enum import Enum
from typing import Optional, List
from pydantic import BaseModel, Field, ConfigDict, EmailStr, field_validator


class MemberRole(str, Enum):
    ADMIN = "admin"
    MEMBER = "member"
    GUEST = "guest"


RESERVED_SLUGS = {
    "login", "signup", "auth", "api", "accept-invite", "settings",
    "admin", "dashboard", "workspaces", "teams", "issues", "projects", "cycles"
}


class OrganizationBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=255, description="Organization workspace name")
    slug: str = Field(..., min_length=2, max_length=100, pattern=r"^[a-z0-9-]+$", description="URL-friendly unique slug")
    logo_url: Optional[str] = None

    @field_validator("slug")
    @classmethod
    def validate_slug_not_reserved(cls, v: str) -> str:
        if v.lower() in RESERVED_SLUGS:
            raise ValueError(f"'{v}' is a reserved workspace slug and cannot be used")
        return v


class OrganizationCreate(OrganizationBase):
    pass


class OrganizationUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    logo_url: Optional[str] = None


class MemberInviteRequest(BaseModel):
    email: EmailStr
    role: MemberRole = MemberRole.MEMBER


class MemberRoleUpdate(BaseModel):
    role: MemberRole


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
    status: Optional[str] = "active"
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
