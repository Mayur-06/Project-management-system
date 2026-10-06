from unittest.mock import MagicMock
from fastapi import status
from tests.conftest import (
    MOCK_USER_ID,
    MOCK_ORG_ID,
    MOCK_TEAM_ID,
    MOCK_STATE_ID_1,
    MOCK_STATE_ID_2,
)

MOCK_CYCLE_ID = "77777777-7777-7777-7777-777777777777"
MOCK_NEXT_CYCLE_ID = "77777777-7777-7777-7777-777777777778"
MOCK_PROJECT_ID = "88888888-8888-8888-8888-888888888888"
MOCK_MILESTONE_ID = "99999999-9999-9999-9999-999999999999"
MOCK_ISSUE_ID = "44444444-4444-4444-4444-444444444444"


# ==============================================================================
# 1. Cycles Endpoints Tests
# ==============================================================================

def test_create_and_list_team_cycles(client, mock_db):
    def mock_table(table_name):
        mock_t = MagicMock()
        if table_name == "teams":
            mock_t.select().eq().limit().execute.return_value = MagicMock(
                data=[{"id": MOCK_TEAM_ID, "organization_id": MOCK_ORG_ID, "key": "ENG"}]
            )
        elif table_name == "workspace_members":
            mock_t.select().eq().eq().limit().execute.return_value = MagicMock(data=[{"id": "m1"}])
        elif table_name == "cycles":
            mock_t.select().eq().order().limit().execute.return_value = MagicMock(data=[{"number": 4}])
            mock_t.insert().execute.return_value = MagicMock(
                data=[
                    {
                        "id": MOCK_CYCLE_ID,
                        "team_id": MOCK_TEAM_ID,
                        "number": 5,
                        "name": "Sprint 5",
                        "starts_at": "2026-10-01T00:00:00Z",
                        "ends_at": "2026-10-15T00:00:00Z",
                        "created_at": "2026-10-01T00:00:00Z",
                    }
                ]
            )
            mock_t.select().eq().order().execute.return_value = MagicMock(
                data=[
                    {
                        "id": MOCK_CYCLE_ID,
                        "team_id": MOCK_TEAM_ID,
                        "number": 5,
                        "name": "Sprint 5",
                        "starts_at": "2026-10-01T00:00:00Z",
                        "ends_at": "2026-10-15T00:00:00Z",
                        "created_at": "2026-10-01T00:00:00Z",
                    }
                ]
            )
        return mock_t

    mock_db.table.side_effect = mock_table

    # 1. Create cycle
    create_payload = {
        "name": "Sprint 5",
        "starts_at": "2026-10-01T00:00:00Z",
        "ends_at": "2026-10-15T00:00:00Z",
    }
    res_create = client.post(f"/api/v1/teams/{MOCK_TEAM_ID}/cycles", json=create_payload)
    assert res_create.status_code == status.HTTP_201_CREATED
    data_create = res_create.json()
    assert data_create["number"] == 5
    assert data_create["name"] == "Sprint 5"

    # 2. List cycles
    res_list = client.get(f"/api/v1/teams/{MOCK_TEAM_ID}/cycles")
    assert res_list.status_code == status.HTTP_200_OK
    assert len(res_list.json()) == 1


