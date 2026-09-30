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
MOCK_SUBTASK_ID = "55555555-5555-5555-5555-555555555555"
MOCK_COMMENT_ID = "66666666-6666-6666-6666-666666666666"


def test_create_issue_and_identifier_allocation(client, mock_db):
    def mock_table(table_name):
        mock_t = MagicMock()
        if table_name == "teams":
            mock_t.select().eq().limit().execute.return_value = MagicMock(
                data=[{"id": MOCK_TEAM_ID, "organization_id": MOCK_ORG_ID, "key": "ENG", "issue_counter": 100}]
            )
            mock_t.update().eq().execute.return_value = MagicMock(data=[])
        elif table_name == "workspace_members":
            mock_t.select().eq().eq().limit().execute.return_value = MagicMock(data=[{"id": "m1", "role": "member"}])
        elif table_name == "workflow_states":
            mock_t.select().eq().eq().limit().execute.return_value = MagicMock(data=[{"id": MOCK_STATE_ID_1}])
        elif table_name == "issues":
            mock_t.select().eq().eq().is_().order().limit().execute.return_value = MagicMock(
                data=[{"sort_order": "0|h00000:"}]
            )
            mock_t.insert().execute.return_value = MagicMock(
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
                        "sort_order": "0|h80000:",
                        "version": 1,
                        "created_at": "2026-09-30T10:00:00Z",
                        "updated_at": "2026-09-30T10:00:00Z",
                    }
                ]
            )
        elif table_name == "activity_logs":
            mock_t.insert().execute.return_value = MagicMock(data=[])
        return mock_t

    mock_db.table.side_effect = mock_table

    payload = {
        "team_id": MOCK_TEAM_ID,
        "title": "Fix OAuth bug",
        "priority": "high",
    }
    response = client.post("/api/v1/issues", json=payload)
    assert response.status_code == status.HTTP_201_CREATED
    data = response.json()
    assert data["identifier"] == "ENG-101"
    assert data["number"] == 101
    assert data["priority"] == "high"


def test_list_issues_with_filters(client, mock_db):
    def mock_table(table_name):
        mock_t = MagicMock()
        if table_name == "teams":
            mock_t.select().eq().limit().execute.return_value = MagicMock(
                data=[{"id": MOCK_TEAM_ID, "organization_id": MOCK_ORG_ID, "key": "ENG", "issue_counter": 100}]
            )
        elif table_name == "workspace_members":
            mock_t.select().eq().eq().limit().execute.return_value = MagicMock(data=[{"id": "m1"}])
        elif table_name == "issues":
            mock_t.select().eq().is_().order().execute.return_value = MagicMock(
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
                        "sort_order": "0|h80000:",
                        "version": 1,
                        "created_at": "2026-09-30T10:00:00Z",
                        "updated_at": "2026-09-30T10:00:00Z",
                    }
                ]
            )
        return mock_t

    mock_db.table.side_effect = mock_table

    response = client.get(f"/api/v1/issues?team_id={MOCK_TEAM_ID}")
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert len(data) == 1
    assert data[0]["identifier"] == "ENG-101"


def test_optimistic_concurrency_control_conflict(client, mock_db):
    def mock_table(table_name):
        mock_t = MagicMock()
        if table_name == "issues":
            # Server issue is version 3
            mock_t.select().eq().limit().execute.return_value = MagicMock(
                data=[
                    {
                        "id": MOCK_ISSUE_ID,
                        "organization_id": MOCK_ORG_ID,
                        "team_id": MOCK_TEAM_ID,
                        "identifier": "ENG-101",
                        "version": 3,
                    }
                ]
            )
        elif table_name == "workspace_members":
            mock_t.select().eq().eq().limit().execute.return_value = MagicMock(data=[{"id": "m1"}])
        return mock_t

    mock_db.table.side_effect = mock_table

    # Client sends expected_version=2 (stale update)
    payload = {
        "title": "Conflicting title update",
        "expected_version": 2,
    }
    response = client.patch(f"/api/v1/issues/{MOCK_ISSUE_ID}", json=payload)
    assert response.status_code == status.HTTP_409_CONFLICT
    err = response.json()
    assert "detail" in err
    assert err["detail"]["current_version"] == 3


