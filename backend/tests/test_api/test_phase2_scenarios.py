from unittest.mock import MagicMock
from fastapi import status
from tests.conftest import (
    MOCK_USER_ID,
    MOCK_ORG_ID,
    MOCK_TEAM_ID,
    MOCK_STATE_ID_1,
    MOCK_STATE_ID_2,
)

MOCK_ISSUE_ID = "44444444-4444-4444-4444-444444444444"
MOCK_COMMENT_ID = "66666666-6666-6666-6666-666666666666"
OTHER_USER_ID = "99999999-9999-9999-9999-999999999999"


# ==============================================================================
# 1. Edge Case: LexoRank Reordering Variations (Prepend, Append, Intermediate)
# ==============================================================================

def test_reorder_issue_prepend_to_top(client, mock_db):
    """Moving an issue to the very top (no previous item, only next item)."""
    def mock_table(table_name):
        mock_t = MagicMock()
        if table_name == "issues":
            mock_t.select().eq().limit().execute.return_value = MagicMock(
                data=[
                    {
                        "id": MOCK_ISSUE_ID,
                        "organization_id": MOCK_ORG_ID,
                        "team_id": MOCK_TEAM_ID,
                        "state_id": MOCK_STATE_ID_1,
                        "sort_order": "0|h00000:",
                        "version": 1,
                    }
                ]
            )
            mock_t.update().eq().execute.return_value = MagicMock(
                data=[
                    {
                        "id": MOCK_ISSUE_ID,
                        "organization_id": MOCK_ORG_ID,
                        "team_id": MOCK_TEAM_ID,
                        "number": 101,
                        "identifier": "ENG-101",
                        "title": "Fix OAuth bug",
                        "priority": "high",
                        "state_id": MOCK_STATE_ID_1,
                        "creator_id": MOCK_USER_ID,
                        "sort_order": "0|800000:",
                        "version": 2,
                        "created_at": "2026-09-30T10:00:00Z",
                        "updated_at": "2026-09-30T10:05:00Z",
                    }
                ]
            )
        elif table_name == "workspace_members":
            mock_t.select().eq().eq().limit().execute.return_value = MagicMock(data=[{"id": "m1"}])
        return mock_t

    mock_db.table.side_effect = mock_table

    # Move to the top before "0|h00000:"
    payload = {
        "prev_position": None,
        "next_position": "0|h00000:",
    }
    response = client.put(f"/api/v1/issues/{MOCK_ISSUE_ID}/reorder", json=payload)
    assert response.status_code == status.HTTP_200_OK
    assert response.json()["version"] == 2


def test_reorder_issue_append_to_bottom(client, mock_db):
    """Moving an issue to the very bottom (only previous item, no next item)."""
    def mock_table(table_name):
        mock_t = MagicMock()
        if table_name == "issues":
            mock_t.select().eq().limit().execute.return_value = MagicMock(
                data=[
                    {
                        "id": MOCK_ISSUE_ID,
                        "organization_id": MOCK_ORG_ID,
                        "team_id": MOCK_TEAM_ID,
                        "state_id": MOCK_STATE_ID_1,
                        "sort_order": "0|h00000:",
                        "version": 1,
                    }
                ]
            )
            mock_t.update().eq().execute.return_value = MagicMock(
                data=[
                    {
                        "id": MOCK_ISSUE_ID,
                        "organization_id": MOCK_ORG_ID,
                        "team_id": MOCK_TEAM_ID,
                        "number": 101,
                        "identifier": "ENG-101",
                        "title": "Fix OAuth bug",
                        "priority": "high",
                        "state_id": MOCK_STATE_ID_1,
                        "creator_id": MOCK_USER_ID,
                        "sort_order": "0|v00000:",
                        "version": 2,
                        "created_at": "2026-09-30T10:00:00Z",
                        "updated_at": "2026-09-30T10:05:00Z",
                    }
                ]
            )
        elif table_name == "workspace_members":
            mock_t.select().eq().eq().limit().execute.return_value = MagicMock(data=[{"id": "m1"}])
        return mock_t

    mock_db.table.side_effect = mock_table

    payload = {
        "prev_position": "0|h00000:",
        "next_position": None,
    }
    response = client.put(f"/api/v1/issues/{MOCK_ISSUE_ID}/reorder", json=payload)
    assert response.status_code == status.HTTP_200_OK
    assert response.json()["version"] == 2


# ==============================================================================
# 2. Key-Identifier Resolution (e.g., GET /issues/ENG-101)
# ==============================================================================

