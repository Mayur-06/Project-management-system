from datetime import datetime, timezone, timedelta
from unittest.mock import MagicMock
import pytest
from fastapi import status
from tests.conftest import (
    MOCK_USER_ID,
    MOCK_ORG_ID,
    MOCK_TEAM_ID,
    MOCK_STATE_ID_1,
    MOCK_STATE_ID_2,
)

TEAM_B_ID = "22222222-2222-2222-2222-222222222223"
TRIAGE_STATE_ID = "33333333-3333-3333-3333-333333333333"
TODO_STATE_ID = "33333333-3333-3333-3333-333333333334"
CANCELED_STATE_ID = "33333333-3333-3333-3333-333333333335"
MOCK_ISSUE_ID = "44444444-4444-4444-4444-444444444444"
MOCK_ASSIGNEE_ID = "00000000-0000-0000-0000-000000000009"


# ==============================================================================
# 1. Cross-Team vs Same-Team Issue Creation Tests (Triage Invariant)
# ==============================================================================

def test_cross_team_issue_creation_auto_routes_to_triage(client, mock_db):
    """
    When a user from Team A creates an issue targeting Team B (cross-team),
    it MUST automatically route to Team B's workflow state with category 'triage'.
    """
    inserted_payloads = []

    def mock_table(table_name):
        mock_t = MagicMock()
        if table_name == "teams":
            mock_t.select().eq().limit().execute.return_value = MagicMock(
                data=[{"id": TEAM_B_ID, "organization_id": MOCK_ORG_ID, "key": "OPS", "issue_counter": 10}]
            )
            mock_t.update().eq().execute.return_value = MagicMock(data=[])
        elif table_name == "workspace_members":
            mock_t.select().eq().eq().limit().execute.return_value = MagicMock(data=[{"id": "wm-1", "role": "member"}])
        elif table_name == "team_members":
            # User is NOT in Team B (empty data -> cross-team)
            mock_t.select().eq().eq().limit().execute.return_value = MagicMock(data=[])
        elif table_name == "workflow_states":
            mock_t.select().eq().eq().limit().execute.return_value = MagicMock(
                data=[{"id": TRIAGE_STATE_ID, "category": "triage"}]
            )
        elif table_name == "issues":
            mock_t.select().eq().eq().is_().order().limit().execute.return_value = MagicMock(data=[])

            def fake_insert(payload):
                inserted_payloads.append(payload)
                m_exec = MagicMock()
                m_exec.execute.return_value = MagicMock(
                    data=[{
                        "id": MOCK_ISSUE_ID,
                        "organization_id": MOCK_ORG_ID,
                        "team_id": TEAM_B_ID,
                        "number": 11,
                        "identifier": "OPS-11",
                        "title": payload.get("title", ""),
                        "priority": payload.get("priority", "none"),
                        "state_id": payload.get("state_id"),
                        "creator_id": MOCK_USER_ID,
                        "sort_order": "0|h80000:",
                        "version": 1,
                        "created_at": "2026-10-02T10:00:00Z",
                        "updated_at": "2026-10-02T10:00:00Z",
                    }]
                )
                return m_exec

            mock_t.insert.side_effect = fake_insert
        elif table_name == "activity_logs":
            mock_t.insert().execute.return_value = MagicMock(data=[])
        return mock_t

    mock_db.table.side_effect = mock_table

    payload = {
        "team_id": TEAM_B_ID,
        "title": "Need production DB migration assistance",
        "priority": "high",
    }
    response = client.post("/api/v1/issues", json=payload)
    assert response.status_code == status.HTTP_201_CREATED
    data = response.json()
    assert data["identifier"] == "OPS-11"
    assert data["state_id"] == TRIAGE_STATE_ID
    assert len(inserted_payloads) == 1
    assert inserted_payloads[0]["state_id"] == TRIAGE_STATE_ID


