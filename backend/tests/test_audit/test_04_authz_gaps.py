"""
Layer 4: Authorization Gaps Audit Tests
Corresponds to test_04_authz_gaps.py from the audit suite.
Verifies service-layer authorization checks, tenant membership validation,
field clearing, OCC atomic predicates, and deletion permissions.
"""

import uuid
from unittest.mock import MagicMock
import pytest
from fastapi import HTTPException, status

from app.schemas.issue import IssueUpdate, BatchUpdateRequest, BatchReorderRequest
from app.schemas.phase4 import BreakdownStartRequest
from app.services.issue_service import IssueService
from app.services.phase4_service import Phase4Service

MOCK_USER_ID = "00000000-0000-0000-0000-000000000001"
MOCK_ORG_ID = "11111111-1111-1111-1111-111111111111"
MOCK_TEAM_ID = "22222222-2222-2222-2222-222222222222"
MOCK_ISSUE_ID = "33333333-3333-3333-3333-333333333333"


def create_mock_db(issue_data=None, member_data=None):
    mock_db = MagicMock()
    tables = {}

    default_issue = {
        "id": MOCK_ISSUE_ID,
        "organization_id": MOCK_ORG_ID,
        "team_id": MOCK_TEAM_ID,
        "number": 1,
        "identifier": "ENG-1",
        "title": "Test Issue",
        "priority": "none",
        "state_id": "33333333-3333-3333-3333-333333333331",
        "creator_id": MOCK_USER_ID,
        "sort_order": "0|h00000:",
        "version": 1,
        "created_at": "2026-10-01T00:00:00Z",
        "updated_at": "2026-10-01T00:00:00Z",
    }
    if issue_data:
        default_issue.update(issue_data)

    def get_table(name):
        if name not in tables:
            t = MagicMock()
            if name == "issues":
                iss = default_issue
                t.select.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(data=[iss])
                t.select.return_value.limit.return_value.execute.return_value = MagicMock(data=[iss])
                
                # Fluent chain for update().eq().eq()...execute()
                up_mock = MagicMock()
                up_mock.eq.return_value = up_mock
                up_mock.execute.return_value = MagicMock(data=[iss])
                t.update.return_value = up_mock
            elif name == "workspace_members":
                mems = member_data if member_data is not None else [{"id": "m1", "role": "member", "organization_id": MOCK_ORG_ID}]
                t.select.return_value.eq.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(data=mems)
                t.select.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(data=mems)
            elif name == "activity_logs":
                t.insert.return_value.execute.return_value = MagicMock(data=[{"id": "log1"}])
                t.update.return_value.eq.return_value.execute.return_value = MagicMock(data=[])
                t.delete.return_value.eq.return_value.execute.return_value = MagicMock(data=[])
            tables[name] = t
        return tables[name]

    mock_db.table.side_effect = get_table
    return mock_db


def test_C2_set_password_endpoint_not_admitted_unauthenticated(client):
    """C-2: Verify /auth/set-password is removed or rejects unauthenticated requests."""
    res = client.post("/api/v1/auth/set-password", json={"password": "new_password"})
    assert res.status_code in (status.HTTP_401_UNAUTHORIZED, status.HTTP_404_NOT_FOUND, status.HTTP_405_METHOD_NOT_ALLOWED)


def test_C3_signup_existing_email_returns_409(client, mock_db):
    """C-3: Verify /auth/signup returns 409 Conflict when email already registered without resetting credentials."""
    mock_db.auth.admin.create_user.side_effect = Exception("User already registered with this email")
    res = client.post("/api/v1/auth/signup", json={"name": "Hacker", "email": "victim@example.com", "password": "hacked"})
    assert res.status_code == status.HTTP_409_CONFLICT, \
        f"C-3 DEFECT: Signup on existing email returned {res.status_code} instead of 409 Conflict!"


