# @related-files:
# - backend/app/schemas/issue.py
# - backend/app/services/phase3_service.py
# - backend/app/api/v1/phase3.py

from datetime import datetime
from typing import Any, Dict, Optional
from pydantic import BaseModel

from app.schemas.issue import IssueAssigneeUser


class InboxItemResponse(BaseModel):
    id: str
    action: str
    changes: Optional[Dict[str, Any]] = None
    actor: Optional[IssueAssigneeUser] = None
    issue_id: Optional[str] = None
    issue_identifier: Optional[str] = None
    issue_title: Optional[str] = None
    team_key: Optional[str] = None
    is_deleted: bool = False
    state: Optional[Dict[str, Any]] = None
    priority: Optional[str] = None
    created_at: datetime