def test_cross_team_issue_creation_forces_triage_even_if_state_specified(client, mock_db):
    """
    Even if an external user attempts to pass a specific active state_id,
    cross-team creation enforces that the issue routes to Team B's Triage state.
    """
    inserted_payloads = []

    def mock_table(table_name):
        mock_t = MagicMock()
        if table_name == "teams":
            mock_t.select().eq().limit().execute.return_value = MagicMock(
                data=[{"id": TEAM_B_ID, "organization_id": MOCK_ORG_ID, "key": "OPS", "issue_counter": 10}]
            )
            mock_t.update().eq().execute.return_value = MagicMock(data=[])
        elif table_name == "workspace_members":
            mock_t.select().eq().eq().limit().execute.return_value = MagicMock(data=[{"id": "wm-1", "role": "member"}])
        elif table_name == "team_members":
            mock_t.select().eq().eq().limit().execute.return_value = MagicMock(data=[])
        elif table_name == "workflow_states":
            mock_t.select().eq().eq().limit().execute.return_value = MagicMock(
                data=[{"id": TRIAGE_STATE_ID, "category": "triage"}]
            )
        elif table_name == "issues":
            mock_t.select().eq().eq().is_().order().limit().execute.return_value = MagicMock(data=[])

            def fake_insert(payload):
                inserted_payloads.append(payload)
                m_exec = MagicMock()
                m_exec.execute.return_value = MagicMock(
                    data=[{
                        "id": MOCK_ISSUE_ID,
                        "organization_id": MOCK_ORG_ID,
                        "team_id": TEAM_B_ID,
                        "number": 12,
                        "identifier": "OPS-12",
                        "title": payload.get("title", ""),
                        "priority": payload.get("priority", "none"),
                        "state_id": payload.get("state_id"),
                        "creator_id": MOCK_USER_ID,
                        "sort_order": "0|h80000:",
                        "version": 1,
                        "created_at": "2026-10-02T10:00:00Z",
                        "updated_at": "2026-10-02T10:00:00Z",
                    }]
                )
                return m_exec

            mock_t.insert.side_effect = fake_insert
        elif table_name == "activity_logs":
            mock_t.insert().execute.return_value = MagicMock(data=[])
        return mock_t

    mock_db.table.side_effect = mock_table

    payload = {
        "team_id": TEAM_B_ID,
        "title": "Cross-team ticket attempting to bypass triage",
        "priority": "medium",
        "state_id": TODO_STATE_ID,
    }
    response = client.post("/api/v1/issues", json=payload)
    assert response.status_code == status.HTTP_201_CREATED
    data = response.json()
    assert data["state_id"] == TRIAGE_STATE_ID
    assert inserted_payloads[0]["state_id"] == TRIAGE_STATE_ID


def test_same_team_issue_creation_bypasses_triage(client, mock_db):
    """
    When a member of Team B creates an issue for Team B,
    it MUST bypass triage and route directly to the active default state (Todo/Unstarted).
    """
    inserted_payloads = []

    def mock_table(table_name):
        mock_t = MagicMock()
        if table_name == "teams":
            mock_t.select().eq().limit().execute.return_value = MagicMock(
                data=[{"id": TEAM_B_ID, "organization_id": MOCK_ORG_ID, "key": "OPS", "issue_counter": 20}]
            )
            mock_t.update().eq().execute.return_value = MagicMock(data=[])
        elif table_name == "workspace_members":
            mock_t.select().eq().eq().limit().execute.return_value = MagicMock(data=[{"id": "wm-1", "role": "member"}])
        elif table_name == "team_members":
            mock_t.select().eq().eq().limit().execute.return_value = MagicMock(data=[{"id": "tm-1"}])
        elif table_name == "workflow_states":
            mock_t.select().eq().eq().limit().execute.return_value = MagicMock(
                data=[{"id": TODO_STATE_ID, "category": "unstarted", "is_default": True}]
            )
        elif table_name == "issues":
            mock_t.select().eq().eq().is_().order().limit().execute.return_value = MagicMock(data=[])

            def fake_insert(payload):
                inserted_payloads.append(payload)
                m_exec = MagicMock()
                m_exec.execute.return_value = MagicMock(
                    data=[{
                        "id": MOCK_ISSUE_ID,
                        "organization_id": MOCK_ORG_ID,
                        "team_id": TEAM_B_ID,
                        "number": 21,
                        "identifier": "OPS-21",
                        "title": payload.get("title", ""),
                        "priority": payload.get("priority", "none"),
                        "state_id": payload.get("state_id"),
                        "creator_id": MOCK_USER_ID,
                        "sort_order": "0|h80000:",
                        "version": 1,
                        "created_at": "2026-10-02T10:00:00Z",
                        "updated_at": "2026-10-02T10:00:00Z",
                    }]
                )
                return m_exec

            mock_t.insert.side_effect = fake_insert
        elif table_name == "activity_logs":
            mock_t.insert().execute.return_value = MagicMock(data=[])
        return mock_t

    mock_db.table.side_effect = mock_table

    payload = {
        "team_id": TEAM_B_ID,
        "title": "Internal OPS routine maintenance",
        "priority": "low",
    }
    response = client.post("/api/v1/issues", json=payload)
    assert response.status_code == status.HTTP_201_CREATED
    data = response.json()
    assert data["identifier"] == "OPS-21"
    assert data["state_id"] == TODO_STATE_ID
    assert inserted_payloads[0]["state_id"] == TODO_STATE_ID


