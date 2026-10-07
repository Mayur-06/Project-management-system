from typing import Any, Dict, List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, Query, HTTPException, status
from pydantic import BaseModel
from supabase import Client

from app.core.security import AuthenticatedUser
from app.core.dependencies import get_current_user, get_admin_db

router = APIRouter(tags=["Labels"])

STANDARD_LABELS = [
    {"name": "Bug", "color": "#EF4444", "description": "Something isn't working as expected"},
    {"name": "Feature", "color": "#8B5CF6", "description": "New functionality or enhancement"},
    {"name": "Improvement", "color": "#3B82F6", "description": "Refining existing behavior or UX"},
    {"name": "Documentation", "color": "#10B981", "description": "Improvements to documentation"},
    {"name": "Design", "color": "#EC4899", "description": "UI/UX visual and design tasks"},
    {"name": "Backend", "color": "#F59E0B", "description": "Server-side, API, or database tasks"},
    {"name": "Frontend", "color": "#06B6D4", "description": "Client-side web application tasks"},
    {"name": "Performance", "color": "#F97316", "description": "Performance, latency, and scaling work"},
]


class LabelResponse(BaseModel):
    id: str
    organization_id: str
    name: str
    color: str
    description: Optional[str] = None
    created_at: datetime


@router.get(
    "/labels",
    response_model=List[LabelResponse],
    summary="List all labels for an organization (auto-seeding 8 standard labels if missing)",
)
async def list_labels(
    organization_id: str = Query(..., description="Organization UUID"),
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Client = Depends(get_admin_db),
):
    # Verify membership
    mem_chk = (
        db.table("workspace_members")
        .select("id")
        .eq("organization_id", organization_id)
        .eq("user_id", current_user.id)
        .limit(1)
        .execute()
    )
    if not mem_chk.data:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied to organization")

    # Fetch labels
    res = db.table("labels").select("*").eq("organization_id", organization_id).order("name").execute()
    existing = res.data or []

    # If no labels exist, seed the standard 8
    if not existing:
        for lbl in STANDARD_LABELS:
            try:
                db.table("labels").insert({
                    "organization_id": organization_id,
                    "name": lbl["name"],
                    "color": lbl["color"],
                    "description": lbl["description"],
                }).execute()
            except Exception:
                pass
        refreshed = db.table("labels").select("*").eq("organization_id", organization_id).order("name").execute()
        existing = refreshed.data or []

    return [LabelResponse(**item) for item in existing]


@router.post(
    "/issues/{issue_id}/labels/{label_id}",
    response_model=Dict[str, Any],
    summary="Attach a label to an issue",
)
async def attach_label(
    issue_id: str,
    label_id: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Client = Depends(get_admin_db),
):
    # Verify issue access
    iss_res = db.table("issues").select("id, organization_id").eq("id", issue_id).limit(1).execute()
    if not iss_res.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Issue not found")
    issue = iss_res.data[0]

    # Verify label exists and belongs to same org
    lbl_res = db.table("labels").select("*").eq("id", label_id).eq("organization_id", issue["organization_id"]).limit(1).execute()
    if not lbl_res.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Label not found")
    label = lbl_res.data[0]

    # Insert into issue_labels
    try:
        db.table("issue_labels").upsert({"issue_id": issue_id, "label_id": label_id}).execute()
    except Exception:
        pass

    # Activity log
    db.table("activity_logs").insert({
        "organization_id": issue["organization_id"],
        "issue_id": issue_id,
        "actor_id": current_user.id,
        "action": "issue_updated",
        "changes": {"label_added": {"id": label["id"], "name": label["name"]}},
    }).execute()

    return {"status": "success", "issue_id": issue_id, "label": label}


@router.delete(
    "/issues/{issue_id}/labels/{label_id}",
    response_model=Dict[str, Any],
    summary="Detach a label from an issue",
)
async def detach_label(
    issue_id: str,
    label_id: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Client = Depends(get_admin_db),
):
    iss_res = db.table("issues").select("id, organization_id").eq("id", issue_id).limit(1).execute()
    if not iss_res.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Issue not found")
    issue = iss_res.data[0]

    lbl_res = db.table("labels").select("*").eq("id", label_id).limit(1).execute()
    label_name = lbl_res.data[0]["name"] if lbl_res.data else label_id

    db.table("issue_labels").delete().eq("issue_id", issue_id).eq("label_id", label_id).execute()

    # Activity log
    db.table("activity_logs").insert({
        "organization_id": issue["organization_id"],
        "issue_id": issue_id,
        "actor_id": current_user.id,
        "action": "issue_updated",
        "changes": {"label_removed": {"id": label_id, "name": label_name}},
    }).execute()

    return {"status": "success", "issue_id": issue_id, "label_id": label_id}
