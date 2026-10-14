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
# Pillar 1: Embedding Vector Tests
# ==============================================================================

def test_embedding_vector_dimensions_and_normalization():
    """Verify get_embedding produces 768-dim normalized unit vector."""
    from app.core.ai_client import get_embedding

    vec = get_embedding("Authentication login failure with Google OAuth")
    assert len(vec) == 768
    # Calculate vector norm
    norm = sum(x * x for x in vec) ** 0.5
    assert abs(norm - 1.0) < 1e-4


# ==============================================================================
# Pillar 2: Workload-Aware Triage & Classification Agent Tests
# ==============================================================================

@pytest.mark.skip(reason="Triage inbox feature retired in favor of org-wide activity notification feed")
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


def test_react_assistant_create_issue_interrupt_and_confirm(client, mock_db, monkeypatch):
    """Verify Linear Ask drafts an issue with interrupt_required and confirms creation."""
    scoped_client_mock = MagicMock()
    # Mock teams
    scoped_client_mock.table.return_value.select.return_value.eq.return_value.execute.return_value = MagicMock(
        data=[{"id": MOCK_TEAM_ID, "key": "ENG", "name": "Engineering", "issue_counter": 12, "organization_id": MOCK_ORG_ID}]
    )
    # Mock workflow states
    scoped_client_mock.table.return_value.select.return_value.eq.return_value.order.return_value.execute.return_value = MagicMock(
        data=[{"id": MOCK_STATE_ID_1, "name": "Todo", "is_default": True, "position": 1}]
    )
    # Mock insert
    NEW_ISSUE_ID = "99999999-aaaa-bbbb-cccc-dddddddddddd"
    scoped_client_mock.table.return_value.insert.return_value.execute.return_value = MagicMock(
        data=[{"id": NEW_ISSUE_ID, "identifier": "ENG-13", "title": "Memory leak in websocket listener", "state_id": MOCK_STATE_ID_1}]
    )

    import app.agents.tools.workspace_tools as wt
    monkeypatch.setattr(wt, "get_user_scoped_client", lambda jwt: scoped_client_mock)

    # 1. Ask assistant to create an issue
    chat_payload = {
        "organization_id": MOCK_ORG_ID,
        "messages": [{"role": "user", "content": "Create an urgent bug titled Memory leak in websocket listener in team ENG"}],
    }
    stream_res = client.post("/api/v1/ai/chat/stream", json=chat_payload)
    assert stream_res.status_code == status.HTTP_200_OK
    stream_body = stream_res.text
    assert "event: interrupt_required" in stream_body
    assert "create_issue" in stream_body

    # 2. Confirm action
    confirm_payload = {
        "action": "create_issue",
        "team_id": MOCK_TEAM_ID,
        "title": "Memory leak in websocket listener",
        "priority": "urgent",
        "target_state_id": MOCK_STATE_ID_1,
    }
    confirm_res = client.post("/api/v1/ai/chat/action/confirm", json=confirm_payload)
    assert confirm_res.status_code == status.HTTP_200_OK
    confirm_data = confirm_res.json()
    assert confirm_data["status"] == "success"
    assert confirm_data["action"] == "create_issue"
    assert confirm_data["issue_id"] == NEW_ISSUE_ID
    assert confirm_data["issue_identifier"] == "ENG-13"