def test_get_cycle_metrics(client, mock_db):
    def mock_table(table_name):
        mock_t = MagicMock()
        if table_name == "cycles":
            mock_t.select().eq().limit().execute.return_value = MagicMock(
                data=[
                    {
                        "id": MOCK_CYCLE_ID,
                        "team_id": MOCK_TEAM_ID,
                        "number": 5,
                        "name": "Sprint 5",
                        "starts_at": "2026-10-01T00:00:00Z",
                        "ends_at": "2026-10-15T00:00:00Z",
                        "created_at": "2026-10-01T00:00:00Z",
                    }
                ]
            )
        elif table_name == "teams":
            mock_t.select().eq().limit().execute.return_value = MagicMock(
                data=[{"id": MOCK_TEAM_ID, "organization_id": MOCK_ORG_ID}]
            )
        elif table_name == "workspace_members":
            mock_t.select().eq().eq().limit().execute.return_value = MagicMock(data=[{"id": "m1"}])
        elif table_name == "issues":
            mock_t.select().eq().is_().execute.return_value = MagicMock(
                data=[
                    {
                        "id": "iss-1",
                        "estimate": 5,
                        "completed_at": "2026-10-05T12:00:00Z",
                        "workflow_states": {"category": "completed"},
                    },
                    {
                        "id": "iss-2",
                        "estimate": 3,
                        "completed_at": None,
                        "workflow_states": {"category": "started"},
                    },
                ]
            )
        return mock_t

    mock_db.table.side_effect = mock_table

    response = client.get(f"/api/v1/cycles/{MOCK_CYCLE_ID}")
    assert response.status_code == status.HTTP_200_OK
    metrics = response.json()
    assert metrics["total_issues"] == 2
    assert metrics["completed_issues"] == 1
    assert metrics["total_estimate_points"] == 8
    assert metrics["completed_estimate_points"] == 5
    assert metrics["completion_percentage"] == 62.5


def test_complete_cycle_with_rollover(client, mock_db):
    def mock_table(table_name):
        mock_t = MagicMock()
        if table_name == "cycles":
            mock_t.select().eq().limit().execute.return_value = MagicMock(
                data=[
                    {
                        "id": MOCK_CYCLE_ID,
                        "team_id": MOCK_TEAM_ID,
                        "number": 5,
                        "starts_at": "2026-10-01T00:00:00Z",
                        "ends_at": "2026-10-15T00:00:00Z",
                        "created_at": "2026-10-01T00:00:00Z",
                    }
                ]
            )
            mock_t.update().eq().execute.return_value = MagicMock(data=[])
        elif table_name == "teams":
            mock_t.select().eq().limit().execute.return_value = MagicMock(
                data=[{"id": MOCK_TEAM_ID, "organization_id": MOCK_ORG_ID}]
            )
        elif table_name == "workspace_members":
            mock_t.select().eq().eq().limit().execute.return_value = MagicMock(data=[{"id": "m1"}])
        elif table_name == "issues":
            mock_t.select().eq().is_().execute.return_value = MagicMock(
                data=[
                    {
                        "id": "iss-unresolved",
                        "state_id": MOCK_STATE_ID_1,
                        "workflow_states": {"category": "started"},
                    }
                ]
            )
            mock_t.update().in_().execute.return_value = MagicMock(data=[])
        elif table_name == "workflow_states":
            mock_t.select().eq().eq().limit().execute.return_value = MagicMock(
                data=[{"id": "state-backlog", "category": "backlog"}]
            )
        elif table_name == "activity_logs":
            mock_t.insert().execute.return_value = MagicMock(data=[])
        return mock_t

    mock_db.table.side_effect = mock_table

    payload = {"destination": "backlog"}
    response = client.post(f"/api/v1/cycles/{MOCK_CYCLE_ID}/complete", json=payload)
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert data["transferred_issues_count"] == 1
    assert data["destination"] == "backlog"


def test_delete_cycle_success_moves_issues_to_backlog(client, mock_db):
    """Positive test: Deleting a sprint cycle unassigns issues and moves unfinished ones to team backlog."""
    def mock_table(table_name):
        mock_t = MagicMock()
        if table_name == "cycles":
            mock_t.select().eq().limit().execute.return_value = MagicMock(
                data=[
                    {
                        "id": MOCK_CYCLE_ID,
                        "team_id": MOCK_TEAM_ID,
                        "number": 5,
                        "name": "Sprint 5",
                        "starts_at": "2026-10-01T00:00:00Z",
                        "ends_at": "2026-10-15T00:00:00Z",
                    }
                ]
            )
            mock_t.delete().eq().execute.return_value = MagicMock(data=[])
        elif table_name == "teams":
            mock_t.select().eq().limit().execute.return_value = MagicMock(
                data=[{"id": MOCK_TEAM_ID, "organization_id": MOCK_ORG_ID}]
            )
        elif table_name == "workspace_members":
            mock_t.select().eq().eq().limit().execute.return_value = MagicMock(data=[{"id": "m1"}])
        elif table_name == "issues":
            mock_t.select().eq().is_().execute.return_value = MagicMock(
                data=[
                    {
                        "id": "iss-unresolved-1",
                        "state_id": MOCK_STATE_ID_1,
                        "workflow_states": {"category": "started"},
                    },
                    {
                        "id": "iss-done-2",
                        "state_id": MOCK_STATE_ID_2,
                        "workflow_states": {"category": "completed"},
                    },
                ]
            )
            mock_t.update().in_().execute.return_value = MagicMock(data=[])
        elif table_name == "workflow_states":
            mock_t.select().eq().eq().limit().execute.return_value = MagicMock(
                data=[{"id": "state-backlog", "category": "backlog"}]
            )
        elif table_name == "activity_logs":
            mock_t.insert().execute.return_value = MagicMock(data=[])
        return mock_t

    mock_db.table.side_effect = mock_table

    response = client.delete(f"/api/v1/cycles/{MOCK_CYCLE_ID}")
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert data["success"] is True
    assert data["cycle_id"] == MOCK_CYCLE_ID
    assert data["unassigned_issues_count"] == 2
    assert data["moved_to_backlog_count"] == 1


