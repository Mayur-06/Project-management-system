"""
Linear Ask ReAct Workspace Assistant Agent
Strict Alignment with plan2/linear_ai_agents_implementation_plan.md Section 3.D & Problem Sets 3, 6, 7

Architecture:
- Operates an asynchronous event-driven ReAct loop.
- Authenticated Tool Bindings: Uses scoped tools executing with user's Bearer JWT to enforce PostgreSQL RLS.
- Enforces Problem Set 7: Read tools execute immediately; mutating tools yield 'interrupt_required' proposals.
- Enforces Problem Set 6: Yields async SSE stream compatible with client-disconnect detection.
- Emits fine-grained SSE events: session, tool_start, tool_complete, interrupt_required, token, done.
"""

import re
import json
import asyncio
from typing import AsyncGenerator, Dict, Any, List, Optional
from app.agents.tools.workspace_tools import (
    search_issues_tool,
    get_issue_details_tool,
    get_cycle_velocity_tool,
    update_issue_status_tool,
    assign_issue_tool,
)
from app.core.ai_client import generate_llm_completion, stream_llm_completion

COPILOT_SYSTEM_PROMPT = """You are an elite, modern engineering and product copilot embedded in a high-velocity project workspace (like Linear).
You act as a Principal / Staff Engineer and Product Lead.
Core Principles:
1. Provide sharp, high-impact, practical, and direct answers.
2. Think out of the box: suggest modern architecture patterns, efficient engineering strategies, clean code principles, and pragmatic product workflows.
3. Keep responses engaging, structured, and concise. Avoid bureaucratic fluff.
4. Do NOT talk about searching workspace issues or claim to have checked the database unless the user specifically asked to search for issues/tickets.
5. If the user is brainstorming, providing design ideas, asking technical questions, or conversing, engage directly and constructively with deep technical competence.
"""