def test_reorder_issue_lexorank(client, mock_db):
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
                        "state_id": MOCK_STATE_ID_2,
                        "creator_id": MOCK_USER_ID,
                        "sort_order": "0|h50000:",
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
        "state_id": MOCK_STATE_ID_2,
        "prev_position": "0|h00000:",
        "next_position": "0|ha0000:",
    }
    response = client.put(f"/api/v1/issues/{MOCK_ISSUE_ID}/reorder", json=payload)
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert data["state_id"] == MOCK_STATE_ID_2
    assert data["version"] == 2


def test_batch_reorder_and_batch_update(client, mock_db):
    mock_db.table.side_effect = None
    mock_db.table().update().eq().execute.return_value = MagicMock(data=[])

    # 1. Batch reorder
    reorder_payload = {
        "items": [
            {"issue_id": MOCK_ISSUE_ID, "state_id": MOCK_STATE_ID_1, "position": "0|010000:"},
            {"issue_id": MOCK_SUBTASK_ID, "state_id": MOCK_STATE_ID_1, "position": "0|020000:"},
        ]
    }
    res_reorder = client.post("/api/v1/issues/batch-reorder", json=reorder_payload)
    assert res_reorder.status_code == status.HTTP_200_OK
    assert res_reorder.json()["modified_count"] == 2

    # 2. Batch update
    update_payload = {
        "updates": [
            {"issue_id": MOCK_ISSUE_ID, "priority": "urgent"},
            {"issue_id": MOCK_SUBTASK_ID, "priority": "low"},
        ]
    }
    res_update = client.post("/api/v1/issues/batch-update", json=update_payload)
    assert res_update.status_code == status.HTTP_200_OK
    assert len(res_update.json()) == 2


def test_subtasks_creation_and_listing(client, mock_db):
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
                    }
                ]
            )
            mock_t.select().eq().is_().order().limit().execute.return_value = MagicMock(data=[])
            mock_t.insert().execute.return_value = MagicMock(
                data=[
                    {
                        "id": MOCK_SUBTASK_ID,
                        "organization_id": MOCK_ORG_ID,
                        "team_id": MOCK_TEAM_ID,
                        "number": 102,
                        "identifier": "ENG-102",
                        "title": "Unit tests for OAuth",
                        "priority": "medium",
                        "state_id": MOCK_STATE_ID_1,
                        "creator_id": MOCK_USER_ID,
                        "parent_id": MOCK_ISSUE_ID,
                        "sort_order": "0|h00000:",
                        "version": 1,
                        "created_at": "2026-09-30T10:00:00Z",
                        "updated_at": "2026-09-30T10:00:00Z",
                    }
                ]
            )
            mock_t.select().eq().is_().order().execute.return_value = MagicMock(
                data=[
                    {
                        "id": MOCK_SUBTASK_ID,
                        "organization_id": MOCK_ORG_ID,
                        "team_id": MOCK_TEAM_ID,
                        "number": 102,
                        "identifier": "ENG-102",
                        "title": "Unit tests for OAuth",
                        "priority": "medium",
                        "state_id": MOCK_STATE_ID_1,
                        "creator_id": MOCK_USER_ID,
                        "parent_id": MOCK_ISSUE_ID,
                        "sort_order": "0|h00000:",
                        "version": 1,
                        "created_at": "2026-09-30T10:00:00Z",
                        "updated_at": "2026-09-30T10:00:00Z",
                    }
                ]
            )
        elif table_name == "teams":
            mock_t.select().eq().limit().execute.return_value = MagicMock(
                data=[{"key": "ENG", "issue_counter": 101}]
            )
            mock_t.update().eq().execute.return_value = MagicMock(data=[])
        elif table_name == "workspace_members":
            mock_t.select().eq().eq().limit().execute.return_value = MagicMock(data=[{"id": "m1"}])
        elif table_name == "activity_logs":
            mock_t.insert().execute.return_value = MagicMock(data=[])
        return mock_t

    mock_db.table.side_effect = mock_table

    # 1. Create subtask
    sub_payload = {"title": "Unit tests for OAuth", "priority": "medium"}
    res = client.post(f"/api/v1/issues/{MOCK_ISSUE_ID}/subtasks", json=sub_payload)
    assert res.status_code == status.HTTP_201_CREATED
    assert res.json()["parent_id"] == MOCK_ISSUE_ID
    assert res.json()["identifier"] == "ENG-102"

    # 2. List subtasks
    res_list = client.get(f"/api/v1/issues/{MOCK_ISSUE_ID}/subtasks")
    assert res_list.status_code == status.HTTP_200_OK
    assert len(res_list.json()) == 1