def test_get_issue_by_human_readable_identifier(client, mock_db):
    """Look up an issue by human-readable formatted key like 'ENG-101' instead of UUID."""
    def mock_table(table_name):
        mock_t = MagicMock()
        if table_name == "issues":
            mock_t.select().eq().limit().execute.return_value = MagicMock(
                data=[
                    {
                        "id": MOCK_ISSUE_ID,
                        "organization_id": MOCK_ORG_ID,
                        "team_id": MOCK_TEAM_ID,
                        "number": 101,
                        "identifier": "ENG-101",
                        "title": "Fix login crash",
                        "priority": "urgent",
                        "state_id": MOCK_STATE_ID_1,
                        "creator_id": MOCK_USER_ID,
                        "sort_order": "0|h00000:",
                        "version": 1,
                        "created_at": "2026-09-30T10:00:00Z",
                        "updated_at": "2026-09-30T10:00:00Z",
                    }
                ]
            )
            mock_t.select().eq().is_().order().execute.return_value = MagicMock(data=[])
        elif table_name == "workspace_members":
            mock_t.select().eq().eq().limit().execute.return_value = MagicMock(data=[{"id": "m1"}])
        elif table_name == "issue_labels":
            mock_t.select().eq().execute.return_value = MagicMock(data=[])
        return mock_t

    mock_db.table.side_effect = mock_table

    response = client.get("/api/v1/issues/ENG-101")
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert data["identifier"] == "ENG-101"
    assert data["priority"] == "urgent"


# ==============================================================================
# 3. Multi-Tenant Cross-Org Security / Access Denied
# ==============================================================================

def test_access_denied_issue_from_other_tenant(client, mock_db):
    """User attempts to access an issue belonging to an organization they do not belong to."""
    def mock_table(table_name):
        mock_t = MagicMock()
        if table_name == "issues":
            mock_t.select().eq().limit().execute.return_value = MagicMock(
                data=[
                    {
                        "id": MOCK_ISSUE_ID,
                        "organization_id": "other-org-9999",
                        "team_id": MOCK_TEAM_ID,
                        "identifier": "ENG-101",
                    }
                ]
            )
        elif table_name == "workspace_members":
            # Current user is not in 'other-org-9999'
            mock_t.select().eq().eq().limit().execute.return_value = MagicMock(data=[])
        return mock_t

    mock_db.table.side_effect = mock_table

    response = client.get(f"/api/v1/issues/{MOCK_ISSUE_ID}")
    assert response.status_code == status.HTTP_403_FORBIDDEN


def test_create_issue_non_member_forbidden(client, mock_db):
    """User cannot create an issue in a team where they have no workspace membership."""
    def mock_table(table_name):
        mock_t = MagicMock()
        if table_name == "teams":
            mock_t.select().eq().limit().execute.return_value = MagicMock(
                data=[{"id": MOCK_TEAM_ID, "organization_id": MOCK_ORG_ID, "key": "ENG"}]
            )
        elif table_name == "workspace_members":
            mock_t.select().eq().eq().limit().execute.return_value = MagicMock(data=[])
        return mock_t

    mock_db.table.side_effect = mock_table

    payload = {"team_id": MOCK_TEAM_ID, "title": "Unauthorized task"}
    response = client.post("/api/v1/issues", json=payload)
    assert response.status_code == status.HTTP_403_FORBIDDEN


# ==============================================================================
# 4. Soft-Delete & Activity Log Check
# ==============================================================================

def test_delete_issue_sets_deleted_at_and_logs(client, mock_db):
    """Deleting an issue sets deleted_at and logs an activity audit record."""
    def mock_table(table_name):
        mock_t = MagicMock()
        if table_name == "issues":
            mock_t.select().eq().limit().execute.return_value = MagicMock(
                data=[
                    {
                        "id": MOCK_ISSUE_ID,
                        "organization_id": MOCK_ORG_ID,
                        "team_id": MOCK_TEAM_ID,
                        "identifier": "ENG-101",
                    }
                ]
            )
            mock_t.update().eq().execute.return_value = MagicMock(data=[])
        elif table_name == "workspace_members":
            mock_t.select().eq().eq().limit().execute.return_value = MagicMock(data=[{"id": "m1"}])
        elif table_name == "activity_logs":
            mock_t.insert().execute.return_value = MagicMock(data=[])
        return mock_t

    mock_db.table.side_effect = mock_table

    response = client.delete(f"/api/v1/issues/{MOCK_ISSUE_ID}")
    assert response.status_code == status.HTTP_204_NO_CONTENT


# ==============================================================================
# 5. Comment Editing Permissions (Author vs Non-Author)
# ==============================================================================

def test_update_comment_non_author_forbidden(client, mock_db):
    """A user cannot edit another user's comment."""
    def mock_table(table_name):
        mock_t = MagicMock()
        if table_name == "issue_comments":
            mock_t.select().eq().is_().limit().execute.return_value = MagicMock(
                data=[
                    {
                        "id": MOCK_COMMENT_ID,
                        "issue_id": MOCK_ISSUE_ID,
                        "user_id": OTHER_USER_ID,  # different author
                    }
                ]
            )
        return mock_t

    mock_db.table.side_effect = mock_table

    payload = {"body_json": {"type": "doc"}, "body_text": "Hacked comment"}
    response = client.patch(f"/api/v1/comments/{MOCK_COMMENT_ID}", json=payload)
    assert response.status_code == status.HTTP_403_FORBIDDEN


