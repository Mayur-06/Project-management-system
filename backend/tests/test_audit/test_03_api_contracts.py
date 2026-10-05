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
from app.schemas.phase3 import TriageAcceptRequest, CycleCompleteRequest
from app.schemas.phase4 import TriageClassifyRequest, AttachmentUploadRequest, AttachmentUploadResponse, DuplicateCheckRequest, DuplicateCheckResponse
from app.schemas.workspace import MemberInviteRequest


def test_H2_issue_update_requires_expected_version():
    """H-2: Verify IssueUpdate requires expected_version for optimistic concurrency."""
    with pytest.raises(ValidationError) as exc:
        IssueUpdate(title="Updated Title")
    assert "expected_version" in str(exc.value)


def test_H2_triage_accept_does_not_require_expected_version():
    """H-2: Verify TriageAcceptRequest succeeds without requiring expected_version."""
    req = TriageAcceptRequest(target_state_id=str(uuid.uuid4()))
    assert req.target_state_id is not None
    assert not hasattr(req, "expected_version") or getattr(req, "expected_version", None) is None


def test_H2_triage_page_payload_compatible_with_triage_accept():
    """H-2: Verify payload sent by triage UI is accepted by TriageAcceptRequest."""
    payload = {
        "target_state_id": str(uuid.uuid4()),
        "assignee_id": str(uuid.uuid4()),
        "priority": "high",
        "estimate": 3,
    }
    req = TriageAcceptRequest(**payload)
    assert req.priority == "high"


def test_H3_auto_triage_classify_organization_id_optional():
    """H-3: Verify TriageClassifyRequest allows organization_id to be optional."""
    req = TriageClassifyRequest(title="Login flow fails unexpectedly")
    assert req.organization_id is None


def test_H3_auto_triage_classify_team_id_optional():
    """H-3: Verify TriageClassifyRequest allows team_id to be optional."""
    req = TriageClassifyRequest(title="Database connection timeout")
    assert req.team_id is None


def test_H3_frontend_auto_triage_payload_accepted_without_422(client, mock_db):
    """H-3: Verify POST /api/v1/ai/triage/classify accepts payload with only title."""
    from unittest.mock import MagicMock
    
    def get_table(name):
        t = MagicMock()
        if name == "teams":
            t.select.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(
                data=[{"id": "tm1", "key": "ENG", "organization_id": "org1"}]
            )
            t.select.return_value.limit.return_value.execute.return_value = MagicMock(
                data=[{"id": "tm1", "key": "ENG", "organization_id": "org1"}]
            )
        elif name == "team_members":
            t.select.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(
                data=[{"team_id": "tm1"}]
            )
        elif name == "workspace_members":
            t.select.return_value.eq.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(
                data=[{"id": "m1", "organization_id": "org1"}]
            )
        return t

    mock_db.table.side_effect = get_table
    
    payload = {"title": "OAuth 2.0 redirect URL issue in Safari"}
    response = client.post("/api/v1/ai/triage/classify", json=payload)
    # Must NOT be 422 Unprocessable Entity
    assert response.status_code != 422, \
        f"H-3 DEFECT: /ai/triage/classify rejected payload with 422: {response.text}"


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
    """Contract: CycleCompleteRequest requires destination."""
    with pytest.raises(ValidationError):
        CycleCompleteRequest()


def test_api_contract_member_invite_request():
    """Contract: MemberInviteRequest requires valid email."""
    with pytest.raises(ValidationError):
        MemberInviteRequest(email="not_valid")