def test_comments_and_reactions(client, mock_db):
    def mock_table(table_name):
        mock_t = MagicMock()
        if table_name == "issues":
            mock_t.select().eq().limit().execute.return_value = MagicMock(
                data=[{"id": MOCK_ISSUE_ID, "organization_id": MOCK_ORG_ID}]
            )
        elif table_name == "workspace_members":
            mock_t.select().eq().eq().limit().execute.return_value = MagicMock(data=[{"id": "m1"}])
        elif table_name == "issue_comments":
            mock_t.insert().execute.return_value = MagicMock(
                data=[
                    {
                        "id": MOCK_COMMENT_ID,
                        "issue_id": MOCK_ISSUE_ID,
                        "user_id": MOCK_USER_ID,
                        "body_json": {"type": "doc", "content": []},
                        "body_text": "Looks great!",
                        "created_at": "2026-09-30T10:00:00Z",
                        "updated_at": "2026-09-30T10:00:00Z",
                    }
                ]
            )
            mock_t.select().eq().is_().order().execute.return_value = MagicMock(
                data=[
                    {
                        "id": MOCK_COMMENT_ID,
                        "issue_id": MOCK_ISSUE_ID,
                        "user_id": MOCK_USER_ID,
                        "body_json": {"type": "doc", "content": []},
                        "body_text": "Looks great!",
                        "created_at": "2026-09-30T10:00:00Z",
                        "updated_at": "2026-09-30T10:00:00Z",
                    }
                ]
            )
            mock_t.select().eq().is_().limit().execute.return_value = MagicMock(
                data=[{"id": MOCK_COMMENT_ID, "issue_id": MOCK_ISSUE_ID, "user_id": MOCK_USER_ID}]
            )
            mock_t.update().eq().execute.return_value = MagicMock(data=[])
        elif table_name == "comment_reactions":
            mock_t.select().in_().execute.return_value = MagicMock(
                data=[{"comment_id": MOCK_COMMENT_ID, "emoji": "👍", "user_id": MOCK_USER_ID}]
            )
            mock_t.select().eq().eq().eq().limit().execute.return_value = MagicMock(data=[])
            mock_t.insert().execute.return_value = MagicMock(data=[])
            mock_t.select().eq().execute.return_value = MagicMock(
                data=[{"emoji": "🚀", "user_id": MOCK_USER_ID}]
            )
        elif table_name == "activity_logs":
            mock_t.insert().execute.return_value = MagicMock(data=[])
        return mock_t

    mock_db.table.side_effect = mock_table

    # 1. Post comment
    c_payload = {"body_json": {"type": "doc"}, "body_text": "Looks great!"}
    res_post = client.post(f"/api/v1/issues/{MOCK_ISSUE_ID}/comments", json=c_payload)
    assert res_post.status_code == status.HTTP_201_CREATED
    assert res_post.json()["body_text"] == "Looks great!"

    # 2. List comments with reactions
    res_list = client.get(f"/api/v1/issues/{MOCK_ISSUE_ID}/comments")
    assert res_list.status_code == status.HTTP_200_OK
    data = res_list.json()
    assert len(data) == 1
    assert data[0]["reactions"][0]["emoji"] == "👍"

    # 3. Toggle reaction
    rx_payload = {"emoji": "🚀"}
    res_rx = client.post(f"/api/v1/comments/{MOCK_COMMENT_ID}/reactions", json=rx_payload)
    assert res_rx.status_code == status.HTTP_200_OK
    assert res_rx.json()[0]["emoji"] == "🚀"
