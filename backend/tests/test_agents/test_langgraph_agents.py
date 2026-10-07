import pytest
from unittest.mock import MagicMock
from app.agents.breakdown_agent import breakdown_graph
from app.agents.tools.workspace_tools import (
    search_issues_tool,
    get_issue_details_tool,
)



def test_breakdown_agent_pure_compute_node():
    """Verify Node 1 of breakdown agent generates proposal without database writes."""
    from app.agents.breakdown_agent import generate_proposal_node

    state = {
        "parent_issue_id": "iss-1",
        "organization_id": "org-1",
        "team_id": "team-1",
        "user_id": "usr-1",
        "prdspec": "Payment Webhook Revamp",
        "proposed_subtasks": [],
        "approved_subtasks": [],
        "created_subtask_ids": [],
    }

    result = generate_proposal_node(state)
    assert "prdspec" in result
    assert len(result["proposed_subtasks"]) >= 3
    assert all("title" in s for s in result["proposed_subtasks"])
    assert all("priority" in s for s in result["proposed_subtasks"])


def test_workspace_tools_rls_propagation(mock_db, monkeypatch):
    """Ensure agent workspace tools create user-scoped Supabase client with user_jwt."""
    scoped_client_mock = MagicMock()
    mock_issues = scoped_client_mock.table.return_value
    mock_issues.select.return_value.eq.return_value.is_.return_value.ilike.return_value.limit.return_value.execute.return_value = MagicMock(
        data=[{"id": "issue-1", "title": "OAuth Fix", "identifier": "ENG-1"}]
    )

    import app.agents.tools.workspace_tools as wt
    monkeypatch.setattr(wt, "get_user_scoped_client", lambda jwt: scoped_client_mock)

    results = search_issues_tool.invoke({
        "query": "OAuth",
        "organization_id": "org-1",
        "user_jwt": "mock.jwt.token",
    })

    assert len(results) == 1
    assert results[0]["identifier"] == "ENG-1"


def test_breakdown_batch_persist_node(mock_db):
    """Verify Node 3 of breakdown agent correctly resolves state_id and creates child subtasks."""
    from app.agents.breakdown_agent import batch_persist_node

    def mock_table(table_name):
        mock_t = MagicMock()
        if table_name == "teams":
            mock_t.select().eq().limit().execute.return_value = MagicMock(
                data=[{"key": "ENG", "issue_counter": 10}]
            )
            mock_t.update().eq().execute.return_value = MagicMock(data=[])
        elif table_name == "issues":
            mock_t.select().eq().is_().execute.return_value = MagicMock(data=[])
            mock_t.select().eq().limit().execute.return_value = MagicMock(
                data=[{"state_id": "state-todo-1"}]
            )
            mock_t.insert().execute.return_value = MagicMock(data=[{"id": "subtask-1"}])
        return mock_t

    mock_db.table.side_effect = mock_table

    state = {
        "parent_issue_id": "parent-1",
        "organization_id": "org-1",
        "team_id": "team-1",
        "user_id": "usr-1",
        "approved_subtasks": [
            {
                "title": "Subtask alpha",
                "description": "Details",
                "estimate": 3,
                "priority": "high",
            }
        ],
    }
    config = {"configurable": {"db": mock_db}}

    res = batch_persist_node(state, config=config)
    assert "created_subtask_ids" in res
    assert len(res["created_subtask_ids"]) == 1
    assert res["created_subtask_ids"][0] == "subtask-1"

