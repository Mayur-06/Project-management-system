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
    BreakdownStartRequest,
    BreakdownStartResponse,
    BreakdownResumeRequest,
    BreakdownResumeResponse,
    ChatStreamRequest,
    ChatActionConfirmRequest,
    ChatActionConfirmResponse,
    AIThreadCreateRequest,
    AIThreadResponse,
    AIMessageCreateRequest,
    AIMessageResponse,
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
# 3. AI Technical Breakdown (HITL Interruption)
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
# 4. Workspace Copilot: ReAct Assistant (SSE Stream)
# ==============================================================================

from app.agents.react_agent import LinearAskAgent


from fastapi import Request

@router.post(
    "/ai/chat/stream",
    summary="Server-Sent Events (SSE) stream for Workspace Copilot ReAct agent with tool execution",
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


@router.post(
    "/ai/chat/action/confirm",
    response_model=ChatActionConfirmResponse,
    summary="Executes confirmed Human-in-the-Loop mutating action from Workspace Copilot ReAct agent",
)
async def confirm_chat_action(
    payload: ChatActionConfirmRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Client = Depends(get_admin_db),
):
    return Phase4Service.confirm_chat_action(
        data=payload,
        user_id=current_user.id,
        user_jwt=current_user.raw_token,
        db=db,
    )


# ==============================================================================
# AI Conversation History Endpoints
# ==============================================================================

@router.get(
    "/ai/threads",
    response_model=List[AIThreadResponse],
    summary="List persistent AI chat threads for the current user and organization",
)
async def list_ai_threads(
    organization_id: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Client = Depends(get_admin_db),
):
    return Phase4Service.list_ai_threads(
        organization_id=organization_id,
        user_id=current_user.id,
        db=db,
    )


@router.post(
    "/ai/threads",
    response_model=AIThreadResponse,
    summary="Create or initialize a new AI chat thread",
)
async def create_ai_thread(
    payload: AIThreadCreateRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Client = Depends(get_admin_db),
):
    return Phase4Service.create_or_get_ai_thread(
        organization_id=payload.organization_id,
        user_id=current_user.id,
        db=db,
        title=payload.title,
        first_message=payload.first_message,
    )


@router.get(
    "/ai/threads/{thread_id}/messages",
    response_model=List[AIMessageResponse],
    summary="List messages in an AI chat thread",
)
async def list_ai_thread_messages(
    thread_id: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Client = Depends(get_admin_db),
):
    return Phase4Service.list_ai_messages(
        thread_id=thread_id,
        user_id=current_user.id,
        db=db,
    )


@router.post(
    "/ai/threads/{thread_id}/messages",
    response_model=AIMessageResponse,
    summary="Append a message to an AI chat thread",
)
async def create_ai_thread_message(
    thread_id: str,
    payload: AIMessageCreateRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Client = Depends(get_admin_db),
):
    return Phase4Service.add_ai_message(
        thread_id=thread_id,
        sender=payload.sender,
        content=payload.content,
        user_id=current_user.id,
        db=db,
        tools_json=payload.tools_json,
        interrupt_json=payload.interrupt_json,
    )


@router.delete(
    "/ai/threads/{thread_id}",
    summary="Delete an AI chat thread and all its messages",
)
async def delete_ai_thread(
    thread_id: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Client = Depends(get_admin_db),
):
    Phase4Service.delete_ai_thread(
        thread_id=thread_id,
        user_id=current_user.id,
        db=db,
    )
    return {"status": "success", "message": "Thread deleted"}



