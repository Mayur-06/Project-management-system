import pytest
from unittest.mock import MagicMock
from app.agents.triage_agent import triage_graph
from app.agents.breakdown_agent import breakdown_graph
from app.agents.tools.workspace_tools import (
    search_issues_tool,
    get_issue_details_tool,
    get_cycle_velocity_tool,
)


def test_triage_agent_workload_matching(mock_db):
    """Test triage state graph capacity inspection and member selection."""
    def mock_table(table_name):
        mock_t = MagicMock()
        if table_name == "team_members":
            mock_t.select().eq().execute.return_value = MagicMock(
                data=[{"user_id": "user-busy"}, {"user_id": "user-free"}]
            )
        elif table_name == "issues":
            mock_t.select().eq().in_().is_().execute.return_value = MagicMock(
                data=[
                    {
                        "assignee_id": "user-busy",
                        "state_id": "s1",
                        "workflow_states": {"category": "in_progress"},
                    },
                    {
                        "assignee_id": "user-busy",
                        "state_id": "s1",
                        "workflow_states": {"category": "in_progress"},
                    },
                ]
            )
        return mock_t

    mock_db.table.side_effect = mock_table

    state = {
        "organization_id": "org-1",
        "team_id": "team-1",
        "title": "Severe database connection timeout crash",
        "description": "500 errors occurring on high concurrency",
    }
    config = {"configurable": {"db": mock_db}}

    res = triage_graph.invoke(state, config=config)

    assert res["predicted_priority"] == "urgent"
    assert res["predicted_estimate"] == 5
    assert "bug" in res["predicted_labels"]
    assert res["predicted_assignee_id"] == "user-free"


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
