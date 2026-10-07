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

def test_check_duplicates_found(client, mock_db):
    def mock_table(table_name):
        mock_t = MagicMock()
        if table_name == "workspace_members":
            mock_t.select().eq().eq().limit().execute.return_value = MagicMock(data=[{"id": "m1"}])
        elif table_name == "issues":
            mock_t.select().in_().execute.return_value = MagicMock(
                data=[
                    {
                        "id": MOCK_ISSUE_ID,
                        "identifier": "ENG-101",
                        "title": "OAuth Google Login Crash on Redirect",
                        "state_id": MOCK_STATE_ID_1,
                    }
                ]
            )
        return mock_t

    mock_db.table.side_effect = mock_table
    mock_db.rpc().execute.return_value = MagicMock(
        data=[{"issue_id": MOCK_ISSUE_ID, "similarity": 0.92}]
    )

    payload = {
        "organization_id": MOCK_ORG_ID,
        "title": "OAuth Google Login Crash on Redirect",
        "threshold": 0.8,
    }
    response = client.post("/api/v1/ai/duplicates/check", json=payload)
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert data["duplicates_found"] is True
    assert data["count"] == 1
    assert data["matches"][0]["identifier"] == "ENG-101"
    assert data["matches"][0]["similarity"] == 0.92


# ==============================================================================
# 3. AI Triage & Classification Tests
# ==============================================================================

def test_triage_classification(client, mock_db):
    def mock_table(table_name):
        mock_t = MagicMock()
        if table_name == "teams":
            mock_t.select().eq().limit().execute.return_value = MagicMock(
                data=[{"id": MOCK_TEAM_ID, "organization_id": MOCK_ORG_ID}]
            )
        elif table_name == "team_members":
            mock_t.select().eq().execute.return_value = MagicMock(
                data=[{"user_id": MOCK_USER_ID}]
            )
        return mock_t

    mock_db.table.side_effect = mock_table

    payload = {
        "organization_id": MOCK_ORG_ID,
        "team_id": MOCK_TEAM_ID,
        "title": "Critical server crash on payment checkout",
        "description": "Users are encountering 500 error on stripe webhook",
    }
    response = client.post("/api/v1/ai/triage/classify", json=payload)
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert data["suggested_priority"] == "urgent"
    assert data["suggested_estimate"] == 5
    assert "critical" in data["suggested_labels"]
    assert data["suggested_assignee_id"] == MOCK_USER_ID
    assert "reasoning" in data
    assert data["suggested_team_key"] == "ENG"


def test_triage_classification_omitted_team_and_org(client, mock_db):
    """Test triage classification works even when client omits team_id and organization_id."""
    def mock_table(table_name):
        mock_t = MagicMock()
        if table_name == "team_members":
            mock_t.select().eq().limit().execute.return_value = MagicMock(
                data=[{"team_id": MOCK_TEAM_ID}]
            )
            mock_t.select().eq().execute.return_value = MagicMock(
                data=[{"user_id": MOCK_USER_ID}]
            )
        elif table_name == "teams":
            mock_t.select().eq().limit().execute.return_value = MagicMock(
                data=[{"id": MOCK_TEAM_ID, "key": "ENG", "organization_id": MOCK_ORG_ID}]
            )
        return mock_t

    mock_db.table.side_effect = mock_table

    payload = {
        "title": "High memory leak on worker processes",
        "description": "Node process crashes every 30 minutes due to memory",
    }
    response = client.post("/api/v1/ai/triage/classify", json=payload)
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert data["suggested_priority"] == "urgent"
    assert data["suggested_estimate"] == 5
    assert data["suggested_team_key"] == "ENG"
    assert "reasoning" in data


# ==============================================================================
# 4. AI Technical Breakdown (HITL Interruption) Tests
# ==============================================================================

def test_breakdown_start_and_resume_flow(client, mock_db):
    def mock_table(table_name):
        mock_t = MagicMock()
        if table_name == "issues":
            mock_t.select().eq().limit().execute.return_value = MagicMock(
                data=[
                    {
                        "id": MOCK_ISSUE_ID,
                        "organization_id": MOCK_ORG_ID,
                        "team_id": MOCK_TEAM_ID,
                        "title": "Build Multi-Tenant Billing System",
                        "state_id": MOCK_STATE_ID_1,
                    }
                ]
            )
            mock_t.insert().execute.return_value = MagicMock(
                data=[{"id": "subtask-child-1"}]
            )
        elif table_name == "teams":
            mock_t.select().eq().limit().execute.return_value = MagicMock(
                data=[{"key": "ENG", "issue_counter": 50}]
            )
            mock_t.update().eq().execute.return_value = MagicMock(data=[])
        return mock_t

    mock_db.table.side_effect = mock_table

    # 1. Start breakdown (Node 1 -> Node 2 interrupt)
    start_payload = {"issue_id": MOCK_ISSUE_ID}
    res_start = client.post("/api/v1/ai/breakdown/start", json=start_payload)
    assert res_start.status_code == status.HTTP_200_OK
    data_start = res_start.json()
    assert data_start["status"] == "interrupted"
    assert len(data_start["proposed_subtasks"]) == 3
    thread_id = data_start["thread_id"]

    # 2. Resume breakdown with approved subtasks (Node 3 persistence)
    resume_payload = {
        "thread_id": thread_id,
        "approved_subtasks": [
            {
                "title": "Set up Stripe Webhooks",
                "description": "Handle customer.subscription.created",
                "estimate": 3,
                "priority": "high",
            }
        ],
    }
    res_resume = client.post("/api/v1/ai/breakdown/resume", json=resume_payload)
    assert res_resume.status_code == status.HTTP_200_OK
    data_resume = res_resume.json()
    assert data_resume["status"] == "completed"
    assert data_resume["created_subtasks_count"] == 1


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
