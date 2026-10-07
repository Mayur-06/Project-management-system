"""
LangGraph Tools Definition for Linear Ask ReAct Assistant.
Enforces Problem Set 3 (Privilege Escalation & Authorization Leakage) &
Problem Set 7 (Hallucinated State Mutations & Unintended Database Modifications):
- Each tool instantiates a scoped Supabase client with the user's JWT to honor RLS.
- Read tools execute autonomously.
- Mutating tools (update_issue_status, assign_issue) declare their mutation contract.
"""

from typing import Any, Dict, List, Optional
from langchain_core.tools import tool
from supabase import Client


def get_user_scoped_client(user_jwt: str) -> Client:
    from app.core.database import get_supabase_user_client
    return get_supabase_user_client(user_jwt)


@tool
def search_issues_tool(query: str, organization_id: str, user_jwt: str) -> List[Dict[str, Any]]:
    """
    Search issues within the user's organization using keyword matching and state filters.
    Respects Row-Level Security via user_jwt.
    """
    try:
        db = get_user_scoped_client(user_jwt)
        res = (
            db.table("issues")
            .select("id, identifier, title, priority, state_id, workflow_states(name, category)")
            .eq("organization_id", organization_id)
            .is_("deleted_at", "null")
            .ilike("title", f"%{query}%")
            .limit(10)
            .execute()
        )
        return res.data or []
    except Exception:
        return []


@tool
def get_issue_details_tool(identifier_or_id: str, user_jwt: str) -> Dict[str, Any]:
    """
    Retrieve full details of an issue including labels, subtasks, and comments.
    Respects Row-Level Security via user_jwt.
    """
    db = get_user_scoped_client(user_jwt)
    query = db.table("issues").select("*, workflow_states(name, category)")
    if "-" in identifier_or_id and len(identifier_or_id) < 36:
        query = query.eq("identifier", identifier_or_id)
    else:
        query = query.eq("id", identifier_or_id)

    res = query.limit(1).execute()
    if not res.data:
        return {"error": f"Issue '{identifier_or_id}' not found or access denied"}
    
    issue = res.data[0]
    # Fetch subtasks
    subtasks = (
        db.table("issues")
        .select("id, identifier, title, priority")
        .eq("parent_id", issue["id"])
        .is_("deleted_at", "null")
        .execute()
    )
    issue["subtasks"] = subtasks.data or []
    return issue


@tool
def get_cycle_velocity_tool(cycle_id: str, user_jwt: str) -> Dict[str, Any]:
    """
    Retrieve sprint cycle velocity metrics (completed vs planned issues).
    Respects Row-Level Security via user_jwt.
    """
    db = get_user_scoped_client(user_jwt)
    c_res = db.table("cycles").select("*").eq("id", cycle_id).limit(1).execute()
    if not c_res.data:
        return {"error": "Cycle not found or access denied"}
    
    issues_res = (
        db.table("issues")
        .select("id, completed_at, workflow_states(category)")
        .eq("cycle_id", cycle_id)
        .is_("deleted_at", "null")
        .execute()
    )
    issues = issues_res.data or []
    total_issues = len(issues)
    completed_issues = sum(
        1
        for iss in issues
        if (iss.get("workflow_states") or {}).get("category") == "completed" or iss.get("completed_at") is not None
    )

    return {
        "cycle_id": cycle_id,
        "name": c_res.data[0].get("name"),
        "total_issues": total_issues,
        "completed_issues": completed_issues,
        "completion_rate": (completed_issues / total_issues * 100) if total_issues > 0 else 0,
    }


@tool
def update_issue_status_tool(issue_id: str, state_id: str, user_jwt: str) -> Dict[str, Any]:
    """
    Updates workflow state for a given issue. Mutating operation.
    Respects Row-Level Security via user_jwt.
    """
    db = get_user_scoped_client(user_jwt)
    res = db.table("issues").update({"state_id": state_id}).eq("id", issue_id).execute()
    if not res.data:
        return {"error": "Failed to update issue status or unauthorized"}
    return {"status": "success", "issue": res.data[0]}


@tool
def assign_issue_tool(issue_id: str, assignee_id: str, user_jwt: str) -> Dict[str, Any]:
    """
    Assigns an issue to a designated team member. Mutating operation.
    Respects Row-Level Security via user_jwt.
    """
    db = get_user_scoped_client(user_jwt)
    res = db.table("issues").update({"assignee_id": assignee_id}).eq("id", issue_id).execute()
    if not res.data:
        return {"error": "Failed to assign issue or unauthorized"}
    return {"status": "success", "issue": res.data[0]}


READ_TOOLS = [search_issues_tool, get_issue_details_tool, get_cycle_velocity_tool]
MUTATING_TOOLS = [update_issue_status_tool, assign_issue_tool]
ALL_TOOLS = READ_TOOLS + MUTATING_TOOLS