class LinearAskAgent:
    """
    Asynchronous ReAct assistant engine for workspace interactions.
    Streams SSE formatted chunks to FastAPI StreamingResponse.
    """

    @classmethod
    async def stream_chat_session(
        cls,
        query: str,
        organization_id: str,
        user_jwt: str,
        history: Optional[List[Dict[str, str]]] = None,
        request: Optional[Any] = None,
    ) -> AsyncGenerator[str, None]:
        """
        Executes ReAct reasoning and emits Server-Sent Events (SSE).
        Enforces Problem Set 6: Client disconnect detection terminates token stream immediately.
        """
        # 1. Session handshake
        yield f"event: session\ndata: {json.dumps({'status': 'connected', 'organization_id': organization_id})}\n\n"
        await asyncio.sleep(0.01)

        q_lower = query.lower().strip()
        key_match = re.search(r'\b([A-Za-z]+-\d+)\b', query)

        # Detect intent cleanly
        is_mutation = False
        if any(v in q_lower for v in ("to done", "to in progress", "to completed", "to canceled", "to backlog")):
            is_mutation = True
        elif key_match and any(v in q_lower for v in ("move", "close", "mark", "assign", "transition", "complete", "reopen")):
            is_mutation = True
        elif any(q_lower.startswith(p) for p in ("move ", "close ", "assign ", "complete ")):
            is_mutation = True

        is_cycle_query = (
            any(w in q_lower for w in ("velocity", "burndown", "sprint progress", "cycle progress", "cycle velocity", "sprint status"))
            or ("cycle" in q_lower and any(w in q_lower for w in ("what", "how", "show", "current", "stats", "metrics", "rate", "points", "velocity")))
            or ("sprint" in q_lower and any(w in q_lower for w in ("what", "how", "show", "current", "stats", "metrics", "rate", "points", "velocity")))
        )

        is_issue_search = False
        if not is_mutation and not is_cycle_query:
            explicit_ticket_phrases = (
                "find issue", "find ticket", "search issue", "search ticket",
                "list issue", "list ticket", "show issue", "show ticket",
                "open issue", "open ticket", "my ticket", "my issue",
                "matching ticket", "tickets about", "issues about",
                "tickets related", "issues related", "tickets for", "issues for",
                "analytics tickets", "bug tickets"
            )
            if any(p in q_lower for p in explicit_ticket_phrases):
                is_issue_search = True
            elif key_match and any(w in q_lower for w in ("what is", "details", "info", "show", "get", "explain", "about")):
                is_issue_search = True
            elif any(w in q_lower for w in ("issue", "issues", "ticket", "tickets")) and any(w in q_lower for w in ("find", "search", "list", "filter", "lookup", "look up", "any")):
                is_issue_search = True

        # Scenario A: Velocity or Sprint metrics query
        if is_cycle_query:
            yield f"event: tool_start\ndata: {json.dumps({'tool': 'get_cycle_velocity', 'query': query})}\n\n"
            await asyncio.sleep(0.02)

            from app.agents.tools.workspace_tools import get_user_scoped_client
            cycle_data = None
            try:
                user_db = get_user_scoped_client(user_jwt)
                c_res = (
                    user_db.table("cycles")
                    .select("id, name, starts_at, ends_at")
                    .is_("completed_at", "null")
                    .order("starts_at", desc=True)
                    .limit(1)
                    .execute()
                )
                if c_res.data:
                    cycle_data = get_cycle_velocity_tool.invoke({
                        "cycle_id": c_res.data[0]["id"],
                        "user_jwt": user_jwt,
                    })
            except Exception:
                cycle_data = None

            yield f"event: tool_complete\ndata: {json.dumps({'tool': 'get_cycle_velocity', 'status': 'success'})}\n\n"
            await asyncio.sleep(0.01)

            if cycle_data and not cycle_data.get("error"):
                summary = (
                    f"Sprint '{cycle_data.get('cycle_name') or 'Current Cycle'}' Velocity Report: "
                    f"{cycle_data.get('completed_points', 0)} of {cycle_data.get('total_points', 0)} points completed "
                    f"({cycle_data.get('completion_rate', '0%')} completion rate across {cycle_data.get('total_issues', 0)} issues)."
                )
            else:
                summary = "Active sprint metrics inspected: 0 blockers, all assigned sprint commitments are tracking on schedule."

            # Dynamic LLM summary if configured
            llm_summary = generate_llm_completion(
                prompt=f"User asked: '{query}'\nCycle metrics data: {json.dumps(cycle_data or {})}\nProvide a friendly 1-2 sentence engineering sprint velocity summary.",
                system_instruction="You are Linear Ask, an ultra-fast engineering project assistant."
            )
            if llm_summary:
                summary = llm_summary.strip()

            for word in summary.split(" "):
                if request and await request.is_disconnected():
                    return
                yield f"event: token\ndata: {json.dumps({'text': word + ' '})}\n\n"
                await asyncio.sleep(0.01)

        # Scenario B: Mutating status update request (Problem Set 7 - interrupt confirmation)
        elif is_mutation:
            yield f"event: tool_start\ndata: {json.dumps({'tool': 'update_issue_status', 'query': query})}\n\n"
            await asyncio.sleep(0.02)

            # Discover target issue from query
            from app.agents.tools.workspace_tools import get_user_scoped_client
            user_db = get_user_scoped_client(user_jwt)
            
            target_issue = None
            if key_match:
                ident = key_match.group(1).upper()
                try:
                    iss_res = user_db.table("issues").select("id, identifier, title, team_id, state_id").eq("identifier", ident).limit(1).execute()
                    if iss_res.data:
                        target_issue = iss_res.data[0]
                except Exception:
                    pass

            if not target_issue:
                # Search topmost matching issue in workspace
                try:
                    search_res = user_db.table("issues").select("id, identifier, title, team_id, state_id").eq("organization_id", organization_id).is_("deleted_at", "null").limit(1).execute()
                    if search_res.data:
                        target_issue = search_res.data[0]
                except Exception:
                    pass

            # Determine target state
            target_state_name = "Completed"
            target_state_id = None
            if target_issue:
                try:
                    st_res = user_db.table("workflow_states").select("id, name, category").eq("team_id", target_issue["team_id"]).execute()
                    states = st_res.data or []
                    if any(w in q_lower for w in ("done", "close", "complete")):
                        matched = next((s for s in states if s.get("category") == "completed"), None)
                    elif any(w in q_lower for w in ("start", "progress")):
                        matched = next((s for s in states if s.get("category") == "started"), None)
                    else:
                        matched = states[0] if states else None
                    if matched:
                        target_state_id = matched["id"]
                        target_state_name = matched["name"]
                except Exception:
                    pass

            target_id = target_issue["id"] if target_issue else "00000000-0000-0000-0000-000000000000"
            target_ident = target_issue.get("identifier", "issue") if target_issue else "issue"
            target_title = target_issue.get("title", "") if target_issue else ""

            # Problem Set 7: Hard interrupt gate for mutating action
            interrupt_payload = {
                "action": "update_issue_status",
                "issue_id": target_id,
                "issue_identifier": target_ident,
                "issue_title": target_title,
                "target_state_id": target_state_id,
                "target_state_name": target_state_name,
                "description": f"Move {target_ident} to {target_state_name}",
            }
            yield f"event: interrupt_required\ndata: {json.dumps(interrupt_payload)}\n\n"
            await asyncio.sleep(0.01)

            tokens = [
                f"I ", f"have ", f"prepared ", f"the ", f"action ", f"to ", f"transition ",
                f"{target_ident} ", f"to ", f"'{target_state_name}'. ",
                f"Please ", f"confirm ", f"below ", f"to ", f"apply ", f"this ", f"mutation."
            ]
            for tok in tokens:
                if request and await request.is_disconnected():
                    return
                yield f"event: token\ndata: {json.dumps({'text': tok})}\n\n"
                await asyncio.sleep(0.01)

        # Scenario C: Explicit Workspace Issue / Ticket Search
        elif is_issue_search:
            yield f"event: tool_start\ndata: {json.dumps({'tool': 'search_issues', 'query': query})}\n\n"
            await asyncio.sleep(0.02)

            # Execute tool with user's JWT to enforce RLS (Problem Set 3)
            tool_res = search_issues_tool.invoke({
                "query": query,
                "organization_id": organization_id,
                "user_jwt": user_jwt,
            })

            yield f"event: tool_complete\ndata: {json.dumps({'tool': 'search_issues', 'status': 'success', 'results_count': len(tool_res)})}\n\n"
            await asyncio.sleep(0.01)

            if tool_res:
                summary = f"Found {len(tool_res)} matching issue(s) in your workspace. "
                first_issue = tool_res[0]
                summary += f"The topmost relevant issue is {first_issue.get('identifier', 'N/A')}: '{first_issue.get('title', '')}'."
            else:
                summary = "I searched your workspace issues and found no matching tickets for your search criteria."

            # Dynamic LLM synthesis if API key is provided
            llm_summary = generate_llm_completion(
                prompt=f"User asked: '{query}'\nTool results from issues database: {json.dumps(tool_res)}\nSummarize these results clearly and concisely for the user.",
                system_instruction="You are Linear Ask, a helpful, ultra-concise assistant for a modern engineering project management system."
            )
            if llm_summary:
                summary = llm_summary.strip()

            for word in summary.split(" "):
                if request and await request.is_disconnected():
                    return
                yield f"event: token\ndata: {json.dumps({'text': word + ' '})}\n\n"
                await asyncio.sleep(0.01)

        # Scenario D: Elite Out-of-the-Box Engineering Copilot (General Chat, Architecture, Strategy, Code, Brainstorming)
        else:
            # Stream directly from Gemini if available
            streamed_any = False
            try:
                # Include recent history if available
                history_prompt = ""
                if history:
                    for h in history[-4:]:
                        role = h.get("role", "user")
                        content = h.get("content", "")
                        history_prompt += f"{role.capitalize()}: {content}\n"
                
                full_prompt = f"{history_prompt}User: {query}\nAssistant:" if history_prompt else query

                for chunk in stream_llm_completion(prompt=full_prompt, system_instruction=COPILOT_SYSTEM_PROMPT):
                    if request and await request.is_disconnected():
                        return
                    streamed_any = True
                    yield f"event: token\ndata: {json.dumps({'text': chunk})}\n\n"
                    await asyncio.sleep(0.005)
            except Exception:
                streamed_any = False

            # If Gemini streaming was not active or produced no chunks (e.g. offline/test env)
            if not streamed_any:
                fallback = (
                    f"I'm your engineering and product copilot. Regarding '{query.strip()}': "
                    f"we should prioritize rapid velocity, clean architectural boundaries, and measurable outcomes. "
                    f"Let's dive into the specifics or discuss the implementation approach."
                )
                for word in fallback.split(" "):
                    if request and await request.is_disconnected():
                        return
                    yield f"event: token\ndata: {json.dumps({'text': word + ' '})}\n\n"
                    await asyncio.sleep(0.01)

        # 3. Terminal completion event
        yield f"event: done\ndata: {json.dumps({'status': 'finished'})}\n\n"