def test_same_team_issue_creation_prevents_triage_state_assignment(client, mock_db):
    """
    If a team member accidentally or intentionally tries to pass a triage state_id,
    the invariant resets it to active default state (same-team cannot send to triage).
    """
    inserted_payloads = []

    mock_ws_t = MagicMock()
    mock_ws_q = MagicMock()
    mock_ws_t.select.return_value = mock_ws_q
    mock_ws_q.eq.return_value = mock_ws_q
    mock_ws_q.limit.return_value = mock_ws_q
    mock_ws_q.execute.side_effect = [
        # 1. State check for passed TRIAGE_STATE_ID -> category is 'triage'
        MagicMock(data=[{"id": TRIAGE_STATE_ID, "category": "triage"}]),
        # 2. Default state query fallback -> TODO_STATE_ID
        MagicMock(data=[{"id": TODO_STATE_ID, "category": "unstarted", "is_default": True}]),
    ]

    def mock_table(table_name):
        mock_t = MagicMock()
        if table_name == "teams":
            mock_t.select().eq().limit().execute.return_value = MagicMock(
                data=[{"id": TEAM_B_ID, "organization_id": MOCK_ORG_ID, "key": "OPS", "issue_counter": 30}]
            )
            mock_t.update().eq().execute.return_value = MagicMock(data=[])
        elif table_name == "workspace_members":
            mock_t.select().eq().eq().limit().execute.return_value = MagicMock(data=[{"id": "wm-1", "role": "member"}])
        elif table_name == "team_members":
            mock_tm_q = MagicMock()
            mock_t.select.return_value = mock_tm_q
            mock_tm_q.eq.return_value = mock_tm_q
            mock_tm_q.limit.return_value = mock_tm_q
            mock_tm_q.execute.return_value = MagicMock(data=[{"id": "tm-1"}])
        elif table_name == "workflow_states":
            return mock_ws_t
        elif table_name == "issues":
            mock_t.select().eq().eq().is_().order().limit().execute.return_value = MagicMock(data=[])

            def fake_insert(payload):
                inserted_payloads.append(payload)
                m_exec = MagicMock()
                m_exec.execute.return_value = MagicMock(
                    data=[{
                        "id": MOCK_ISSUE_ID,
                        "organization_id": MOCK_ORG_ID,
                        "team_id": TEAM_B_ID,
                        "number": 31,
                        "identifier": "OPS-31",
                        "title": payload.get("title", ""),
                        "priority": payload.get("priority", "none"),
                        "state_id": payload.get("state_id"),
                        "creator_id": MOCK_USER_ID,
                        "sort_order": "0|h80000:",
                        "version": 1,
                        "created_at": "2026-10-02T10:00:00Z",
                        "updated_at": "2026-10-02T10:00:00Z",
                    }]
                )
                return m_exec

            mock_t.insert.side_effect = fake_insert
        elif table_name == "activity_logs":
            mock_t.insert().execute.return_value = MagicMock(data=[])
        return mock_t

    mock_db.table.side_effect = mock_table

    payload = {
        "team_id": TEAM_B_ID,
        "title": "Internal issue with triage state passed",
        "priority": "medium",
        "state_id": TRIAGE_STATE_ID,
    }
    response = client.post("/api/v1/issues", json=payload)
    assert response.status_code == status.HTTP_201_CREATED
    data = response.json()
    assert data["state_id"] == TODO_STATE_ID
    assert inserted_payloads[0]["state_id"] == TODO_STATE_ID


# ==============================================================================
# 2. Triage Inbox Listing and Snooze Filter Tests
# ==============================================================================

