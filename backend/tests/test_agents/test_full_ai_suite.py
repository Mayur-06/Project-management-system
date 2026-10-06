import json
import pytest
from unittest.mock import MagicMock, AsyncMock
from fastapi import status

from tests.conftest import (
    MOCK_USER_ID,
    MOCK_ORG_ID,
    MOCK_TEAM_ID,
    MOCK_STATE_ID_1,
    MOCK_STATE_ID_2,
)

MOCK_ISSUE_ID = "11111111-2222-3333-4444-555555555555"


# ==============================================================================
# Pillar 1: Lightweight Duplicate Detection Tests
# ==============================================================================

def test_embedding_vector_dimensions_and_normalization():
    """Verify get_embedding produces 768-dim normalized unit vector."""
    from app.core.ai_client import get_embedding

    vec = get_embedding("Authentication login failure with Google OAuth")
    assert len(vec) == 768
    # Calculate vector norm
    norm = sum(x * x for x in vec) ** 0.5
    assert abs(norm - 1.0) < 1e-4


def test_duplicate_detection_high_similarity(client, mock_db):
    """Verify duplicate detection finds similar issues with cosine distance."""
    def mock_table(table_name):
        mock_t = MagicMock()
        if table_name == "workspace_members":
            mock_t.select().eq().eq().limit().execute.return_value = MagicMock(data=[{"id": "m1"}])
        elif table_name == "issues":
            mock_t.select().in_().execute.return_value = MagicMock(
                data=[
                    {
                        "id": MOCK_ISSUE_ID,
                        "identifier": "ENG-42",
                        "title": "OAuth Google Login Crash on Redirect",
                        "state_id": MOCK_STATE_ID_1,
                    }
                ]
            )
        return mock_t

    mock_db.table.side_effect = mock_table
    mock_db.rpc().execute.return_value = MagicMock(
        data=[{"issue_id": MOCK_ISSUE_ID, "similarity": 0.94}]
    )

    payload = {
        "organization_id": MOCK_ORG_ID,
        "title": "OAuth Google Login Crash on Redirect",
        "threshold": 0.75,
        "limit": 5,
    }
    res = client.post("/api/v1/ai/duplicates/check", json=payload)
    assert res.status_code == status.HTTP_200_OK
    data = res.json()
    assert data["duplicates_found"] is True
    assert data["count"] == 1
    assert data["matches"][0]["identifier"] == "ENG-42"
    assert data["matches"][0]["similarity"] == 0.94


def test_duplicate_detection_fallback_text_search(client, mock_db):
    """Verify text fallback triggers when vector search returns 0 matches."""
    def mock_table(table_name):
        mock_t = MagicMock()
        if table_name == "workspace_members":
            mock_t.select().eq().eq().limit().execute.return_value = MagicMock(data=[{"id": "m1"}])
        elif table_name == "issues":
            mock_t.select().in_().execute.return_value = MagicMock(data=[])
            mock_t.select().eq().is_().ilike().limit().execute.return_value = MagicMock(
                data=[
                    {
                        "id": MOCK_ISSUE_ID,
                        "identifier": "ENG-10",
                        "title": "WebSocket disconnects unexpectedly",
                        "state_id": MOCK_STATE_ID_1,
                    }
                ]
            )
        return mock_t

    mock_db.table.side_effect = mock_table
    # Vector RPC returns empty
    mock_db.rpc().execute.return_value = MagicMock(data=[])

    payload = {
        "organization_id": MOCK_ORG_ID,
        "title": "WebSocket disconnects on client resume",
        "threshold": 0.8,
    }
    res = client.post("/api/v1/ai/duplicates/check", json=payload)
    assert res.status_code == status.HTTP_200_OK
    data = res.json()
    assert data["duplicates_found"] is True
    assert data["matches"][0]["identifier"] == "ENG-10"


# ==============================================================================
# Pillar 2: Workload-Aware Triage & Classification Agent Tests
# ==============================================================================

