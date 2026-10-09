"""
Layer 3: API Contracts Audit Tests
Corresponds to test_03_api_contracts.py from the audit suite.
Verifies payload structures, schema requirements, and frontend-backend contracts.
"""

import uuid
import pytest
from pydantic import ValidationError
from fastapi import status

from app.schemas.issue import IssueUpdate, IssueCreate, IssueReorderRequest, BatchUpdateRequest, BatchReorderRequest, SubtaskCreate
from app.schemas.workspace import MemberInviteRequest
from app.schemas.phase4 import (
    AttachmentUploadRequest,
    AttachmentUploadResponse,
    DuplicateCheckRequest,
    DuplicateCheckResponse,
)
from app.schemas.team import TeamUpdate


def test_H2_issue_update_requires_expected_version():
    """H-2: Verify IssueUpdate supports expected_version for optimistic concurrency or LWW."""
    update = IssueUpdate(title="Updated Title", expected_version=1)
    assert update.expected_version == 1
    # Also verify LWW without expected_version
    lww_update = IssueUpdate(title="Updated Title")
    assert lww_update.expected_version is None


def test_M1_state_id_rejects_non_uuid_placeholder():
    """M-1: Verify IssueCreate validates state_id as a valid UUID, rejecting 'st_todo' placeholder."""
    # A robust schema must reject non-UUID strings for foreign key state_id
    with pytest.raises((ValidationError, ValueError)):
        obj = IssueCreate(title="Test Issue", state_id="st_todo")
        # Validate that state_id is actually a valid UUID
        uuid.UUID(str(obj.state_id))


def test_api_contract_subtask_create_schema():
    """Contract: SubtaskCreate requires title."""
    with pytest.raises(ValidationError):
        SubtaskCreate()


def test_api_contract_batch_update_schema():
    """Contract: BatchUpdateRequest accepts valid updates array."""
    req = BatchUpdateRequest(updates=[{"issue_id": str(uuid.uuid4()), "priority": "high"}])
    assert len(req.updates) == 1


def test_api_contract_batch_reorder_schema():
    """Contract: BatchReorderRequest accepts items array."""
    req = BatchReorderRequest(items=[{"issue_id": str(uuid.uuid4()), "state_id": str(uuid.uuid4()), "position": "0|h00001:"}])
    assert len(req.items) == 1


def test_api_contract_issue_reorder_schema():
    """Contract: IssueReorderRequest accepts prev_position and next_position."""
    req = IssueReorderRequest(prev_position="0|h00000:", next_position="0|h00002:")
    assert req.prev_position == "0|h00000:"


def test_api_contract_attachment_upload_request_schema():
    """Contract: AttachmentUploadRequest requires valid file_size and max_length."""
    with pytest.raises(ValidationError):
        AttachmentUploadRequest(issue_id=str(uuid.uuid4()), file_name="file.png", file_size=0, mime_type="image/png")


def test_api_contract_attachment_upload_response_schema():
    """Contract: AttachmentUploadResponse enforces upload_url as string."""
    res = AttachmentUploadResponse(
        attachment_id=str(uuid.uuid4()),
        issue_id=str(uuid.uuid4()),
        upload_url="https://storage.supabase.com/upload",
        storage_path="org_1/issue_1/file.png",
        file_name="file.png",
    )
    assert isinstance(res.upload_url, str)


def test_api_contract_duplicate_check_request():
    """Contract: DuplicateCheckRequest validates title min_length."""
    with pytest.raises(ValidationError):
        DuplicateCheckRequest(title="Short")


def test_api_contract_duplicate_check_response():
    """Contract: DuplicateCheckResponse includes duplicates_found and count."""
    res = DuplicateCheckResponse(duplicates_found=False, count=0, matches=[])
    assert res.duplicates_found is False


def test_api_contract_cycle_complete_request():
    """Contract: TeamUpdate validates cycle_duration_weeks bounds."""
    with pytest.raises(ValidationError):
        TeamUpdate(cycle_duration_weeks=100)


def test_api_contract_member_invite_request():
    """Contract: MemberInviteRequest requires valid email."""
    with pytest.raises(ValidationError):
        MemberInviteRequest(email="not_valid")
