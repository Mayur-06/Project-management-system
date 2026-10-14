from unittest.mock import MagicMock
from fastapi import status
from tests.conftest import (
    MOCK_USER_ID,
    MOCK_ORG_ID,
    MOCK_TEAM_ID,
    MOCK_STATE_ID_1,
)

MOCK_ISSUE_ID = "44444444-4444-4444-4444-444444444444"
MOCK_ATTACHMENT_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"


# ==============================================================================
# 1. Attachments Endpoints Tests
# ==============================================================================

def test_generate_attachment_upload_url(client, mock_db):
    def mock_table(table_name):
        mock_t = MagicMock()
        if table_name == "issues":
            mock_t.select().eq().limit().execute.return_value = MagicMock(
                data=[{"id": MOCK_ISSUE_ID, "organization_id": MOCK_ORG_ID}]
            )
        elif table_name == "workspace_members":
            mock_t.select().eq().eq().limit().execute.return_value = MagicMock(data=[{"id": "m1"}])
        elif table_name == "issue_attachments":
            mock_t.insert().execute.return_value = MagicMock(data=[])
        return mock_t

    mock_db.table.side_effect = mock_table

    payload = {
        "issue_id": MOCK_ISSUE_ID,
        "file_name": "screenshot_debug.png",
        "file_size": 1048576,
        "mime_type": "image/png",
    }
    response = client.post("/api/v1/attachments/upload-url", json=payload)
    assert response.status_code == status.HTTP_201_CREATED
    data = response.json()
    assert "upload_url" in data
    assert "storage_path" in data
    assert data["file_name"] == "screenshot_debug.png"


def test_delete_attachment(client, mock_db):
    def mock_table(table_name):
        mock_t = MagicMock()
        if table_name == "issue_attachments":
            mock_t.select().eq().limit().execute.return_value = MagicMock(
                data=[{"id": MOCK_ATTACHMENT_ID, "user_id": MOCK_USER_ID, "issue_id": MOCK_ISSUE_ID}]
            )
            mock_t.delete().eq().execute.return_value = MagicMock(data=[])
        return mock_t

    mock_db.table.side_effect = mock_table

    response = client.delete(f"/api/v1/attachments/{MOCK_ATTACHMENT_ID}")
    assert response.status_code == status.HTTP_204_NO_CONTENT


# ==============================================================================
# 2. AI Duplicate Detection Tests
# ==============================================================================




# ==============================================================================
# 5. AI Chat ReAct Assistant (SSE Stream) Tests
# ==============================================================================

def test_chat_sse_stream(client):
    payload = {
        "organization_id": MOCK_ORG_ID,
        "messages": [{"role": "user", "content": "What is the status of active issues?"}],
    }
    response = client.post("/api/v1/ai/chat/stream", json=payload)
    assert response.status_code == status.HTTP_200_OK
    assert "text/event-stream" in response.headers["content-type"]
    body = response.text
    assert "event: session" in body
    assert "event: tool_start" in body
    assert "event: token" in body
    assert "event: done" in body


def test_confirm_chat_action_update_status(client, mock_db, monkeypatch):
    scoped_client_mock = MagicMock()
    scoped_client_mock.table.return_value.update.return_value.eq.return_value.execute.return_value = MagicMock(
        data=[{"id": MOCK_ISSUE_ID, "state_id": MOCK_STATE_ID_1}]
    )

    import app.agents.tools.workspace_tools as wt
    monkeypatch.setattr(wt, "get_user_scoped_client", lambda jwt: scoped_client_mock)

    payload = {
        "action": "update_issue_status",
        "issue_id": MOCK_ISSUE_ID,
        "target_state_id": MOCK_STATE_ID_1,
    }
    response = client.post("/api/v1/ai/chat/action/confirm", json=payload)
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert data["status"] == "success"
    assert data["action"] == "update_issue_status"
    assert data["issue_id"] == MOCK_ISSUE_ID


def test_confirm_chat_action_assign(client, mock_db, monkeypatch):
    scoped_client_mock = MagicMock()
    scoped_client_mock.table.return_value.update.return_value.eq.return_value.execute.return_value = MagicMock(
        data=[{"id": MOCK_ISSUE_ID, "assignee_id": MOCK_USER_ID}]
    )

    import app.agents.tools.workspace_tools as wt
    monkeypatch.setattr(wt, "get_user_scoped_client", lambda jwt: scoped_client_mock)

    payload = {
        "action": "assign_issue",
        "issue_id": MOCK_ISSUE_ID,
        "target_assignee_id": MOCK_USER_ID,
    }
    response = client.post("/api/v1/ai/chat/action/confirm", json=payload)
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert data["status"] == "success"
    assert data["action"] == "assign_issue"
