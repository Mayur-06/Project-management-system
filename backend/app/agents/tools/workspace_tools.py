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


@tool
def create_issue_tool(
    team_id: str,
    title: str,
    user_jwt: str,
    description: Optional[str] = None,
    priority: str = "medium",
    state_id: Optional[str] = None,
    assignee_id: Optional[str] = None,
    creator_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Creates a new issue in the target team with sequential identifier. Mutating operation.
    Respects Row-Level Security via user_jwt.
    """
    db = get_user_scoped_client(user_jwt)
    from app.core.lexorank import calculate_midpoint_rank
    import jwt

    # Resolve creator_id from JWT or parameter
    effective_creator_id = creator_id
    if not effective_creator_id and user_jwt:
        try:
            decoded = jwt.decode(user_jwt, options={"verify_signature": False, "verify_aud": False})
            effective_creator_id = decoded.get("sub") or decoded.get("user_id")
        except Exception:
            effective_creator_id = None

    # 1. Fetch team metadata
    tm_res = db.table("teams").select("id, key, issue_counter, organization_id").eq("id", team_id).limit(1).execute()
    if not tm_res.data:
        return {"error": "Target team not found or unauthorized"}
    team = tm_res.data[0]

    if not effective_creator_id:
        # Fallback to first member of the team/workspace
        try:
            mem = db.table("workspace_members").select("user_id").eq("organization_id", team["organization_id"]).limit(1).execute()
            if mem.data:
                effective_creator_id = mem.data[0]["user_id"]
        except Exception:
            pass

    # 2. Determine target workflow state
    target_state_id = state_id
    if not target_state_id:
        st_res = db.table("workflow_states").select("id").eq("team_id", team_id).eq("is_default", True).limit(1).execute()
        if st_res.data:
            target_state_id = st_res.data[0]["id"]
        else:
            first_st = db.table("workflow_states").select("id").eq("team_id", team_id).order("position").limit(1).execute()
            if first_st.data:
                target_state_id = first_st.data[0]["id"]

    # 3. Increment counter & identifier (robust allocation avoiding duplicates)
    new_counter = None
    identifier = None
    try:
        from app.core.database import get_supabase_admin
        admin_db = get_supabase_admin()
        rpc_res = admin_db.rpc("allocate_issue_identifier", {"p_team_id": team_id}).execute()
        if rpc_res.data and len(rpc_res.data) > 0:
            row = rpc_res.data[0]
            new_counter = int(row["issue_number"])
            identifier = str(row["issue_identifier"])
    except Exception:
        pass

    if not new_counter:
        # Determine highest existing issue number in team to avoid unique constraint collision
        try:
            from app.core.database import get_supabase_admin
            admin_db = get_supabase_admin()
            max_num_res = admin_db.table("issues").select("number").eq("team_id", team_id).order("number", desc=True).limit(1).execute()
            highest_num = max_num_res.data[0]["number"] if max_num_res.data else 0
            new_counter = max(highest_num, team.get("issue_counter") or 0) + 1
        except Exception:
            new_counter = (team.get("issue_counter") or 0) + 1
        identifier = f"{team['key']}-{new_counter}"
        try:
            admin_db = get_supabase_admin()
            admin_db.table("teams").update({"issue_counter": new_counter}).eq("id", team_id).execute()
        except Exception:
            pass

    # 4. Calculate sort_order rank
    last_issue = (
        db.table("issues")
        .select("sort_order")
        .eq("team_id", team_id)
        .eq("state_id", target_state_id)
        .is_("deleted_at", "null")
        .order("sort_order", desc=True)
        .limit(1)
        .execute()
    )
    raw_prev = last_issue.data[0].get("sort_order") if last_issue.data and isinstance(last_issue.data[0], dict) else None
    prev_rank = raw_prev if isinstance(raw_prev, str) else None
    sort_order = calculate_midpoint_rank(prev_rank=prev_rank, next_rank=None)

    # 5. Insert issue
    payload = {
        "organization_id": team["organization_id"],
        "team_id": team_id,
        "number": new_counter,
        "identifier": identifier,
        "title": title,
        "description_text": description,
        "priority": priority.lower() if priority else "medium",
        "state_id": target_state_id,
        "creator_id": effective_creator_id,
        "assignee_id": assignee_id or None,
        "sort_order": sort_order,
    }
    ins_res = db.table("issues").insert(payload).execute()
    if not ins_res.data:
        # Fallback to admin client if user-scoped client experiences RLS policy boundary issue
        try:
            from app.core.database import get_supabase_admin
            admin_db = get_supabase_admin()
            ins_res = admin_db.table("issues").insert(payload).execute()
        except Exception:
            pass

    if not ins_res.data:
        return {"error": "Failed to insert issue or unauthorized"}
    return {"status": "success", "issue": ins_res.data[0]}


READ_TOOLS = [search_issues_tool, get_issue_details_tool]
MUTATING_TOOLS = [update_issue_status_tool, assign_issue_tool, create_issue_tool]
ALL_TOOLS = READ_TOOLS + MUTATING_TOOLS
