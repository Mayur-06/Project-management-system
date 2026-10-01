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


def test_batch_update_multiple_properties(client, mock_db):
    """Batch updating statuses, assignees, and priorities across selected issues."""
    mock_db.table.side_effect = None
    mock_db.table().update().eq().execute.return_value = MagicMock(data=[])

    payload = {
        "updates": [
            {"issue_id": MOCK_ISSUE_ID, "priority": "urgent", "assignee_id": OTHER_USER_ID},
            {"issue_id": MOCK_SUBTASK_ID, "priority": "low", "state_id": MOCK_STATE_ID_2},
        ],
        "client_session_id": "batch-session-123",
    }
    res = client.post("/api/v1/issues/batch-update", json=payload)
    assert res.status_code == status.HTTP_200_OK
    assert len(res.json()) == 2


# ==============================================================================
# Domain 3: Comments & Permission Scenarios
# ==============================================================================

def test_comment_not_found_on_reaction_raises_404(client, mock_db):
    """Toggling a reaction on an un-existing comment raises 404."""
    def mock_table(table_name):
        mock_t = MagicMock()
        if table_name == "issue_comments":
            mock_t.select().eq().is_().limit().execute.return_value = MagicMock(data=[])
        return mock_t

    mock_db.table.side_effect = mock_table
    res = client.post(f"/api/v1/comments/{MOCK_COMMENT_ID}/reactions", json={"emoji": "🚀"})
    assert res.status_code == status.HTTP_404_NOT_FOUND


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
# Domain 4: Cycles & Sprint Rollover Scenarios
# ==============================================================================

def test_complete_cycle_invalid_destination_raises_400(client, mock_db):
    """Specifying an unknown cycle ID for sprint rollover rejects with 400 Bad Request."""
    def mock_table(table_name):
        mock_t = MagicMock()
        if table_name == "cycles":
            def mock_eq(field, val):
                inner_mock = MagicMock()
                if val == MOCK_CYCLE_ID:
                    inner_mock.limit().execute.return_value = MagicMock(
                        data=[{
                            "id": MOCK_CYCLE_ID,
                            "team_id": MOCK_TEAM_ID,
                            "number": 5,
                            "name": "Sprint 5",
                            "starts_at": "2026-10-01T00:00:00Z",
                            "ends_at": "2026-10-15T00:00:00Z",
                            "created_at": "2026-10-01T00:00:00Z",
                        }]
                    )
                else:
                    inner_mock.limit().execute.return_value = MagicMock(data=[])
                return inner_mock
            mock_t.select().eq = mock_eq
        elif table_name == "teams":
            mock_t.select().eq().limit().execute.return_value = MagicMock(
                data=[{"id": MOCK_TEAM_ID, "organization_id": MOCK_ORG_ID}]
            )
        elif table_name == "workspace_members":
            mock_t.select().eq().eq().limit().execute.return_value = MagicMock(data=[{"id": "m1"}])
        return mock_t

    mock_db.table.side_effect = mock_table
    res = client.post(f"/api/v1/cycles/{MOCK_CYCLE_ID}/complete", json={"destination": "non-existent-cycle-id"})
    assert res.status_code == status.HTTP_400_BAD_REQUEST


def test_complete_cycle_transfer_to_next_cycle(client, mock_db):
    """Closing cycle and rolling over incomplete tasks directly to next upcoming cycle."""
    def mock_table(table_name):
        mock_t = MagicMock()
        if table_name == "cycles":
            def mock_eq(field, val):
                inner_mock = MagicMock()
                if val == MOCK_CYCLE_ID:
                    inner_mock.limit().execute.return_value = MagicMock(
                        data=[{
                            "id": MOCK_CYCLE_ID,
                            "team_id": MOCK_TEAM_ID,
                            "number": 5,
                            "name": "Sprint 5",
                            "starts_at": "2026-10-01T00:00:00Z",
                            "ends_at": "2026-10-15T00:00:00Z",
                            "created_at": "2026-10-01T00:00:00Z",
                        }]
                    )
                else:
                    inner_mock.limit().execute.return_value = MagicMock(
                        data=[{
                            "id": MOCK_NEXT_CYCLE_ID,
                            "team_id": MOCK_TEAM_ID,
                            "number": 6,
                            "name": "Sprint 6",
                            "starts_at": "2026-10-16T00:00:00Z",
                            "ends_at": "2026-10-30T00:00:00Z",
                            "created_at": "2026-10-01T00:00:00Z",
                        }]
                    )
                return inner_mock
            mock_t.select().eq = mock_eq
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
                        "id": MOCK_ISSUE_ID,
                        "state_id": MOCK_STATE_ID_1,
                        "workflow_states": {"category": "unstarted"},
                    }
                ]
            )
            mock_t.update().in_().execute.return_value = MagicMock(data=[])
        elif table_name == "activity_logs":
            mock_t.insert().execute.return_value = MagicMock(data=[])
        return mock_t

    mock_db.table.side_effect = mock_table
    res = client.post(f"/api/v1/cycles/{MOCK_CYCLE_ID}/complete", json={"destination": MOCK_NEXT_CYCLE_ID})
    assert res.status_code == status.HTTP_200_OK
    assert res.json()["transferred_issues_count"] == 1
    assert res.json()["destination"] == MOCK_NEXT_CYCLE_ID


