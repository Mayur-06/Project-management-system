from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


# ==============================================================================
# 1. Attachments Schemas
# ==============================================================================

class AttachmentUploadRequest(BaseModel):
    issue_id: str
    file_name: str = Field(..., max_length=255)
    file_size: int = Field(..., gt=0, le=52428800)  # Max 50MB
    mime_type: str = Field(..., max_length=100)


class AttachmentUploadResponse(BaseModel):
    attachment_id: str
    issue_id: str
    upload_url: str
    storage_path: str
    file_name: str


class AttachmentResponse(BaseModel):
    id: str
    issue_id: str
    user_id: str
    file_name: str
    file_size: int
    mime_type: str
    storage_path: str
    created_at: datetime


# ==============================================================================
# 2. AI Duplicate Detection Schemas
# ==============================================================================

class DuplicateCheckRequest(BaseModel):
    organization_id: str
    title: str = Field(..., min_length=10, max_length=500)
    description: Optional[str] = None
    threshold: float = Field(0.75, ge=0.0, le=1.0)
    limit: int = Field(5, ge=1, le=20)


class DuplicateIssueItem(BaseModel):
    issue_id: str
    identifier: str
    title: str
    similarity: float
    state_id: Optional[str] = None


class DuplicateCheckResponse(BaseModel):
    duplicates_found: bool
    count: int
    matches: List[DuplicateIssueItem]


# ==============================================================================
# 3. AI Triage & Classification Schemas
# ==============================================================================

class TriageClassifyRequest(BaseModel):
    organization_id: str
    team_id: str
    title: str = Field(..., min_length=5, max_length=500)
    description: Optional[str] = None


class TriageClassifyResponse(BaseModel):
    suggested_priority: str
    suggested_estimate: Optional[int] = None
    suggested_labels: List[str] = []
    suggested_assignee_id: Optional[str] = None
    rationale: str


# ==============================================================================
# 4. AI Technical Breakdown (HITL) Schemas
# ==============================================================================

class ProposedSubtask(BaseModel):
    title: str
    description: Optional[str] = None
    estimate: Optional[int] = None
    priority: str = "none"


class BreakdownStartRequest(BaseModel):
    issue_id: str
    context_instructions: Optional[str] = None


class BreakdownStartResponse(BaseModel):
    thread_id: str
    status: str = "interrupted"
    prdspec: str
    proposed_subtasks: List[ProposedSubtask]


class BreakdownResumeRequest(BaseModel):
    thread_id: str
    approved_subtasks: List[ProposedSubtask]


class BreakdownResumeResponse(BaseModel):
    status: str = "completed"
    created_subtasks_count: int
    created_subtask_ids: List[str]


# ==============================================================================
# 5. AI Chat ReAct Schemas
# ==============================================================================

class ChatMessage(BaseModel):
    role: str
    content: str


class ChatStreamRequest(BaseModel):
    thread_id: Optional[str] = None
    organization_id: str
    messages: List[ChatMessage]
