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
    file_url: Optional[str] = None


class AttachmentResponse(BaseModel):
    id: str
    issue_id: str
    user_id: str
    file_name: str
    file_size: int
    mime_type: str
    storage_path: str
    file_url: Optional[str] = None
    created_at: datetime


# ==============================================================================
# 2. AI Chat ReAct Schemas
# ==============================================================================

class ChatMessage(BaseModel):
    role: str
    content: str


class ChatStreamRequest(BaseModel):
    thread_id: Optional[str] = None
    organization_id: str
    messages: List[ChatMessage]


class ChatActionConfirmRequest(BaseModel):
    action: str
    issue_id: Optional[str] = None
    team_id: Optional[str] = None
    title: Optional[str] = None
    description: Optional[str] = None
    priority: Optional[str] = None
    target_state_id: Optional[str] = None
    target_assignee_id: Optional[str] = None
    client_session_id: Optional[str] = None


class ChatActionConfirmResponse(BaseModel):
    status: str
    action: str
    issue_id: Optional[str] = None
    issue_identifier: Optional[str] = None
    message: str
    result: Optional[Dict[str, Any]] = None


# ==============================================================================
# 5. AI Conversation History Schemas
# ==============================================================================

class AIThreadCreateRequest(BaseModel):
    organization_id: str
    title: Optional[str] = None
    first_message: Optional[str] = None


class AIThreadResponse(BaseModel):
    id: str
    organization_id: str
    user_id: str
    title: str
    created_at: datetime
    updated_at: datetime


class AIMessageCreateRequest(BaseModel):
    sender: str  # 'user' or 'agent'
    content: str
    tools_json: Optional[List[Dict[str, Any]]] = None
    interrupt_json: Optional[Dict[str, Any]] = None


class AIMessageResponse(BaseModel):
    id: str
    thread_id: str
    sender: str
    content: str
    tools_json: Optional[List[Dict[str, Any]]] = None
    interrupt_json: Optional[Dict[str, Any]] = None
    created_at: datetime

