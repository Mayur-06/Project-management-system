import json
from unittest.mock import MagicMock
from fastapi import status
from tests.conftest import (
    MOCK_USER_ID,
    MOCK_ORG_ID,
    MOCK_TEAM_ID,
    MOCK_STATE_ID_1,
    MOCK_STATE_ID_2,
)

OTHER_USER_ID = "99999999-9999-9999-9999-999999999999"
OTHER_ORG_ID = "88888888-8888-8888-8888-888888888888"
MOCK_CYCLE_ID = "77777777-7777-7777-7777-777777777777"
MOCK_NEXT_CYCLE_ID = "77777777-7777-7777-7777-777777777778"
MOCK_PROJECT_ID = "55555555-5555-5555-5555-555555555555"
MOCK_MILESTONE_ID = "66666666-6666-6666-6666-666666666666"
MOCK_ISSUE_ID = "44444444-4444-4444-4444-444444444444"
MOCK_SUBTASK_ID = "33333333-3333-3333-3333-333333333333"
MOCK_COMMENT_ID = "22222222-2222-2222-2222-222222222222"
MOCK_ATTACHMENT_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"


# ==============================================================================
# Domain 1: Workspaces & Teams Scenarios
# ==============================================================================

def test_workspace_slug_collision_handled(client, mock_db):
    """Attempting to create an organization workspace with an already taken slug raises 409."""
    def mock_table(table_name):
        mock_t = MagicMock()
        if table_name == "organizations":
            # Existing slug match
            mock_t.select().eq().limit().execute.return_value = MagicMock(
                data=[{"id": "existing-org-id", "slug": "acme"}]
            )
        return mock_t

    mock_db.table.side_effect = mock_table
    res = client.post("/api/v1/workspaces", json={"name": "Acme Inc", "slug": "acme"})
    assert res.status_code == status.HTTP_409_CONFLICT


def test_team_key_collision_within_org_handled(client, mock_db):
    """Creating a team with an existing identifier key (e.g., 'ENG') in the same organization raises 409."""
    def mock_table(table_name):
        mock_t = MagicMock()
        if table_name == "organizations":
            mock_t.select().eq().limit().execute.return_value = MagicMock(
                data=[{"id": MOCK_ORG_ID, "slug": "acme"}]
            )
        elif table_name == "workspace_members":
            mock_t.select().eq().eq().limit().execute.return_value = MagicMock(data=[{"id": "m1", "role": "admin"}])
        elif table_name == "teams":
            # Team with key 'ENG' already exists
            mock_t.select().eq().eq().limit().execute.return_value = MagicMock(
                data=[{"id": "existing-team-id", "key": "ENG"}]
            )
        return mock_t

    mock_db.table.side_effect = mock_table
    res = client.post("/api/v1/workspaces/acme/teams", json={"name": "Engineering 2", "key": "ENG"})
    assert res.status_code == status.HTTP_409_CONFLICT


def test_non_admin_cannot_create_team(client, mock_db):
    """Standard non-admin members cannot provision new teams."""
    def mock_table(table_name):
        mock_t = MagicMock()
        if table_name == "organizations":
            mock_t.select().eq().limit().execute.return_value = MagicMock(
                data=[{"id": MOCK_ORG_ID, "slug": "acme"}]
            )
        elif table_name == "workspace_members":
            # Role is member, not admin
            mock_t.select().eq().eq().limit().execute.return_value = MagicMock(data=[{"id": "m1", "role": "member"}])
        return mock_t

    mock_db.table.side_effect = mock_table
    res = client.post("/api/v1/workspaces/acme/teams", json={"name": "Product", "key": "PROD"})
    assert res.status_code == status.HTTP_403_FORBIDDEN


# ==============================================================================
# Domain 2: Issues, Concurrency & Soft-Delete Scenarios
# ==============================================================================

def test_issue_not_found_raises_404(client, mock_db):
    """Requesting an issue that does not exist returns 404."""
    def mock_table(table_name):
        mock_t = MagicMock()
        if table_name == "issues":
            mock_t.select().eq().limit().execute.return_value = MagicMock(data=[])
        return mock_t

    mock_db.table.side_effect = mock_table
    res = client.get(f"/api/v1/issues/{MOCK_ISSUE_ID}")
    assert res.status_code == status.HTTP_404_NOT_FOUND


def test_issue_stale_update_race_condition_occ_diff(client, mock_db):
    """Simultaneous edit conflict returns 409 and latest server state snapshot."""
    def mock_table(table_name):
        mock_t = MagicMock()
        if table_name == "issues":
            mock_t.select().eq().limit().execute.return_value = MagicMock(
                data=[
                    {
                        "id": MOCK_ISSUE_ID,
                        "organization_id": MOCK_ORG_ID,
                        "team_id": MOCK_TEAM_ID,
                        "version": 5,
                        "title": "Updated by collaborator A",
                    }
                ]
            )
        elif table_name == "workspace_members":
            mock_t.select().eq().eq().limit().execute.return_value = MagicMock(data=[{"id": "m1"}])
        return mock_t

    mock_db.table.side_effect = mock_table
    payload = {"title": "Attempt from collaborator B", "expected_version": 4}
    res = client.patch(f"/api/v1/issues/{MOCK_ISSUE_ID}", json=payload)
    assert res.status_code == status.HTTP_409_CONFLICT
    body = res.json()
    assert body["detail"]["current_version"] == 5
    assert body["detail"]["current_state"]["title"] == "Updated by collaborator A"


# ==============================================================================
# Domain 3: Comments & Permission Scenarios
# ==============================================================================


def test_admin_can_delete_others_comment(client, mock_db):
    """Organization admins possess privileges to delete comments written by other users."""
    def mock_table(table_name):
        mock_t = MagicMock()
        if table_name == "issue_comments":
            mock_t.select().eq().is_().limit().execute.return_value = MagicMock(
                data=[{"id": MOCK_COMMENT_ID, "user_id": OTHER_USER_ID, "issue_id": MOCK_ISSUE_ID}]
            )
            mock_t.update().eq().execute.return_value = MagicMock(data=[])
        elif table_name == "issues":
            mock_t.select().eq().limit().execute.return_value = MagicMock(
                data=[{"id": MOCK_ISSUE_ID, "organization_id": MOCK_ORG_ID}]
            )
        elif table_name == "workspace_members":
            # Current user is Admin
            mock_t.select().eq().eq().limit().execute.return_value = MagicMock(data=[{"role": "admin"}])
        return mock_t

    mock_db.table.side_effect = mock_table
    res = client.delete(f"/api/v1/comments/{MOCK_COMMENT_ID}")
    assert res.status_code == status.HTTP_204_NO_CONTENT


# ==============================================================================
# Domain 7: Attachments Validation Scenarios
# ==============================================================================

def test_attachment_upload_size_limit_exceeded_rejected(client):
    """Files exceeding maximum threshold (50MB) are rejected with HTTP 422 Unprocessable Entity."""
    payload = {
        "issue_id": MOCK_ISSUE_ID,
        "file_name": "giant_log.zip",
        "file_size": 60000000,  # 60MB > 50MB limit
        "mime_type": "application/zip",
    }
    res = client.post("/api/v1/attachments/upload-url", json=payload)
    assert res.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY


def test_attachment_upload_zero_byte_file_rejected(client):
    """Empty 0-byte uploads are rejected with 422 Unprocessable Entity."""
    payload = {
        "issue_id": MOCK_ISSUE_ID,
        "file_name": "empty.txt",
        "file_size": 0,
        "mime_type": "text/plain",
    }
    res = client.post("/api/v1/attachments/upload-url", json=payload)
    assert res.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
