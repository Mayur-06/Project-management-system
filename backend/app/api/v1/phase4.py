import json
import asyncio
from typing import AsyncGenerator, List
from fastapi import APIRouter, Depends, status, HTTPException
from fastapi.responses import StreamingResponse
from supabase import Client

from app.core.security import AuthenticatedUser
from app.core.dependencies import get_current_user, get_admin_db
from app.schemas.phase4 import (
    AttachmentUploadRequest,
    AttachmentUploadResponse,
    AttachmentResponse,
    DuplicateCheckRequest,
    DuplicateCheckResponse,
    TriageClassifyRequest,
    TriageClassifyResponse,
    BreakdownStartRequest,
    BreakdownStartResponse,
    BreakdownResumeRequest,
    BreakdownResumeResponse,
    ChatStreamRequest,
)
from app.services.phase4_service import Phase4Service

router = APIRouter(tags=["AI Automation & File Attachments"])


# ==============================================================================
# 1. Attachments & Storage
# ==============================================================================

@router.post(
    "/attachments/upload-url",
    response_model=AttachmentUploadResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Generate pre-signed upload URL for direct client-to-Supabase Storage uploads",
)
async def generate_upload_url(
    payload: AttachmentUploadRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Client = Depends(get_admin_db),
):
    return Phase4Service.create_attachment_upload_url(payload, current_user.id, db)


@router.get(
    "/issues/{issue_id}/attachments",
    response_model=List[AttachmentResponse],
    summary="List all file attachments for an issue",
)
async def list_attachments(
    issue_id: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Client = Depends(get_admin_db),
):
    return Phase4Service.list_attachments(issue_id, current_user.id, db)


@router.delete(
    "/attachments/{attachment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete uploaded file attachment and remove DB reference",
)
async def delete_attachment(
    attachment_id: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Client = Depends(get_admin_db),
):
    Phase4Service.delete_attachment(attachment_id, current_user.id, db)


# ==============================================================================
# 2. AI Duplicate Detection (pgvector)
# ==============================================================================

@router.post(
    "/ai/duplicates/check",
    response_model=DuplicateCheckResponse,
    summary="Lightweight vector-only duplicate search during issue drafting (fast, zero LLM cost)",
)
async def check_duplicates(
    payload: DuplicateCheckRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Client = Depends(get_admin_db),
):
    return Phase4Service.check_duplicates(payload, current_user.id, db)


# ==============================================================================
# 3. AI Triage & Workload Balancing
# ==============================================================================

@router.post(
    "/ai/triage/classify",
    response_model=TriageClassifyResponse,
    summary="Workload-aware triage classification (Priority, Points, Labels, Assignee recommendation)",
)
async def classify_issue(
    payload: TriageClassifyRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Client = Depends(get_admin_db),
):
    return Phase4Service.classify_issue(payload, current_user.id, db)


# ==============================================================================
# 4. AI Technical Breakdown (HITL Interruption)
# ==============================================================================

@router.post(
    "/ai/breakdown/start",
    response_model=BreakdownStartResponse,
    summary="Initiates technical decomposition and halts at interrupt() with proposed subtasks",
)
async def start_breakdown(
    payload: BreakdownStartRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Client = Depends(get_admin_db),
):
    return Phase4Service.start_breakdown(payload, current_user.id, db)


@router.post(
    "/ai/breakdown/resume",
    response_model=BreakdownResumeResponse,
    summary="Resumes LangGraph breakdown with user-approved subtasks and batch-inserts child issues",
)
async def resume_breakdown(
    payload: BreakdownResumeRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Client = Depends(get_admin_db),
):
    return Phase4Service.resume_breakdown(payload, current_user.id, db)


# ==============================================================================
# 5. Linear Ask: ReAct Workspace Assistant (SSE Stream)
# ==============================================================================

from app.agents.react_agent import LinearAskAgent


from fastapi import Request

@router.post(
    "/ai/chat/stream",
    summary="Server-Sent Events (SSE) stream for Linear Ask ReAct agent with tool execution",
)
async def chat_stream(
    request: Request,
    payload: ChatStreamRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Client = Depends(get_admin_db),
):
    user_query = payload.messages[-1].content if payload.messages else ""
    return StreamingResponse(
        LinearAskAgent.stream_chat_session(
            query=user_query,
            organization_id=payload.organization_id,
            user_jwt=current_user.raw_token,
            history=[m.model_dump() for m in payload.messages],
            request=request,
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