def test_C6_batch_update_verifies_workspace_membership():
    """C-6: Verify batch_update performs membership check and denies non-members."""
    mock_db = create_mock_db(member_data=[])
    data = BatchUpdateRequest(updates=[{"issue_id": MOCK_ISSUE_ID, "priority": "urgent"}])
    with pytest.raises(HTTPException) as exc:
        IssueService.batch_update(data, "stranger_user_id", mock_db)
    assert exc.value.status_code == status.HTTP_403_FORBIDDEN


def test_C6_batch_reorder_verifies_workspace_membership():
    """C-6: Verify batch_reorder performs membership check and denies non-members."""
    mock_db = create_mock_db(member_data=[])
    data = BatchReorderRequest(items=[{"issue_id": MOCK_ISSUE_ID, "state_id": "s1", "position": "0|h00001:"}])
    with pytest.raises(HTTPException) as exc:
        IssueService.batch_reorder(data, "stranger_user_id", mock_db)
    assert exc.value.status_code == status.HTTP_403_FORBIDDEN


def test_C6_batch_update_writes_activity_logs():
    """C-6: Verify batch_update records audit trail in activity_logs."""
    mock_db = create_mock_db(issue_data={"id": MOCK_ISSUE_ID, "organization_id": MOCK_ORG_ID, "version": 1})
    data = BatchUpdateRequest(updates=[{"issue_id": MOCK_ISSUE_ID, "priority": "high"}])
    IssueService.batch_update(data, MOCK_USER_ID, mock_db)

    # Check table("activity_logs").insert was called
    act_table = mock_db.table("activity_logs")
    assert act_table.insert.called, "C-6 DEFECT: batch_update mutated issues without writing activity_logs!"


def test_C6_batch_update_increments_version():
    """C-6 / H-9: Verify batch_update increments issue version."""
    mock_db = create_mock_db(issue_data={"id": MOCK_ISSUE_ID, "organization_id": MOCK_ORG_ID, "version": 2})
    data = BatchUpdateRequest(updates=[{"issue_id": MOCK_ISSUE_ID, "priority": "low"}])
    IssueService.batch_update(data, MOCK_USER_ID, mock_db)

    iss_table = mock_db.table("issues")
    assert iss_table.update.called
    update_payload = iss_table.update.call_args[0][0]
    assert update_payload.get("version") == 3, "C-6 DEFECT: batch_update failed to increment version!"


def test_C6_batch_reorder_increments_version():
    """C-6: Verify batch_reorder increments issue version."""
    mock_db = create_mock_db(issue_data={"id": MOCK_ISSUE_ID, "organization_id": MOCK_ORG_ID, "version": 5})
    data = BatchReorderRequest(items=[{"issue_id": MOCK_ISSUE_ID, "state_id": "s1", "position": "0|h00002:"}])
    IssueService.batch_reorder(data, MOCK_USER_ID, mock_db)

    iss_table = mock_db.table("issues")
    assert iss_table.update.called
    update_payload = iss_table.update.call_args[0][0]
    assert update_payload.get("version") == 6, "C-6 DEFECT: batch_reorder failed to increment version!"


def test_C7_start_breakdown_verifies_membership():
    """C-7: Verify start_breakdown checks caller organization membership before reading issue."""
    mock_db = create_mock_db(
        issue_data={"id": MOCK_ISSUE_ID, "organization_id": MOCK_ORG_ID, "title": "CONFIDENTIAL: Secret project", "team_id": MOCK_TEAM_ID},
        member_data=[]
    )

    req = BreakdownStartRequest(issue_id=MOCK_ISSUE_ID)
    with pytest.raises(HTTPException) as exc:
        Phase4Service.start_breakdown(req, "non_member_id", mock_db)
    assert exc.value.status_code == status.HTTP_403_FORBIDDEN