# ==============================================================================
# Domain 5: Projects & Milestones Scenarios
# ==============================================================================

def test_project_slug_collision_in_same_org_raises_409(client, mock_db):
    """Creating a project with a slug that already exists in the organization raises 409 Conflict."""
    def mock_table(table_name):
        mock_t = MagicMock()
        if table_name == "organizations":
            mock_t.select().eq().limit().execute.return_value = MagicMock(
                data=[{"id": MOCK_ORG_ID, "slug": "acme"}]
            )
        elif table_name == "workspace_members":
            mock_t.select().eq().eq().limit().execute.return_value = MagicMock(data=[{"id": "m1"}])
        elif table_name == "projects":
            mock_t.select().eq().eq().limit().execute.return_value = MagicMock(
                data=[{"id": "p-1", "slug": "core-platform"}]
            )
        return mock_t

    mock_db.table.side_effect = mock_table
    payload = {"name": "Core Platform", "slug": "core-platform"}
    res = client.post("/api/v1/organizations/acme/projects", json=payload)
    assert res.status_code == status.HTTP_409_CONFLICT


def test_milestone_update_target_date_and_name(client, mock_db):
    """Updating milestone name and deadline checkpoint."""
    def mock_table(table_name):
        mock_t = MagicMock()
        if table_name == "project_milestones":
            mock_t.select().eq().limit().execute.return_value = MagicMock(
                data=[
                    {
                        "id": MOCK_MILESTONE_ID,
                        "project_id": MOCK_PROJECT_ID,
                        "name": "Beta Testing",
                        "target_date": "2026-10-15",
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
                        "name": "Public Release Candidate",
                        "target_date": "2026-10-20",
                        "completed_at": None,
                        "sort_order": "0|h00000:",
                        "created_at": "2026-10-01T00:00:00Z",
                    }
                ]
            )
        elif table_name == "projects":
            mock_t.select().eq().limit().execute.return_value = MagicMock(
                data=[{"id": MOCK_PROJECT_ID, "organization_id": MOCK_ORG_ID}]
            )
        elif table_name == "workspace_members":
            mock_t.select().eq().eq().limit().execute.return_value = MagicMock(data=[{"id": "m1"}])
        return mock_t

    mock_db.table.side_effect = mock_table
    payload = {"name": "Public Release Candidate", "target_date": "2026-10-20"}
    res = client.patch(f"/api/v1/milestones/{MOCK_MILESTONE_ID}", json=payload)
    assert res.status_code == status.HTTP_200_OK
    assert res.json()["name"] == "Public Release Candidate"
    assert res.json()["target_date"] == "2026-10-20"


# ==============================================================================
# Domain 6: Triage Routing Scenarios
# ==============================================================================

def test_triage_empty_when_all_issues_snoozed(client, mock_db):
    """Triage queue ignores issues whose snooze timestamps are in the future."""
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
            # Future snoozed issue
            mock_t.select().eq().eq().is_().order().execute.return_value = MagicMock(
                data=[
                    {
                        "id": MOCK_ISSUE_ID,
                        "team_id": MOCK_TEAM_ID,
                        "organization_id": MOCK_ORG_ID,
                        "number": 99,
                        "identifier": "ENG-99",
                        "title": "Future snoozed item",
                        "priority": "none",
                        "state_id": "state-triage-id",
                        "creator_id": MOCK_USER_ID,
                        "sort_order": "0|h00000:",
                        "version": 1,
                        "snoozed_until": "2099-01-01T00:00:00Z",
                        "created_at": "2026-10-01T00:00:00Z",
                        "updated_at": "2026-10-01T00:00:00Z",
                    }
                ]
            )
        return mock_t

    mock_db.table.side_effect = mock_table
    res = client.get(f"/api/v1/teams/{MOCK_TEAM_ID}/triage")
    assert res.status_code == status.HTTP_200_OK
    assert len(res.json()) == 0


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


# ==============================================================================
# Domain 8: AI Fleet & HITL Edge Cases
# ==============================================================================

def test_breakdown_resume_with_invalid_thread_raises_404(client):
    """Attempting to resume an expired or non-existent AI breakdown thread raises 404."""
    payload = {
        "thread_id": "non-existent-thread-id",
        "approved_subtasks": [{"title": "Subtask A"}],
    }
    res = client.post("/api/v1/ai/breakdown/resume", json=payload)
    assert res.status_code == status.HTTP_404_NOT_FOUND


def test_duplicate_check_title_too_short_raises_422(client):
    """Submitting titles shorter than debounce minimum (10 characters) rejects with 422."""
    payload = {
        "organization_id": MOCK_ORG_ID,
        "title": "Bug",  # Too short
    }
    res = client.post("/api/v1/ai/duplicates/check", json=payload)
    assert res.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