@pytest.mark.parametrize(
    "title,expected_priority,expected_estimate,expected_label",
    [
        ("Severe production database crash and outage", "urgent", 5, "critical"),
        ("Worker node high latency and memory leak", "high", 3, "performance"),
        ("Implement OAuth Google Single Sign-on integration", "medium", 5, "feature"),
        ("Update README markdown and fix typos in docs", "low", 2, "chore"),
    ],
)
def test_triage_classification_categories(client, mock_db, title, expected_priority, expected_estimate, expected_label):
    """Verify intelligent priority, sizing and label recommendations across domains."""
    def mock_table(table_name):
        mock_t = MagicMock()
        if table_name == "teams":
            mock_t.select().eq().limit().execute.return_value = MagicMock(
                data=[{"id": MOCK_TEAM_ID, "key": "ENG", "organization_id": MOCK_ORG_ID}]
            )
        elif table_name == "team_members":
            mock_t.select().eq().execute.return_value = MagicMock(
                data=[{"user_id": "usr-alice"}, {"user_id": "usr-bob"}]
            )
        elif table_name == "issues":
            # Alice is busy with 3 tickets, Bob has 0
            mock_t.select().eq().in_().is_().execute.return_value = MagicMock(
                data=[
                    {"assignee_id": "usr-alice", "workflow_states": {"category": "started"}},
                    {"assignee_id": "usr-alice", "workflow_states": {"category": "unstarted"}},
                    {"assignee_id": "usr-alice", "workflow_states": {"category": "started"}},
                ]
            )
        return mock_t

    mock_db.table.side_effect = mock_table

    payload = {
        "organization_id": MOCK_ORG_ID,
        "team_id": MOCK_TEAM_ID,
        "title": title,
        "description": "Automated triage classification test context.",
    }
    res = client.post("/api/v1/ai/triage/classify", json=payload)
    assert res.status_code == status.HTTP_200_OK
    data = res.json()
    assert data["suggested_priority"] == expected_priority
    assert data["suggested_estimate"] == expected_estimate
    assert expected_label in data["suggested_labels"]
    # Bob has the least workload, should be selected
    assert data["suggested_assignee_id"] == "usr-bob"
    assert len(data["reasoning"]) > 0


# ==============================================================================
# Pillar 3: Technical Breakdown & Spec Writer Agent Tests
# ==============================================================================

def test_breakdown_full_lifecycle_and_interrupt(client, mock_db):
    """Test technical breakdown start (Node 1 -> Node 2 interrupt) and resume (Node 3 persistence)."""
    def mock_table(table_name):
        mock_t = MagicMock()
        if table_name == "issues":
            mock_t.select().eq().limit().execute.return_value = MagicMock(
                data=[
                    {
                        "id": MOCK_ISSUE_ID,
                        "organization_id": MOCK_ORG_ID,
                        "team_id": MOCK_TEAM_ID,
                        "title": "Migrate Database to Multi-Region Cluster",
                        "state_id": MOCK_STATE_ID_1,
                    }
                ]
            )
            mock_t.select().eq().is_().execute.return_value = MagicMock(data=[])
            mock_t.insert().execute.return_value = MagicMock(
                data=[{"id": "subtask-101"}, {"id": "subtask-102"}]
            )
        elif table_name == "teams":
            mock_t.select().eq().limit().execute.return_value = MagicMock(
                data=[{"key": "ENG", "issue_counter": 80}]
            )
            mock_t.update().eq().execute.return_value = MagicMock(data=[])
        return mock_t

    mock_db.table.side_effect = mock_table

    # 1. Start Breakdown
    start_res = client.post("/api/v1/ai/breakdown/start", json={"issue_id": MOCK_ISSUE_ID})
    assert start_res.status_code == status.HTTP_200_OK
    start_data = start_res.json()
    assert start_data["status"] == "interrupted"
    assert "prdspec" in start_data
    assert len(start_data["proposed_subtasks"]) >= 3
    thread_id = start_data["thread_id"]

    # 2. Resume with user-modified subtasks
    resume_payload = {
        "thread_id": thread_id,
        "approved_subtasks": [
            {
                "title": "Provision standby replica node in eu-west-1",
                "description": "Configure replication slots and SSL certificates.",
                "estimate": 3,
                "priority": "high",
            },
            {
                "title": "Verify read-traffic failover switchover",
                "description": "Run healthcheck simulated outage scripts.",
                "estimate": 2,
                "priority": "medium",
            },
        ],
    }
    resume_res = client.post("/api/v1/ai/breakdown/resume", json=resume_payload)
    assert resume_res.status_code == status.HTTP_200_OK
    resume_data = resume_res.json()
    assert resume_data["status"] == "completed"
    assert resume_data["created_subtasks_count"] == 2


def test_breakdown_thread_security_cross_user_rejection(client, mock_db):
    """Verify Problem Set 8: Attempting to resume with another user's thread ID is rejected."""
    # Construct thread ID belonging to a different user
    foreign_thread = f"{MOCK_ORG_ID}:different-user-uuid:conversation-uuid"
    payload = {
        "thread_id": foreign_thread,
        "approved_subtasks": [{"title": "Unauthorized task"}],
    }
    res = client.post("/api/v1/ai/breakdown/resume", json=payload)
    assert res.status_code in (status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND)


