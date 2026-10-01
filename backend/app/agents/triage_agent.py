"""
Triage Agent State Machine Specification
Strict Alignment with plan2/linear_ai_agents_implementation_plan.md Section 3.B

Workflow Sequence:
1. Inbound Issue Payload ->
2. Phase 1: Fetch Team Capacity & Active Workloads ->
3. Phase 2: LLM Classification & Parameter Sizing ->
4. Phase 3: Workload-Aware Assignee Matching ->
5. Phase 4: Structured Result Persistence & Return
"""

from typing import Any, Dict, List, Optional, TypedDict
from langchain_core.runnables import RunnableConfig
from langgraph.graph import StateGraph, START, END
from supabase import Client


class TriageAgentState(TypedDict):
    organization_id: str
    team_id: str
    title: str
    description: Optional[str]
    team_workloads: Dict[str, Any]
    predicted_priority: str
    predicted_estimate: Optional[int]
    predicted_labels: List[str]
    predicted_assignee_id: Optional[str]
    rationale: str


# Node 1: Fetch Team Capacity & Active Workloads
def fetch_capacity_node(state: TriageAgentState, config: Optional[RunnableConfig] = None) -> Dict[str, Any]:
    cfg = config or {}
    db: Client = (cfg.get("configurable") or {}).get("db")
    team_id = state["team_id"]

    # 1. Fetch team members
    workload_map: Dict[str, int] = {}
    if db:
        tm_res = db.table("team_members").select("user_id").eq("team_id", team_id).execute()
        members = [m["user_id"] for m in (tm_res.data or [])]

        # 2. Inspect active sprint open tickets count per member
        workload_map = {uid: 0 for uid in members}
        if members:
            issues_res = (
                db.table("issues")
                .select("assignee_id, state_id, workflow_states(category)")
                .eq("team_id", team_id)
                .in_("assignee_id", members)
                .is_("deleted_at", "null")
                .execute()
            )
            for iss in (issues_res.data or []):
                cat = (iss.get("workflow_states") or {}).get("category")
                if cat not in ("completed", "canceled"):
                    uid = iss.get("assignee_id")
                    if uid in workload_map:
                        workload_map[uid] += 1

    return {"team_workloads": workload_map}


# Node 2: LLM Classification & Sizing
def llm_classify_node(state: TriageAgentState, config: Optional[RunnableConfig] = None) -> Dict[str, Any]:
    import json
    from app.core.ai_client import generate_llm_completion

    # Try structured LLM classification first if GEMINI_API_KEY is configured
    prompt = (
        f"You are a technical lead doing issue triage.\n"
        f"Issue Title: {state['title']}\n"
        f"Issue Description: {state.get('description') or ''}\n\n"
        f"Classify this issue and return STRICT JSON with these keys:\n"
        f"- priority: one of ['urgent', 'high', 'medium', 'low', 'none']\n"
        f"- estimate: integer Fibonacci points [1, 2, 3, 5, 8]\n"
        f"- labels: list of string tags (e.g. ['bug', 'frontend', 'security'])\n"
        f"- rationale: concise diagnostic rationale string\n"
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
            return {
                "predicted_priority": data.get("priority", "medium").lower(),
                "predicted_estimate": int(data.get("estimate", 3)),
                "predicted_labels": list(data.get("labels", [])),
                "rationale": data.get("rationale", "Triaged via Gemini AI."),
            }
        except Exception:
            pass

    # Structured heuristics adhering to plan2 rules (falls back gracefully without billing)
    title_lower = state["title"].lower()
    desc_lower = (state.get("description") or "").lower()
    combined = f"{title_lower} {desc_lower}"

    if any(k in combined for k in ("crash", "blocker", "critical", "outage", "down")):
        priority = "urgent"
        estimate = 5
        labels = ["bug", "critical"]
        rationale = "Issue indicates severe service blockage or crash impact requiring immediate attention."
    elif any(k in combined for k in ("slow", "performance", "lag", "latency", "memory")):
        priority = "high"
        estimate = 3
        labels = ["performance"]
        rationale = "Performance degradation detected from reported symptoms."
    elif any(k in combined for k in ("auth", "security", "permission", "leak")):
        priority = "high"
        estimate = 5
        labels = ["security", "auth"]
        rationale = "Security or access control consideration requiring senior triage."
    elif any(k in combined for k in ("feature", "add", "implement", "create")):
        priority = "medium"
        estimate = 5
        labels = ["feature"]
        rationale = "Standard product enhancement request categorized with median complexity."
    else:
        priority = "low"
        estimate = 2
        labels = ["chore"]
        rationale = "Routine maintenance or minor adjustment."

    return {
        "predicted_priority": priority,
        "predicted_estimate": estimate,
        "predicted_labels": labels,
        "rationale": rationale,
    }


# Node 3: Workload-Aware Assignee Matching
def assignee_matching_node(state: TriageAgentState) -> Dict[str, Any]:
    workloads = state.get("team_workloads") or {}
    if not workloads:
        return {"predicted_assignee_id": None}

    # Pick candidate with the lowest active workload (least tickets in sprint)
    best_candidate = min(workloads.keys(), key=lambda uid: workloads[uid])
    return {"predicted_assignee_id": best_candidate}


def build_triage_graph():
    builder = StateGraph(TriageAgentState)
    builder.add_node("fetch_capacity", fetch_capacity_node)
    builder.add_node("classify", llm_classify_node)
    builder.add_node("match_assignee", assignee_matching_node)

    builder.add_edge(START, "fetch_capacity")
    builder.add_edge("fetch_capacity", "classify")
    builder.add_edge("classify", "match_assignee")
    builder.add_edge("match_assignee", END)

    return builder.compile()


triage_graph = build_triage_graph()