def test_H4_field_clearing_assignee_id_none():
    """H-4: Verify explicitly passing assignee_id=None sets assignee_id to None in DB payload."""
    mock_db = create_mock_db(issue_data={"id": MOCK_ISSUE_ID, "organization_id": MOCK_ORG_ID, "version": 1, "assignee_id": "old_user"})
    data = IssueUpdate(assignee_id=None, expected_version=1)
    IssueService.update_issue(MOCK_ISSUE_ID, data, MOCK_USER_ID, mock_db)

    iss_table = mock_db.table("issues")
    update_payload = iss_table.update.call_args[0][0]
    assert "assignee_id" in update_payload and update_payload["assignee_id"] is None, \
        f"H-4 DEFECT: Explicit assignee_id=None was dropped from write payload: {update_payload}"


def test_H4_field_clearing_due_date_none():
    """H-4: Verify explicitly passing due_date=None sets due_date to None in DB payload."""
    mock_db = create_mock_db(issue_data={"id": MOCK_ISSUE_ID, "organization_id": MOCK_ORG_ID, "version": 1, "due_date": "2026-10-01"})
    data = IssueUpdate(due_date=None, expected_version=1)
    IssueService.update_issue(MOCK_ISSUE_ID, data, MOCK_USER_ID, mock_db)

    iss_table = mock_db.table("issues")
    update_payload = iss_table.update.call_args[0][0]
    assert "due_date" in update_payload and update_payload["due_date"] is None, \
        f"H-4 DEFECT: Explicit due_date=None was dropped from write payload: {update_payload}"


def test_H4_field_clearing_assignee_none():
    """H-4: Verify explicitly passing assignee_id=None sets assignee_id to None in DB payload."""
    mock_db = create_mock_db(issue_data={"id": MOCK_ISSUE_ID, "organization_id": MOCK_ORG_ID, "version": 1, "assignee_id": str(uuid.uuid4())})
    data = IssueUpdate(assignee_id=None, expected_version=1)
    IssueService.update_issue(MOCK_ISSUE_ID, data, MOCK_USER_ID, mock_db)

    iss_table = mock_db.table("issues")
    update_payload = iss_table.update.call_args[0][0]
    assert "assignee_id" in update_payload and update_payload["assignee_id"] is None, \
        f"H-4 DEFECT: Explicit assignee_id=None was dropped from write payload: {update_payload}"


def test_H9_atomic_occ_predicate_includes_version():
    """H-9: Verify update_issue filters by .eq('version', expected_version) atomically."""
    mock_db = create_mock_db(issue_data={"id": MOCK_ISSUE_ID, "organization_id": MOCK_ORG_ID, "version": 3})
    data = IssueUpdate(title="Concurrent edit", expected_version=3)
    IssueService.update_issue(MOCK_ISSUE_ID, data, MOCK_USER_ID, mock_db)

    iss_table = mock_db.table("issues")
    eq_calls = iss_table.update.return_value.eq.call_args_list
    assert any(call[0] == ("version", 3) for call in eq_calls), \
        "H-9 DEFECT: DB update did not predicate on version=.eq('version', expected_version)!"


def test_H13_hard_delete_forbidden_for_non_admin():
    """H-13: Verify regular non-admin members cannot hard delete issues."""
    mock_db = create_mock_db(
        issue_data={"id": MOCK_ISSUE_ID, "organization_id": MOCK_ORG_ID},
        member_data=[{"id": "m1", "role": "member"}]
    )
    with pytest.raises(HTTPException) as exc:
        IssueService.delete_issue(MOCK_ISSUE_ID, MOCK_USER_ID, mock_db, hard=True)
    assert exc.value.status_code == status.HTTP_403_FORBIDDEN


def test_H13_hard_delete_does_not_delete_activity_logs():
    """H-13: Verify hard delete does not issue DELETE against activity_logs."""
    mock_db = create_mock_db(
        issue_data={"id": MOCK_ISSUE_ID, "organization_id": MOCK_ORG_ID},
        member_data=[{"id": "m1", "role": "admin"}]
    )
    IssueService.delete_issue(MOCK_ISSUE_ID, MOCK_USER_ID, mock_db, hard=True)

    act_table = mock_db.table("activity_logs")
    assert not act_table.delete.called, \
        "H-13 DEFECT: hard delete issued DELETE against activity_logs, erasing audit records!"