def test_delete_cycle_not_found(client, mock_db):
    """Negative test: Deleting a non-existent cycle returns 404 Not Found."""
    def mock_table(table_name):
        mock_t = MagicMock()
        if table_name == "cycles":
            mock_t.select().eq().limit().execute.return_value = MagicMock(data=[])
        return mock_t

    mock_db.table.side_effect = mock_table

    response = client.delete(f"/api/v1/cycles/00000000-0000-0000-0000-000000000999")
    assert response.status_code == status.HTTP_404_NOT_FOUND


def test_delete_cycle_access_denied(client, mock_db):
    """Negative test: Deleting a cycle without team membership returns 403 Forbidden."""
    def mock_table(table_name):
        mock_t = MagicMock()
        if table_name == "cycles":
            mock_t.select().eq().limit().execute.return_value = MagicMock(
                data=[{"id": MOCK_CYCLE_ID, "team_id": MOCK_TEAM_ID}]
            )
        elif table_name == "teams":
            mock_t.select().eq().limit().execute.return_value = MagicMock(
                data=[{"id": MOCK_TEAM_ID, "organization_id": MOCK_ORG_ID}]
            )
        elif table_name == "workspace_members":
            mock_t.select().eq().eq().limit().execute.return_value = MagicMock(data=[])
        return mock_t

    mock_db.table.side_effect = mock_table

    response = client.delete(f"/api/v1/cycles/{MOCK_CYCLE_ID}")
    assert response.status_code == status.HTTP_403_FORBIDDEN


def test_create_cycle_negative_invalid_dates(client, mock_db):
    """Negative test: ends_at <= starts_at must be rejected with 422 Unprocessable Entity."""
    payload = {
        "name": "Invalid Cycle",
        "starts_at": "2026-10-15T00:00:00Z",
        "ends_at": "2026-10-10T00:00:00Z",  # Earlier than starts_at
    }
    response = client.post(f"/api/v1/teams/{MOCK_TEAM_ID}/cycles", json=payload)
    assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY


def test_create_cycle_access_denied(client, mock_db):
    """Negative test: Non-member of organization cannot create a cycle (403 Forbidden)."""
    def mock_table(table_name):
        mock_t = MagicMock()
        if table_name == "teams":
            mock_t.select().eq().limit().execute.return_value = MagicMock(
                data=[{"id": MOCK_TEAM_ID, "organization_id": MOCK_ORG_ID, "key": "ENG"}]
            )
        elif table_name == "workspace_members":
            # User is NOT a member
            mock_t.select().eq().eq().limit().execute.return_value = MagicMock(data=[])
        return mock_t

    mock_db.table.side_effect = mock_table

    payload = {
        "name": "Unauthorized Cycle",
        "starts_at": "2026-10-01T00:00:00Z",
        "ends_at": "2026-10-15T00:00:00Z",
    }
    response = client.post(f"/api/v1/teams/{MOCK_TEAM_ID}/cycles", json=payload)
    assert response.status_code == status.HTTP_403_FORBIDDEN


