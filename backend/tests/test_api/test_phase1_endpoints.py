from unittest.mock import MagicMock
from fastapi import status
from tests.conftest import (
    MOCK_USER_ID,
    MOCK_ORG_ID,
    MOCK_TEAM_ID,
    MOCK_STATE_ID_1,
    MOCK_STATE_ID_2,
)


def test_health_check(client):
    response = client.get("/health")
    assert response.status_code == status.HTTP_200_OK
    assert response.json()["status"] == "healthy"


def test_get_workspaces_me(client, mock_db):
    def mock_table(table_name):
        mock_t = MagicMock()
        if table_name == "workspace_members":
            mock_t.select().eq().execute.return_value = MagicMock(
                data=[
                    {
                        "organization_id": MOCK_ORG_ID,
                        "role": "admin",
                        "organizations": {
                            "id": MOCK_ORG_ID,
                            "name": "Acme Corp",
                            "slug": "acme",
                            "logo_url": None,
                            "created_at": "2026-09-30T10:00:00Z",
                            "updated_at": "2026-09-30T10:00:00Z",
                        },
                    }
                ]
            )
        elif table_name == "teams":
            mock_t.select().eq().execute.return_value = MagicMock(
                data=[
                    {
                        "id": MOCK_TEAM_ID,
                        "name": "Engineering",
                        "key": "ENG",
                        "organization_id": MOCK_ORG_ID,
                    }
                ]
            )
        return mock_t

    mock_db.table.side_effect = mock_table

    response = client.get("/api/v1/workspaces/me")
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert "workspaces" in data
    assert len(data["workspaces"]) == 1
    assert data["workspaces"][0]["organization"]["name"] == "Acme Corp"
    assert data["workspaces"][0]["role"] == "admin"
    assert len(data["workspaces"][0]["teams"]) == 1
    assert data["workspaces"][0]["teams"][0]["key"] == "ENG"


def test_create_workspace(client, mock_db):
    mock_db.table.side_effect = None
    mock_db.table().select().eq().limit().execute.return_value = MagicMock(data=[])
    mock_db.table().insert().execute.return_value = MagicMock(
        data=[
            {
                "id": MOCK_ORG_ID,
                "name": "Linear Labs",
                "slug": "linear-labs",
                "logo_url": "https://example.com/logo.png",
                "created_at": "2026-09-30T10:00:00Z",
                "updated_at": "2026-09-30T10:00:00Z",
            }
        ]
    )

    payload = {
        "name": "Linear Labs",
        "slug": "linear-labs",
        "logo_url": "https://example.com/logo.png",
    }
    response = client.post("/api/v1/workspaces", json=payload)
    assert response.status_code == status.HTTP_201_CREATED
    data = response.json()
    assert data["name"] == "Linear Labs"
    assert data["slug"] == "linear-labs"


def test_list_workspace_teams(client, mock_db):
    def mock_table(table_name):
        mock_t = MagicMock()
        if table_name == "organizations":
            mock_t.select().eq().limit().execute.return_value = MagicMock(
                data=[{"id": MOCK_ORG_ID, "name": "Acme", "slug": "acme"}]
            )
        elif table_name == "workspace_members":
            mock_t.select().eq().eq().limit().execute.return_value = MagicMock(
                data=[{"id": "member-1", "role": "member"}]
            )
        elif table_name == "teams":
            mock_t.select().eq().order().execute.return_value = MagicMock(
                data=[
                    {
                        "id": MOCK_TEAM_ID,
                        "organization_id": MOCK_ORG_ID,
                        "name": "Engineering",
                        "key": "ENG",
                        "issue_counter": 12,
                        "cycle_duration_weeks": 2,
                        "created_at": "2026-09-30T10:00:00Z",
                    }
                ]
            )
        return mock_t

    mock_db.table.side_effect = mock_table

    response = client.get("/api/v1/workspaces/acme/teams")
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert len(data) == 1
    assert data[0]["key"] == "ENG"


def test_create_workspace_team(client, mock_db):
    def mock_table(table_name):
        mock_t = MagicMock()
        if table_name == "organizations":
            mock_t.select().eq().limit().execute.return_value = MagicMock(
                data=[{"id": MOCK_ORG_ID, "name": "Acme", "slug": "acme"}]
            )
        elif table_name == "workspace_members":
            mock_t.select().eq().eq().limit().execute.return_value = MagicMock(
                data=[{"id": "member-1", "role": "admin"}]
            )
        elif table_name == "teams":
            mock_t.select().eq().eq().limit().execute.return_value = MagicMock(data=[])
            mock_t.insert().execute.return_value = MagicMock(
                data=[
                    {
                        "id": MOCK_TEAM_ID,
                        "organization_id": MOCK_ORG_ID,
                        "name": "Product",
                        "key": "PROD",
                        "issue_counter": 0,
                        "cycle_duration_weeks": 2,
                        "created_at": "2026-09-30T10:00:00Z",
                    }
                ]
            )
        elif table_name in ("team_members", "workflow_states"):
            mock_t.insert().execute.return_value = MagicMock(data=[{"id": "dummy"}])
        return mock_t

    mock_db.table.side_effect = mock_table

    payload = {
        "name": "Product",
        "key": "PROD",
        "cycle_duration_weeks": 2,
    }
    response = client.post("/api/v1/workspaces/acme/teams", json=payload)
    assert response.status_code == status.HTTP_201_CREATED
    data = response.json()
    assert data["name"] == "Product"
    assert data["key"] == "PROD"