def test_delete_comment_by_non_author_non_admin_forbidden(client, mock_db):
    """A standard non-admin member cannot delete someone else's comment."""
    def mock_table(table_name):
        mock_t = MagicMock()
        if table_name == "issue_comments":
            mock_t.select().eq().is_().limit().execute.return_value = MagicMock(
                data=[
                    {
                        "id": MOCK_COMMENT_ID,
                        "user_id": OTHER_USER_ID,
                        "issue_id": MOCK_ISSUE_ID,
                    }
                ]
            )
        elif table_name == "issues":
            mock_t.select().eq().limit().execute.return_value = MagicMock(
                data=[{"id": MOCK_ISSUE_ID, "organization_id": MOCK_ORG_ID}]
            )
        elif table_name == "workspace_members":
            # Member, not admin
            mock_t.select().eq().eq().limit().execute.return_value = MagicMock(data=[{"role": "member"}])
        return mock_t

    mock_db.table.side_effect = mock_table

    response = client.delete(f"/api/v1/comments/{MOCK_COMMENT_ID}")
    assert response.status_code == status.HTTP_403_FORBIDDEN


# ==============================================================================
# 6. Reaction Toggle (Remove if Already Exists)
# ==============================================================================

def test_toggle_reaction_remove_when_already_exists(client, mock_db):
    """Clicking an emoji you already reacted with removes the reaction."""
    def mock_table(table_name):
        mock_t = MagicMock()
        if table_name == "issue_comments":
            mock_t.select().eq().is_().limit().execute.return_value = MagicMock(
                data=[{"id": MOCK_COMMENT_ID, "issue_id": MOCK_ISSUE_ID}]
            )
        elif table_name == "issues":
            mock_t.select().eq().limit().execute.return_value = MagicMock(
                data=[{"id": MOCK_ISSUE_ID, "organization_id": MOCK_ORG_ID}]
            )
        elif table_name == "workspace_members":
            mock_t.select().eq().eq().limit().execute.return_value = MagicMock(data=[{"id": "m1"}])
        elif table_name == "comment_reactions":
            # Reaction already exists -> will be deleted
            mock_t.select().eq().eq().eq().limit().execute.return_value = MagicMock(
                data=[{"id": "reaction-1"}]
            )
            mock_t.delete().eq().execute.return_value = MagicMock(data=[])
            # Next query returns empty list
            mock_t.select().eq().execute.return_value = MagicMock(data=[])
        return mock_t

    mock_db.table.side_effect = mock_table

    payload = {"emoji": "👍"}
    response = client.post(f"/api/v1/comments/{MOCK_COMMENT_ID}/reactions", json=payload)
    assert response.status_code == status.HTTP_200_OK
    assert len(response.json()) == 0  # Reaction was removed


# ==============================================================================
# 7. Echo Suppression Session ID Propagation
# ==============================================================================

def test_update_issue_echo_suppression_session_id(client, mock_db):
    """Ensure client_session_id is recorded on update for frontend self-echo suppression."""
    def mock_table(table_name):
        mock_t = MagicMock()
        if table_name == "issues":
            mock_t.select().eq().limit().execute.return_value = MagicMock(
                data=[
                    {
                        "id": MOCK_ISSUE_ID,
                        "organization_id": MOCK_ORG_ID,
                        "team_id": MOCK_TEAM_ID,
                        "title": "Old Title",
                        "version": 1,
                    }
                ]
            )
            updated_data = [
                {
                    "id": MOCK_ISSUE_ID,
                    "organization_id": MOCK_ORG_ID,
                    "team_id": MOCK_TEAM_ID,
                    "number": 101,
                    "identifier": "ENG-101",
                    "title": "New Title",
                    "priority": "none",
                    "state_id": MOCK_STATE_ID_1,
                    "creator_id": MOCK_USER_ID,
                    "sort_order": "0|h00000:",
                    "version": 2,
                    "last_modified_by_session": "sess-xyz-987",
                    "created_at": "2026-09-30T10:00:00Z",
                    "updated_at": "2026-09-30T10:05:00Z",
                }
            ]
            mock_t.update().eq().execute.return_value = MagicMock(data=updated_data)
            mock_t.update().eq().eq().execute.return_value = MagicMock(data=updated_data)
        elif table_name == "workspace_members":
            mock_t.select().eq().eq().limit().execute.return_value = MagicMock(data=[{"id": "m1"}])
        elif table_name == "activity_logs":
            mock_t.insert().execute.return_value = MagicMock(data=[])
        return mock_t

    mock_db.table.side_effect = mock_table

    payload = {
        "title": "New Title",
        "expected_version": 1,
        "client_session_id": "sess-xyz-987",
    }
    response = client.patch(f"/api/v1/issues/{MOCK_ISSUE_ID}", json=payload)
    assert response.status_code == status.HTTP_200_OK
    assert response.json()["title"] == "New Title"
    assert response.json()["version"] == 2