def test_complete_cycle_not_found(client, mock_db):
    """Negative test: Completing non-existent cycle must return 404 Not Found."""
    def mock_table(table_name):
        mock_t = MagicMock()
        if table_name == "cycles":
            mock_t.select().eq().limit().execute.return_value = MagicMock(data=[])
        return mock_t

    mock_db.table.side_effect = mock_table

    payload = {"destination": "backlog"}
    response = client.post(f"/api/v1/cycles/00000000-0000-0000-0000-000000000999/complete", json=payload)
    assert response.status_code == status.HTTP_404_NOT_FOUND


# ==============================================================================
# 2. Projects & Milestones Endpoints Tests
# ==============================================================================

def test_create_and_list_projects(client, mock_db):
    def mock_table(table_name):
        mock_t = MagicMock()
        if table_name == "organizations":
            mock_t.select().eq().limit().execute.return_value = MagicMock(
                data=[{"id": MOCK_ORG_ID, "name": "Acme", "slug": "acme"}]
            )
        elif table_name == "workspace_members":
            mock_t.select().eq().eq().limit().execute.return_value = MagicMock(data=[{"id": "m1"}])
        elif table_name == "projects":
            mock_t.select().eq().eq().limit().execute.return_value = MagicMock(data=[])
            mock_t.select().eq().order().limit().execute.return_value = MagicMock(data=[])
            mock_t.insert().execute.return_value = MagicMock(
                data=[
                    {
                        "id": MOCK_PROJECT_ID,
                        "organization_id": MOCK_ORG_ID,
                        "name": "Auth Revamp",
                        "slug": "auth-revamp",
                        "health": "on_track",
                        "sort_order": "0|h00000:",
                        "created_at": "2026-10-01T00:00:00Z",
                    }
                ]
            )
            mock_t.select().eq().order().execute.return_value = MagicMock(
                data=[
                    {
                        "id": MOCK_PROJECT_ID,
                        "organization_id": MOCK_ORG_ID,
                        "name": "Auth Revamp",
                        "slug": "auth-revamp",
                        "health": "on_track",
                        "sort_order": "0|h00000:",
                        "created_at": "2026-10-01T00:00:00Z",
                    }
                ]
            )
        elif table_name == "project_milestones":
            mock_t.select().in_().execute.return_value = MagicMock(
                data=[{"project_id": MOCK_PROJECT_ID}]
            )
        elif table_name == "issues":
            mock_t.select().in_().is_().execute.return_value = MagicMock(
                data=[
                    {"project_id": MOCK_PROJECT_ID, "completed_at": "2026-10-02T00:00:00Z", "workflow_states": {"category": "completed"}}
                ]
            )
        return mock_t

    mock_db.table.side_effect = mock_table

    # 1. Create project
    create_payload = {"name": "Auth Revamp", "slug": "auth-revamp", "health": "on_track"}
    res_create = client.post("/api/v1/organizations/acme/projects", json=create_payload)
    assert res_create.status_code == status.HTTP_201_CREATED
    assert res_create.json()["slug"] == "auth-revamp"

    # 2. List projects
    res_list = client.get("/api/v1/organizations/acme/projects")
    assert res_list.status_code == status.HTTP_200_OK
    projects = res_list.json()
    assert len(projects) == 1
    assert projects[0]["milestones_count"] == 1
    assert projects[0]["completed_issues"] == 1