def test_list_team_members(client, mock_db):
    def mock_table(table_name):
        mock_t = MagicMock()
        if table_name == "teams":
            mock_t.select().eq().limit().execute.return_value = MagicMock(
                data=[{"id": MOCK_TEAM_ID, "organization_id": MOCK_ORG_ID}]
            )
        elif table_name == "workspace_members":
            mock_t.select().eq().eq().limit().execute.return_value = MagicMock(
                data=[{"id": "member-1"}]
            )
        elif table_name == "team_members":
            mock_t.select().eq().execute.return_value = MagicMock(
                data=[
                    {
                        "id": "tm-1",
                        "team_id": MOCK_TEAM_ID,
                        "user_id": MOCK_USER_ID,
                        "created_at": "2026-09-30T10:00:00Z",
                    }
                ]
            )
        return mock_t

    mock_db.table.side_effect = mock_table

    response = client.get(f"/api/v1/teams/{MOCK_TEAM_ID}/members")
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert len(data) == 1
    assert data[0]["user_id"] == MOCK_USER_ID


def test_list_workflow_states(client, mock_db):
    def mock_table(table_name):
        mock_t = MagicMock()
        if table_name == "teams":
            mock_t.select().eq().limit().execute.return_value = MagicMock(
                data=[{"id": MOCK_TEAM_ID, "organization_id": MOCK_ORG_ID}]
            )
        elif table_name == "workspace_members":
            mock_t.select().eq().eq().limit().execute.return_value = MagicMock(
                data=[{"id": "member-1"}]
            )
        elif table_name == "workflow_states":
            mock_t.select().eq().order().execute.return_value = MagicMock(
                data=[
                    {
                        "id": MOCK_STATE_ID_1,
                        "team_id": MOCK_TEAM_ID,
                        "name": "Todo",
                        "color": "#e2e8f0",
                        "category": "unstarted",
                        "position": "0|h10000:",
                        "is_default": True,
                        "created_at": "2026-09-30T10:00:00Z",
                    },
                    {
                        "id": MOCK_STATE_ID_2,
                        "team_id": MOCK_TEAM_ID,
                        "name": "In Progress",
                        "color": "#f59e0b",
                        "category": "started",
                        "position": "0|h20000:",
                        "is_default": False,
                        "created_at": "2026-09-30T10:00:00Z",
                    },
                ]
            )
        return mock_t

    mock_db.table.side_effect = mock_table

    response = client.get(f"/api/v1/teams/{MOCK_TEAM_ID}/states")
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert len(data) == 2
    assert data[0]["name"] == "Todo"
    assert data[1]["name"] == "In Progress"


def test_reorder_workflow_states(client, mock_db):
    def mock_table(table_name):
        mock_t = MagicMock()
        if table_name == "teams":
            mock_t.select().eq().limit().execute.return_value = MagicMock(
                data=[{"id": MOCK_TEAM_ID, "organization_id": MOCK_ORG_ID}]
            )
        elif table_name == "workspace_members":
            mock_t.select().eq().eq().limit().execute.return_value = MagicMock(
                data=[{"id": "member-1"}]
            )
        elif table_name == "workflow_states":
            mock_t.update().eq().eq().execute.return_value = MagicMock(data=[])
            mock_t.select().eq().order().execute.return_value = MagicMock(
                data=[
                    {
                        "id": MOCK_STATE_ID_2,
                        "team_id": MOCK_TEAM_ID,
                        "name": "In Progress",
                        "color": "#f59e0b",
                        "category": "started",
                        "position": "0|h05000:",
                        "is_default": False,
                        "created_at": "2026-09-30T10:00:00Z",
                    },
                    {
                        "id": MOCK_STATE_ID_1,
                        "team_id": MOCK_TEAM_ID,
                        "name": "Todo",
                        "color": "#e2e8f0",
                        "category": "unstarted",
                        "position": "0|h10000:",
                        "is_default": True,
                        "created_at": "2026-09-30T10:00:00Z",
                    },
                ]
            )
        return mock_t

    mock_db.table.side_effect = mock_table

    payload = {
        "states": [
            {"state_id": MOCK_STATE_ID_2, "position": "0|h05000:"},
            {"state_id": MOCK_STATE_ID_1, "position": "0|h10000:"},
        ]
    }
    response = client.put(f"/api/v1/teams/{MOCK_TEAM_ID}/states/reorder", json=payload)
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert len(data) == 2
    assert data[0]["id"] == MOCK_STATE_ID_2
    assert data[0]["position"] == "0|h05000:"


def test_unauthorized_access():
    from app.main import app
    from fastapi.testclient import TestClient

    # Test without auth overrides
    with TestClient(app) as raw_client:
        response = raw_client.get("/api/v1/workspaces/me")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

