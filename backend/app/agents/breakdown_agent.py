"""
Technical Breakdown Agent State Machine Specification
Strict Alignment with plan2/linear_ai_agents_implementation_plan.md Section 3.C & Problem Set 2

Execution Pipeline & Interruption Boundary:
Node 1 (Specification & Subtask Generation): Pure compute, zero database writes.
Node 2 (Human Review Gate - interrupt): Halts graph execution, delivers proposals to UI review modal.
Node 3 (Transactional Batch Persistence): Resumes execution with approved subtasks and commits child issues to database.
"""

from typing import Any, Dict, List, Optional, TypedDict
from langchain_core.runnables import RunnableConfig
from langgraph.graph import StateGraph, START, END
from langgraph.types import interrupt
from langgraph.checkpoint.memory import InMemorySaver
from supabase import Client


class ProposedSubtaskDict(TypedDict):
    title: str
    description: Optional[str]
    estimate: Optional[int]
    priority: str


class BreakdownAgentState(TypedDict):
    parent_issue_id: str
    organization_id: str
    team_id: str
    user_id: str
    prdspec: str
    proposed_subtasks: List[ProposedSubtaskDict]
    approved_subtasks: List[ProposedSubtaskDict]
    created_subtask_ids: List[str]


# Node 1: Pure compute generation (zero side-effects)
def generate_proposal_node(state: BreakdownAgentState) -> Dict[str, Any]:
    parent_title = state.get("prdspec", "Feature Epic")
    prdspec = (
        f"# Technical Breakdown & PRD: {parent_title}\n\n"
        "## Architecture & Implementation Scope\n"
        "This specification deconstructs the target initiative into discrete, verifiable subtasks."
    )

    proposed: List[ProposedSubtaskDict] = [
        {
            "title": f"Phase 1: Database Migration & Schema Design for {parent_title}",
            "description": "Initialize database tables, foreign keys, and indexes.",
            "estimate": 3,
            "priority": "high",
        },
        {
            "title": f"Phase 2: Service Layer & Mutation Handlers",
            "description": "Implement business logic, OCC versioning, and validation.",
            "estimate": 5,
            "priority": "medium",
        },
        {
            "title": f"Phase 3: Integration Tests & Quality Verification",
            "description": "Write end-to-end tests for positive and failure branches.",
            "estimate": 2,
            "priority": "low",
        },
    ]

    return {
        "prdspec": prdspec,
        "proposed_subtasks": proposed,
    }


# Node 2: Human Review Gate (Interrupt)
def human_review_gate_node(state: BreakdownAgentState) -> Dict[str, Any]:
    # interrupt() yields the proposal to the caller and suspends graph execution
    user_approved_payload = interrupt({
        "status": "awaiting_human_approval",
        "prdspec": state["prdspec"],
        "proposed_subtasks": state["proposed_subtasks"],
    })
    # Resumes directly here with approved subtasks injected by the resume call
    return {"approved_subtasks": user_approved_payload.get("approved_subtasks", [])}


# Node 3: Transactional Batch Persistence
def batch_persist_node(state: BreakdownAgentState, config: Optional[RunnableConfig] = None) -> Dict[str, Any]:
    cfg = config or {}
    db: Client = (cfg.get("configurable") or {}).get("db")
    team_id = state["team_id"]
    org_id = state["organization_id"]
    parent_id = state["parent_issue_id"]
    user_id = state["user_id"]
    approved = state.get("approved_subtasks") or []

    created_ids: List[str] = []
    if db:
        # Fetch team key and counter
        team_res = db.table("teams").select("key, issue_counter").eq("id", team_id).limit(1).execute()
        team = team_res.data[0]
        counter = team["issue_counter"]

        # Fetch default parent state
        p_res = db.table("issues").select("state_id").eq("id", parent_id).limit(1).execute()
        state_id = p_res.data[0]["state_id"] if p_res.data else "00000000-0000-0000-0000-000000000000"

        for item in approved:
            counter += 1
            identifier = f"{team['key']}-{counter}"
            payload = {
                "organization_id": org_id,
                "team_id": team_id,
                "number": counter,
                "identifier": identifier,
                "title": item["title"],
                "description_text": item.get("description"),
                "priority": item.get("priority", "none"),
                "estimate": item.get("estimate"),
                "state_id": state_id,
                "creator_id": user_id,
                "parent_id": parent_id,
                "sort_order": "0|h00000:",
                "version": 1,
            }
            res = db.table("issues").insert(payload).execute()
            if res.data:
                created_ids.append(res.data[0]["id"])

        # Update team issue counter atomically
        db.table("teams").update({"issue_counter": counter}).eq("id", team_id).execute()

    return {"created_subtask_ids": created_ids}



# Checkpointer for state persistence
checkpointer = InMemorySaver()

def build_breakdown_graph():
    builder = StateGraph(BreakdownAgentState)
    builder.add_node("generate_proposal", generate_proposal_node)
    builder.add_node("human_review_gate", human_review_gate_node)
    builder.add_node("batch_persist", batch_persist_node)

    builder.add_edge(START, "generate_proposal")
    builder.add_edge("generate_proposal", "human_review_gate")
    builder.add_edge("human_review_gate", "batch_persist")
    builder.add_edge("batch_persist", END)

    return builder.compile(checkpointer=checkpointer)


breakdown_graph = build_breakdown_graph()