def test_list_triage_issues_filters_snoozed_correctly(client, mock_db):
    """
    Test GET /api/v1/teams/{team_id}/triage:
    - Returns active unsnoozed issues
    - Returns issues where snooze timestamp has expired
    - Filters out issues snoozed into the future
    """
    now = datetime.now(timezone.utc)
    future_snooze = (now + timedelta(days=2)).isoformat()
    expired_snooze = (now - timedelta(days=1)).isoformat()

    def mock_table(table_name):
        mock_t = MagicMock()
        if table_name == "teams":
            mock_t.select().eq().limit().execute.return_value = MagicMock(
                data=[{"id": TEAM_B_ID, "organization_id": MOCK_ORG_ID, "key": "OPS"}]
            )
        elif table_name == "workspace_members":
            mock_t.select().eq().eq().limit().execute.return_value = MagicMock(data=[{"id": "wm-1"}])
        elif table_name == "workflow_states":
            mock_t.select().eq().eq().limit().execute.return_value = MagicMock(
                data=[{"id": TRIAGE_STATE_ID, "category": "triage"}]
            )
        elif table_name == "issues":
            mock_t.select().eq().eq().is_().order().execute.return_value = MagicMock(
                data=[
                    {
                        "id": "issue-unsnoozed",
                        "organization_id": MOCK_ORG_ID,
                        "team_id": TEAM_B_ID,
                        "number": 1,
                        "identifier": "OPS-1",
                        "title": "Active triage issue",
                        "priority": "high",
                        "state_id": TRIAGE_STATE_ID,
                        "creator_id": MOCK_USER_ID,
                        "sort_order": "0|h10000:",
                        "version": 1,
                        "snoozed_until": None,
                        "created_at": "2026-10-02T08:00:00Z",
                        "updated_at": "2026-10-02T08:00:00Z",
                    },
                    {
                        "id": "issue-future-snooze",
                        "organization_id": MOCK_ORG_ID,
                        "team_id": TEAM_B_ID,
                        "number": 2,
                        "identifier": "OPS-2",
                        "title": "Snoozed until next week",
                        "priority": "medium",
                        "state_id": TRIAGE_STATE_ID,
                        "creator_id": MOCK_USER_ID,
                        "sort_order": "0|h20000:",
                        "version": 1,
                        "snoozed_until": future_snooze,
                        "created_at": "2026-10-01T08:00:00Z",
                        "updated_at": "2026-10-01T08:00:00Z",
                    },
                    {
                        "id": "issue-expired-snooze",
                        "organization_id": MOCK_ORG_ID,
                        "team_id": TEAM_B_ID,
                        "number": 3,
                        "identifier": "OPS-3",
                        "title": "Expired snooze should reappear",
                        "priority": "urgent",
                        "state_id": TRIAGE_STATE_ID,
                        "creator_id": MOCK_USER_ID,
                        "sort_order": "0|h30000:",
                        "version": 1,
                        "snoozed_until": expired_snooze,
                        "created_at": "2026-09-28T08:00:00Z",
                        "updated_at": "2026-09-28T08:00:00Z",
                    },
                ]
            )
        return mock_t

    mock_db.table.side_effect = mock_table

    response = client.get(f"/api/v1/teams/{TEAM_B_ID}/triage")
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert len(data) == 2
    returned_ids = [item["id"] for item in data]
    assert "issue-unsnoozed" in returned_ids
    assert "issue-expired-snooze" in returned_ids
    assert "issue-future-snooze" not in returned_ids


# ==============================================================================
# 3. AI Triage Classification Integration
# ==============================================================================

def test_ai_triage_classification_endpoint(client, mock_db):
    """
    Test POST /api/v1/ai/triage/classify generates:
    - suggested_priority
    - suggested_estimate
    - suggested_labels
    - suggested_assignee_id
    - suggested_team_key
    - reasoning
    """
    def mock_table(table_name):
        mock_t = MagicMock()
        if table_name == "teams":
            mock_t.select().eq().limit().execute.return_value = MagicMock(
                data=[{"id": TEAM_B_ID, "organization_id": MOCK_ORG_ID, "key": "OPS"}]
            )
        elif table_name == "team_members":
            mock_t.select().eq().execute.return_value = MagicMock(
                data=[{"user_id": MOCK_ASSIGNEE_ID}]
            )
        return mock_t

    mock_db.table.side_effect = mock_table

    payload = {
        "organization_id": MOCK_ORG_ID,
        "team_id": TEAM_B_ID,
        "title": "Critical latency spike on redis cluster",
        "description": "Database queries are timing out affecting user checkout",
    }
    response = client.post("/api/v1/ai/triage/classify", json=payload)
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert data["suggested_priority"] in ["urgent", "high"]
    assert data["suggested_estimate"] in [1, 2, 3, 5, 8]
    assert data["suggested_team_key"] == "OPS"
    assert data["suggested_assignee_id"] == MOCK_ASSIGNEE_ID
    assert "reasoning" in data
    assert len(data["suggested_labels"]) > 0