def test_get_and_patch_project(client, mock_db):
    def mock_table(table_name):
        mock_t = MagicMock()
        if table_name == "projects":
            mock_t.select().eq().limit().execute.return_value = MagicMock(
                data=[
                    {
                        "id": MOCK_PROJECT_ID,
                        "organization_id": MOCK_ORG_ID,
                        "name": "Auth Revamp",
                        "slug": "auth-revamp",
                        "health": "on_track",
                        "sort_order": "0|h00000:",
                        "created_at": "2026-10-01T00:00:00Z",
                    }
                ]
            )
            mock_t.update().eq().execute.return_value = MagicMock(
                data=[
                    {
                        "id": MOCK_PROJECT_ID,
                        "organization_id": MOCK_ORG_ID,
                        "name": "Auth Revamp",
                        "slug": "auth-revamp",
                        "health": "at_risk",
                        "sort_order": "0|h00000:",
                        "created_at": "2026-10-01T00:00:00Z",
                    }
                ]
            )
        elif table_name == "workspace_members":
            mock_t.select().eq().eq().limit().execute.return_value = MagicMock(data=[{"id": "m1"}])
        elif table_name == "project_milestones":
            mock_t.select().eq().order().execute.return_value = MagicMock(data=[])
        elif table_name == "issues":
            mock_t.select().eq().is_().order().execute.return_value = MagicMock(data=[])
        return mock_t

    mock_db.table.side_effect = mock_table

    # 1. Get project detail
    res_get = client.get(f"/api/v1/projects/{MOCK_PROJECT_ID}")
    assert res_get.status_code == status.HTTP_200_OK
    assert res_get.json()["name"] == "Auth Revamp"

    # 2. Update health directly to 'at_risk'
    patch_payload = {"health": "at_risk"}
    res_patch = client.patch(f"/api/v1/projects/{MOCK_PROJECT_ID}", json=patch_payload)
    assert res_patch.status_code == status.HTTP_200_OK
    assert res_patch.json()["health"] == "at_risk"


def test_milestone_create_and_update(client, mock_db):
    def mock_table(table_name):
        mock_t = MagicMock()
        if table_name == "projects":
            mock_t.select().eq().limit().execute.return_value = MagicMock(
                data=[{"id": MOCK_PROJECT_ID, "organization_id": MOCK_ORG_ID}]
            )
        elif table_name == "workspace_members":
            mock_t.select().eq().eq().limit().execute.return_value = MagicMock(data=[{"id": "m1"}])
        elif table_name == "project_milestones":
            mock_t.select().eq().order().limit().execute.return_value = MagicMock(data=[])
            mock_t.insert().execute.return_value = MagicMock(
                data=[
                    {
                        "id": MOCK_MILESTONE_ID,
                        "project_id": MOCK_PROJECT_ID,
                        "name": "Phase 1: DB Migration",
                        "target_date": "2026-10-10",
                        "completed_at": None,
                        "sort_order": "0|h00000:",
                        "created_at": "2026-10-01T00:00:00Z",
                    }
                ]
            )
            mock_t.select().eq().limit().execute.return_value = MagicMock(
                data=[
                    {
                        "id": MOCK_MILESTONE_ID,
                        "project_id": MOCK_PROJECT_ID,
                        "name": "Phase 1: DB Migration",
                        "target_date": "2026-10-10",
                        "completed_at": None,
                        "sort_order": "0|h00000:",
                        "created_at": "2026-10-01T00:00:00Z",
                    }
                ]
            )
            mock_t.update().eq().execute.return_value = MagicMock(
                data=[
                    {
                        "id": MOCK_MILESTONE_ID,
                        "project_id": MOCK_PROJECT_ID,
                        "name": "Phase 1: DB Migration",
                        "target_date": "2026-10-10",
                        "completed_at": "2026-10-02T12:00:00Z",
                        "sort_order": "0|h00000:",
                        "created_at": "2026-10-01T00:00:00Z",
                    }
                ]
            )
        return mock_t

    mock_db.table.side_effect = mock_table

    # 1. Create milestone
    m_payload = {"name": "Phase 1: DB Migration", "target_date": "2026-10-10"}
    res_create = client.post(f"/api/v1/projects/{MOCK_PROJECT_ID}/milestones", json=m_payload)
    assert res_create.status_code == status.HTTP_201_CREATED
    assert res_create.json()["name"] == "Phase 1: DB Migration"

    # 2. Complete milestone
    patch_payload = {"completed_at": "2026-10-02T12:00:00Z"}
    res_patch = client.patch(f"/api/v1/milestones/{MOCK_MILESTONE_ID}", json=patch_payload)
    assert res_patch.status_code == status.HTTP_200_OK
    assert res_patch.json()["completed_at"] == "2026-10-02T12:00:00Z"


# ==============================================================================
# 3. Triage Inbox Endpoints Tests
# ==============================================================================

