# @related-files:
# - backend/app/schemas/phase3.py
# - backend/app/services/phase3_service.py
# - frontend/lib/api.ts

from typing import List
from fastapi import APIRouter, Depends, Query
from supabase import Client

from app.core.security import AuthenticatedUser
from app.core.dependencies import get_current_user, get_admin_db
from app.schemas.phase3 import InboxItemResponse
from app.services.phase3_service import Phase3Service

router = APIRouter(tags=["Workspace Inbox"])


# ==============================================================================
# 0. Org Inbox
# ==============================================================================

@router.get(
    "/organizations/{org_slug}/inbox",
    response_model=List[InboxItemResponse],
    summary="Recent activity feed across the organization",
)
async def list_inbox(
    org_slug: str,
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Client = Depends(get_admin_db),
):
    return Phase3Service.list_inbox(org_slug, current_user.id, db, limit=limit, offset=offset)