# ==============================================================================
# 4. Triage Actions: Snooze, Accept (Approval), Decline (Rejection)
# ==============================================================================

def test_snooze_triage_issue_flow(client, mock_db):
    """
    Test POST /api/v1/triage/{issue_id}/snooze:
    - Sets snoozed_until timestamp
    - Increments issue version
    - Inserts 'triage_snoozed' activity log
    """
    snooze_target = (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()

    def mock_table(table_name):
        mock_t = MagicMock()
        if table_name == "issues":
            mock_t.select().eq().limit().execute.return_value = MagicMock(
                data=[{
                    "id": MOCK_ISSUE_ID,
                    "team_id": TEAM_B_ID,
                    "organization_id": MOCK_ORG_ID,
                    "version": 1,
                    "state_id": TRIAGE_STATE_ID,
                }]
            )
            mock_t.update().eq().execute.return_value = MagicMock(data=[])
        elif table_name == "teams":
            mock_t.select().eq().limit().execute.return_value = MagicMock(
                data=[{"id": TEAM_B_ID, "organization_id": MOCK_ORG_ID, "key": "OPS"}]
            )
        elif table_name == "workspace_members":
            mock_t.select().eq().eq().limit().execute.return_value = MagicMock(data=[{"id": "wm-1"}])
        elif table_name == "activity_logs":
            mock_t.insert().execute.return_value = MagicMock(data=[])
        return mock_t

    mock_db.table.side_effect = mock_table

    payload = {"snoozed_until": snooze_target}
    response = client.post(f"/api/v1/triage/{MOCK_ISSUE_ID}/snooze", json=payload)
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert data["status"] == "snoozed"
    assert data["issue_id"] == MOCK_ISSUE_ID


def test_accept_triage_issue_approval_flow(client, mock_db):
    """
    Test POST /api/v1/triage/{issue_id}/accept:
    - Transitions issue from triage to target active state (e.g. Todo)
    - Clears snoozed_until
    - Sets assignee, priority, estimate
    - Inserts 'triage_accepted' activity log
    """
    def mock_table(table_name):
        mock_t = MagicMock()
        if table_name == "issues":
            mock_t.select().eq().limit().execute.return_value = MagicMock(
                data=[{
                    "id": MOCK_ISSUE_ID,
                    "team_id": TEAM_B_ID,
                    "organization_id": MOCK_ORG_ID,
                    "version": 1,
                    "state_id": TRIAGE_STATE_ID,
                    "number": 15,
                    "identifier": "OPS-15",
                    "title": "Migrate Redis to AWS ElastiCache",
                    "priority": "none",
                    "creator_id": MOCK_USER_ID,
                    "sort_order": "0|h10000:",
                    "created_at": "2026-10-02T09:00:00Z",
                    "updated_at": "2026-10-02T09:00:00Z",
                }]
            )
            mock_t.update().eq().execute.return_value = MagicMock(
                data=[{
                    "id": MOCK_ISSUE_ID,
                    "team_id": TEAM_B_ID,
                    "organization_id": MOCK_ORG_ID,
                    "number": 15,
                    "identifier": "OPS-15",
                    "title": "Migrate Redis to AWS ElastiCache",
                    "state_id": TODO_STATE_ID,
                    "assignee_id": MOCK_ASSIGNEE_ID,
                    "priority": "high",
                    "estimate": 5,
                    "snoozed_until": None,
                    "version": 2,
                    "creator_id": MOCK_USER_ID,
                    "sort_order": "0|h10000:",
                    "created_at": "2026-10-02T09:00:00Z",
                    "updated_at": "2026-10-02T09:30:00Z",
                }]
            )
        elif table_name == "teams":
            mock_t.select().eq().limit().execute.return_value = MagicMock(
                data=[{"id": TEAM_B_ID, "organization_id": MOCK_ORG_ID, "key": "OPS"}]
            )
        elif table_name == "workspace_members":
            mock_t.select().eq().eq().limit().execute.return_value = MagicMock(data=[{"id": "wm-1"}])
        elif table_name == "activity_logs":
            mock_t.insert().execute.return_value = MagicMock(data=[])
        return mock_t

    mock_db.table.side_effect = mock_table

    payload = {
        "target_state_id": TODO_STATE_ID,
        "assignee_id": MOCK_ASSIGNEE_ID,
        "priority": "high",
        "estimate": 5,
    }
    response = client.post(f"/api/v1/triage/{MOCK_ISSUE_ID}/accept", json=payload)
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert data["state_id"] == TODO_STATE_ID
    assert data["assignee_id"] == MOCK_ASSIGNEE_ID
    assert data["priority"] == "high"
    assert data["estimate"] == 5
    assert data["snoozed_until"] is None
    assert data["version"] == 2


def test_decline_triage_issue_rejection_flow(client, mock_db):
    """
    Test POST /api/v1/triage/{issue_id}/decline:
    - Moves issue to canceled workflow state
    - Sets canceled_at timestamp
    - Inserts 'triage_declined' activity log with recorded reason
    """
    def mock_table(table_name):
        mock_t = MagicMock()
        if table_name == "issues":
            mock_t.select().eq().limit().execute.return_value = MagicMock(
                data=[{
                    "id": MOCK_ISSUE_ID,
                    "team_id": TEAM_B_ID,
                    "organization_id": MOCK_ORG_ID,
                    "version": 1,
                    "state_id": TRIAGE_STATE_ID,
                }]
            )
            mock_t.update().eq().execute.return_value = MagicMock(data=[])
        elif table_name == "teams":
            mock_t.select().eq().limit().execute.return_value = MagicMock(
                data=[{"id": TEAM_B_ID, "organization_id": MOCK_ORG_ID, "key": "OPS"}]
            )
        elif table_name == "workspace_members":
            mock_t.select().eq().eq().limit().execute.return_value = MagicMock(data=[{"id": "wm-1"}])
        elif table_name == "workflow_states":
            mock_t.select().eq().eq().limit().execute.return_value = MagicMock(
                data=[{"id": CANCELED_STATE_ID, "category": "canceled"}]
            )
        elif table_name == "activity_logs":
            mock_t.insert().execute.return_value = MagicMock(data=[])
        return mock_t

    mock_db.table.side_effect = mock_table

    payload = {"reason": "Not feasible for OPS team in current roadmap"}
    response = client.post(f"/api/v1/triage/{MOCK_ISSUE_ID}/decline", json=payload)
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert data["status"] == "declined"
    assert data["issue_id"] == MOCK_ISSUE_ID
    assert data["reason"] == "Not feasible for OPS team in current roadmap"


# ==============================================================================
# 5. Authorization and Error Handling Tests
# ==============================================================================

def test_triage_access_denied_for_non_org_member(client, mock_db):
    """
    Users outside the workspace cannot access team's triage inbox or accept/snooze/decline issues.
    """
    def mock_table(table_name):
        mock_t = MagicMock()
        if table_name == "teams":
            mock_t.select().eq().limit().execute.return_value = MagicMock(
                data=[{"id": TEAM_B_ID, "organization_id": MOCK_ORG_ID, "key": "OPS"}]
            )
        elif table_name == "workspace_members":
            mock_t.select().eq().eq().limit().execute.return_value = MagicMock(data=[])
        return mock_t

    mock_db.table.side_effect = mock_table

    response = client.get(f"/api/v1/teams/{TEAM_B_ID}/triage")
    assert response.status_code == status.HTTP_403_FORBIDDEN


def test_triage_nonexistent_issue_returns_404(client, mock_db):
    """
    Triage operations on nonexistent issue return 404 Not Found.
    """
    def mock_table(table_name):
        mock_t = MagicMock()
        if table_name == "issues":
            mock_t.select().eq().limit().execute.return_value = MagicMock(data=[])
        return mock_t

    mock_db.table.side_effect = mock_table

    payload = {"snoozed_until": "2026-10-03T10:00:00Z"}
    response = client.post("/api/v1/triage/00000000-0000-0000-0000-000000000000/snooze", json=payload)
    assert response.status_code == status.HTTP_404_NOT_FOUND