def test_triage_flow_list_accept_snooze_decline(client, mock_db):
    def mock_table(table_name):
        mock_t = MagicMock()
        if table_name == "teams":
            mock_t.select().eq().limit().execute.return_value = MagicMock(
                data=[{"id": MOCK_TEAM_ID, "organization_id": MOCK_ORG_ID}]
            )
        elif table_name == "workspace_members":
            mock_t.select().eq().eq().limit().execute.return_value = MagicMock(data=[{"id": "m1"}])
        elif table_name == "workflow_states":
            mock_t.select().eq().eq().limit().execute.return_value = MagicMock(
                data=[{"id": "state-triage-id"}]
            )
        elif table_name == "issues":
            mock_t.select().eq().eq().is_().order().execute.return_value = MagicMock(
                data=[
                    {
                        "id": MOCK_ISSUE_ID,
                        "team_id": MOCK_TEAM_ID,
                        "organization_id": MOCK_ORG_ID,
                        "number": 1,
                        "identifier": "ENG-1",
                        "title": "Untriaged bug report",
                        "priority": "none",
                        "state_id": "state-triage-id",
                        "creator_id": MOCK_USER_ID,
                        "sort_order": "0|h00000:",
                        "version": 1,
                        "snoozed_until": None,
                        "created_at": "2026-10-01T00:00:00Z",
                        "updated_at": "2026-10-01T00:00:00Z",
                    }
                ]
            )
            mock_t.select().eq().limit().execute.return_value = MagicMock(
                data=[
                    {
                        "id": MOCK_ISSUE_ID,
                        "team_id": MOCK_TEAM_ID,
                        "organization_id": MOCK_ORG_ID,
                        "number": 1,
                        "identifier": "ENG-1",
                        "title": "Untriaged bug report",
                        "priority": "none",
                        "state_id": "state-triage-id",
                        "creator_id": MOCK_USER_ID,
                        "sort_order": "0|h00000:",
                        "version": 1,
                        "created_at": "2026-10-01T00:00:00Z",
                        "updated_at": "2026-10-01T00:00:00Z",
                    }
                ]
            )
            mock_t.update().eq().execute.return_value = MagicMock(
                data=[
                    {
                        "id": MOCK_ISSUE_ID,
                        "team_id": MOCK_TEAM_ID,
                        "organization_id": MOCK_ORG_ID,
                        "number": 1,
                        "identifier": "ENG-1",
                        "title": "Untriaged bug report",
                        "priority": "none",
                        "state_id": MOCK_STATE_ID_1,
                        "creator_id": MOCK_USER_ID,
                        "sort_order": "0|h00000:",
                        "version": 2,
                        "created_at": "2026-10-01T00:00:00Z",
                        "updated_at": "2026-10-01T00:05:00Z",
                    }
                ]
            )
        elif table_name == "activity_logs":
            mock_t.insert().execute.return_value = MagicMock(data=[])
        return mock_t

    mock_db.table.side_effect = mock_table

    # 1. List triage issues
    res_list = client.get(f"/api/v1/teams/{MOCK_TEAM_ID}/triage")
    assert res_list.status_code == status.HTTP_200_OK
    assert len(res_list.json()) == 1

    # 2. Accept triage issue into an active workflow state
    accept_payload = {"target_state_id": MOCK_STATE_ID_1, "assignee_id": MOCK_USER_ID}
    res_accept = client.post(f"/api/v1/triage/{MOCK_ISSUE_ID}/accept", json=accept_payload)
    assert res_accept.status_code == status.HTTP_200_OK
    assert res_accept.json()["state_id"] == MOCK_STATE_ID_1

    # 3. Snooze triage issue
    snooze_payload = {"snoozed_until": "2026-10-05T00:00:00Z"}
    res_snooze = client.post(f"/api/v1/triage/{MOCK_ISSUE_ID}/snooze", json=snooze_payload)
    assert res_snooze.status_code == status.HTTP_200_OK
    assert res_snooze.json()["status"] == "snoozed"

    # 4. Decline triage issue
    decline_payload = {"reason": "Duplicate of ENG-12"}
    res_decline = client.post(f"/api/v1/triage/{MOCK_ISSUE_ID}/decline", json=decline_payload)
    assert res_decline.status_code == status.HTTP_200_OK
    assert res_decline.json()["status"] == "declined"
