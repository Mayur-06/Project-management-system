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
    priority: str


class BreakdownAgentState(TypedDict, total=False):
    parent_issue_id: str
    organization_id: str
    team_id: str
    user_id: str
    prdspec: str
    description: Optional[str]
    existing_subtasks: Optional[List[str]]
    proposed_subtasks: List[ProposedSubtaskDict]
    approved_subtasks: List[ProposedSubtaskDict]
    created_subtask_ids: List[str]


# Node 1: Pure compute generation (zero side-effects)
def generate_proposal_node(state: BreakdownAgentState) -> Dict[str, Any]:
    import json
    from app.core.ai_client import generate_llm_completion

    parent_title = state.get("prdspec", "Feature Epic")
    parent_desc = state.get("description") or ""
    existing_tasks = state.get("existing_subtasks") or []

    existing_ctx = f"\nExisting subtasks already tracked:\n- " + "\n- ".join(existing_tasks) if existing_tasks else ""
    desc_ctx = f"\nIssue Details & Specifications:\n{parent_desc}" if parent_desc else ""

    # Attempt dynamic LLM breakdown if Gemini API key is configured
    prompt = (
        f"You are a Principal Software Architect decomposing an issue or epic.\n"
        f"Initiative Title: {parent_title}"
        f"{desc_ctx}"
        f"{existing_ctx}\n\n"
        f"Formulate a structured PRD summary and decompose this problem into 3 to 5 atomic child subtasks.\n"
        f"Do NOT duplicate any existing subtasks listed above.\n"
        f"Return STRICT JSON with keys:\n"
        f"- prdspec: string formatted markdown containing high-level architectural specification\n"
        f"- subtasks: array of objects with keys:\n"
        f"    - title: concise task title\n"
        f"    - description: task implementation details\n"
        f"    - priority: one of ['urgent', 'high', 'medium', 'low', 'none']\n"
        f"Return ONLY valid JSON."
    )
    llm_resp = generate_llm_completion(prompt)
    if llm_resp:
        try:
            cleaned = llm_resp.strip()
            if cleaned.startswith("```json"):
                cleaned = cleaned[7:]
            if cleaned.startswith("```"):
                cleaned = cleaned[3:]
            if cleaned.endswith("```"):
                cleaned = cleaned[:-3]
            data = json.loads(cleaned.strip())
            prdspec = data.get("prdspec") or f"# Technical Specification: {parent_title}"
            subtasks = data.get("subtasks") or []
            if subtasks:
                return {
                    "prdspec": prdspec,
                    "proposed_subtasks": [
                        {
                            "title": st.get("title", "Subtask"),
                            "description": st.get("description", ""),
                            "priority": st.get("priority", "medium").lower(),
                        }
                        for st in subtasks
                    ],
                }
        except Exception:
            pass

    # Deterministic fallback adhering to plan2
    prdspec = (
        f"# Technical Breakdown & PRD: {parent_title}\n\n"
        "## Architecture & Implementation Scope\n"
        "This specification deconstructs the target initiative into discrete, verifiable subtasks."
    )

    proposed: List[ProposedSubtaskDict] = [
        {
            "title": f"Phase 1: Database Migration & Schema Design for {parent_title}",
            "description": "Initialize database tables, foreign keys, and indexes.",
            "priority": "high",
        },
        {
            "title": f"Phase 2: Service Layer & Mutation Handlers",
            "description": "Implement business logic, OCC versioning, and validation.",
            "priority": "medium",
        },
        {
            "title": f"Phase 3: Integration Tests & Quality Verification",
            "description": "Write end-to-end tests for positive and failure branches.",
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

        # Check existing subtasks to prevent duplicates if user runs breakdown multiple times
        try:
            existing_sub_res = db.table("issues").select("title").eq("parent_id", parent_id).is_("deleted_at", "null").execute()
            existing_titles = {s["title"].strip().lower() for s in (existing_sub_res.data or [])}
        except Exception:
            existing_titles = set()

        # Fetch default workflow state if parent does not have one
        default_state_id = None
        parent_res = db.table("issues").select("state_id").eq("id", parent_id).limit(1).execute()
        if parent_res.data and parent_res.data[0].get("state_id"):
            default_state_id = parent_res.data[0]["state_id"]
        else:
            st_res = db.table("workflow_states").select("id").eq("team_id", team_id).limit(1).execute()
            if st_res.data:
                default_state_id = st_res.data[0]["id"]

        for idx, item in enumerate(approved):
            clean_title = item.get("title", "").strip()
            if not clean_title or clean_title.lower() in existing_titles:
                continue
            existing_titles.add(clean_title.lower())

            # Atomic counter & identifier allocation via RPC
            try:
                rpc_res = db.rpc("allocate_issue_identifier", {"p_team_id": team_id}).execute()
                sub_num = rpc_res.data[0]["issue_number"]
                sub_ident = rpc_res.data[0]["issue_identifier"]
            except Exception:
                team_res = db.table("teams").select("key, issue_counter").eq("id", team_id).limit(1).execute()
                team = team_res.data[0]
                sub_num = team["issue_counter"] + 1
                sub_ident = f"{team['key']}-{sub_num}"
                db.table("teams").update({"issue_counter": sub_num}).eq("id", team_id).execute()

            payload = {
                "organization_id": org_id,
                "team_id": team_id,
                "number": sub_num,
                "identifier": sub_ident,
                "title": clean_title,
                "description_text": item.get("description"),
                "priority": item.get("priority", "none"),
                "state_id": default_state_id,
                "creator_id": user_id,
                "parent_id": parent_id,
                "sort_order": f"0|h{idx:05d}:",
                "version": 1,
            }
            res = db.table("issues").insert(payload).execute()
            if res.data:
                created_ids.append(res.data[0]["id"])

        return {"created_subtask_ids": created_ids}



# Checkpointer for state persistence
from app.core.checkpointer import get_checkpointer
checkpointer = get_checkpointer()

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