# ==============================================================================
# Pillar 4: Linear Ask ReAct Assistant Tests
# ==============================================================================

def test_react_assistant_search_issues_sse_stream(client, mock_db, monkeypatch):
    """Verify Linear Ask searches workspace issues and emits valid SSE stream."""
    scoped_client_mock = MagicMock()
    scoped_client_mock.table.return_value.select.return_value.eq.return_value.is_.return_value.ilike.return_value.limit.return_value.execute.return_value = MagicMock(
        data=[
            {
                "id": MOCK_ISSUE_ID,
                "identifier": "ENG-88",
                "title": "Fix GraphQL query timeout in analytics",
                "priority": "high",
                "state_id": MOCK_STATE_ID_1,
            }
        ]
    )

    import app.agents.tools.workspace_tools as wt
    monkeypatch.setattr(wt, "get_user_scoped_client", lambda jwt: scoped_client_mock)

    payload = {
        "organization_id": MOCK_ORG_ID,
        "messages": [{"role": "user", "content": "Find any GraphQL analytics tickets"}],
    }
    res = client.post("/api/v1/ai/chat/stream", json=payload)
    assert res.status_code == status.HTTP_200_OK
    assert "text/event-stream" in res.headers["content-type"]
    body = res.text
    assert "event: session" in body
    assert "event: tool_start" in body
    assert "event: tool_complete" in body
    assert "event: token" in body
    assert "event: done" in body


def test_react_assistant_mutating_action_interrupt_and_confirm(client, mock_db, monkeypatch):
    """Verify Problem Set 7: Assistant halts on mutating action and executes upon confirmation."""
    scoped_client_mock = MagicMock()
    # Mock issue lookup
    scoped_client_mock.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(
        data=[{"id": MOCK_ISSUE_ID, "identifier": "ENG-42", "title": "OAuth Fix", "team_id": MOCK_TEAM_ID, "state_id": MOCK_STATE_ID_1}]
    )
    # Mock workflow states lookup
    scoped_client_mock.table.return_value.select.return_value.eq.return_value.execute.return_value = MagicMock(
        data=[{"id": MOCK_STATE_ID_2, "name": "Completed", "category": "completed"}]
    )
    # Mock update
    scoped_client_mock.table.return_value.update.return_value.eq.return_value.execute.return_value = MagicMock(
        data=[{"id": MOCK_ISSUE_ID, "state_id": MOCK_STATE_ID_2}]
    )

    import app.agents.tools.workspace_tools as wt
    monkeypatch.setattr(wt, "get_user_scoped_client", lambda jwt: scoped_client_mock)

    # 1. Ask assistant to move issue to completed
    chat_payload = {
        "organization_id": MOCK_ORG_ID,
        "messages": [{"role": "user", "content": "Move ENG-42 to completed"}],
    }
    stream_res = client.post("/api/v1/ai/chat/stream", json=chat_payload)
    assert stream_res.status_code == status.HTTP_200_OK
    stream_body = stream_res.text
    assert "event: interrupt_required" in stream_body
    assert "update_issue_status" in stream_body

    # 2. Confirm action
    confirm_payload = {
        "action": "update_issue_status",
        "issue_id": MOCK_ISSUE_ID,
        "target_state_id": MOCK_STATE_ID_2,
    }
    confirm_res = client.post("/api/v1/ai/chat/action/confirm", json=confirm_payload)
    assert confirm_res.status_code == status.HTTP_200_OK
    confirm_data = confirm_res.json()
    assert confirm_data["status"] == "success"
    assert confirm_data["action"] == "update_issue_status"
    assert confirm_data["issue_id"] == MOCK_ISSUE_ID


def test_react_assistant_general_engineering_copilot_stream(client, mock_db):
    """Verify Linear Ask functions as an elite engineering copilot without forcing issue search."""
    chat_payload = {
        "organization_id": MOCK_ORG_ID,
        "messages": [{"role": "user", "content": "How should we design our distributed caching strategy?"}],
    }
    stream_res = client.post("/api/v1/ai/chat/stream", json=chat_payload)
    assert stream_res.status_code == status.HTTP_200_OK
    body = stream_res.text
    # Must NOT run search_issues tool
    assert "search_issues" not in body
    # Must emit session, token and done
    assert "event: session" in body
    assert "event: token" in body
    assert "event: done" in body
    # Must NOT contain annoying default "inspected your workspace issues"
    assert "inspected your workspace issues" not in body

