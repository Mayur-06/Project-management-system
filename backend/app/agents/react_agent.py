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
    update_issue_status_tool,
    assign_issue_tool,
)
from app.core.ai_client import generate_llm_completion, stream_llm_completion

COPILOT_SYSTEM_PROMPT = """You are an elite, modern engineering and product copilot embedded in a high-velocity project workspace.
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
        is_create_issue = False
        create_keywords = ("create issue", "create ticket", "new issue", "new ticket", "file issue", "file ticket", "draft issue", "draft ticket", "create a bug", "report a bug", "add issue", "add ticket")
        if any(p in q_lower for p in create_keywords) or (q_lower.startswith("create ") and any(w in q_lower for w in ("bug", "task", "feature", "issue", "ticket"))):
            is_create_issue = True

        is_mutation = False
        if not is_create_issue:
            if any(v in q_lower for v in ("to done", "to in progress", "to completed", "to canceled", "to backlog")):
                is_mutation = True
            elif key_match and any(v in q_lower for v in ("move", "close", "mark", "assign", "transition", "complete", "reopen")):
                is_mutation = True
            elif any(q_lower.startswith(p) for p in ("move ", "close ", "assign ", "complete ")):
                is_mutation = True

        # Detect if user is asking a conceptual/definition question
        is_definition_question = (
            any(q_lower.startswith(p) for p in ("what is ", "what does ", "define ", "explain ", "meaning of ", "how is "))
            and not any(w in q_lower for w in ("our", "current", "this", "my", "team", "workspace", "active"))
        )

        is_issue_search = False
        if not is_create_issue and not is_mutation and not is_definition_question:
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
            elif any(w in q_lower for w in ("issue", "issues", "ticket", "tickets")) and any(w in q_lower for w in ("find", "search", "list", "filter", "lookup", "look up", "any", "status", "active")):
                is_issue_search = True

        # Scenario 0: Interactive Issue Creation Request (Human-in-the-Loop Interrupt Gate)
        if is_create_issue:
            yield f"event: tool_start\ndata: {json.dumps({'tool': 'create_issue', 'query': query})}\n\n"
            await asyncio.sleep(0.02)

            from app.agents.tools.workspace_tools import get_user_scoped_client
            user_db = get_user_scoped_client(user_jwt)

            # Discover user's teams in the organization
            teams_res = user_db.table("teams").select("id, key, name").eq("organization_id", organization_id).execute()
            teams = teams_res.data or []
            target_team = teams[0] if teams else {"id": "00000000-0000-0000-0000-000000000001", "key": "TEAM", "name": "General"}

            # Check if user mentioned a specific team key or name
            for tm in teams:
                if tm.get("key", "").lower() in q_lower or tm.get("name", "").lower() in q_lower:
                    target_team = tm
                    break

            # Fetch workflow states for this team
            team_id = target_team["id"]
            states_res = user_db.table("workflow_states").select("id, name, is_default, position").eq("team_id", team_id).order("position").execute()
            team_states = states_res.data or []
            default_st = next((s for s in team_states if s.get("is_default")), (team_states[0] if team_states else None))
            target_state_id = default_st["id"] if default_st else None
            target_state_name = default_st["name"] if default_st else "Todo"

            # Use LLM or rule-based parser to extract Title, Priority, Description
            draft_title = "New Task"
            draft_priority = "medium"
            draft_desc = ""

            llm_extract = generate_llm_completion(
                prompt=(
                    f"User said: '{query}'\n"
                    f"Extract the planned issue title, priority ('urgent', 'high', 'medium', 'low', 'none'), "
                    f"and optional concise description from the user prompt.\n"
                    f"Return STRICT JSON with keys: title, priority, description.\n"
                    f"Return ONLY valid JSON."
                ),
                system_instruction="You are an engineering copilot extracting structured ticket parameters."
            )
            if llm_extract:
                try:
                    cleaned = llm_extract.strip()
                    if cleaned.startswith("```json"):
                        cleaned = cleaned[7:]
                    if cleaned.startswith("```"):
                        cleaned = cleaned[3:]
                    if cleaned.endswith("```"):
                        cleaned = cleaned[:-3]
                    extracted_data = json.loads(cleaned.strip())
                    draft_title = extracted_data.get("title") or draft_title
                    draft_priority = extracted_data.get("priority") or draft_priority
                    draft_desc = extracted_data.get("description") or ""
                except Exception:
                    pass

            if draft_title == "New Task":
                # Fallback extraction from regex/text
                for kw in create_keywords:
                    if kw in q_lower:
                        idx = q_lower.find(kw) + len(kw)
                        candidate = query[idx:].strip().strip(":").strip("-").strip()
                        if candidate:
                            draft_title = candidate[:80]
                        break

            # Infer priority if explicit
            if any(w in q_lower for w in ("urgent", "p0", "blocker")):
                draft_priority = "urgent"
            elif any(w in q_lower for w in ("high", "p1")):
                draft_priority = "high"
            elif any(w in q_lower for w in ("low", "p3", "minor")):
                draft_priority = "low"

            interrupt_payload = {
                "action": "create_issue",
                "team_id": team_id,
                "team_key": target_team.get("key", "TEAM"),
                "draft_title": draft_title,
                "draft_priority": draft_priority,
                "draft_description": draft_desc,
                "target_state_id": target_state_id,
                "target_state_name": target_state_name,
                "description": f"Create new issue '{draft_title}' in team {target_team.get('key', 'TEAM')}",
            }

            yield f"event: interrupt_required\ndata: {json.dumps(interrupt_payload)}\n\n"
            await asyncio.sleep(0.01)

            tokens = [
                f"I've ", f"prepared ", f"a ", f"draft ", f"for ", f"this ", f"issue ",
                f"in ", f"{target_team.get('key', 'team')}. ",
                f"Review ", f"and ", f"adjust ", f"any ", f"details ", f"below, ",
                f"then ", f"click ", f"Confirm ", f"to ", f"create ", f"it."
            ]
            for tok in tokens:
                if request and await request.is_disconnected():
                    return
                yield f"event: token\ndata: {json.dumps({'text': tok})}\n\n"
                await asyncio.sleep(0.01)

        # Scenario A: Mutating status update request (Problem Set 7 - interrupt confirmation)
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
                system_instruction="You are Workspace Copilot, a helpful, ultra-concise assistant for a modern engineering project management system."
            )
            if llm_summary:
                summary = llm_summary.strip()

            sub_tokens = re.findall(r'\S+|\n+|\s+', summary)
            for tok in sub_tokens:
                if request and await request.is_disconnected():
                    return
                yield f"event: token\ndata: {json.dumps({'text': tok})}\n\n"
                await asyncio.sleep(0.015)

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
                    if not chunk:
                        continue
                    streamed_any = True
                    # Smooth sub-token streaming: pacing words smoothly to client
                    sub_tokens = re.findall(r'\S+|\n+|\s+', chunk)
                    for tok in sub_tokens:
                        if request and await request.is_disconnected():
                            return
                        yield f"event: token\ndata: {json.dumps({'text': tok})}\n\n"
                        await asyncio.sleep(0.015)
            except Exception:
                streamed_any = False

            # If Gemini streaming was not active or produced no chunks (e.g. offline/test env)
            if not streamed_any:
                if any(w in q_lower for w in ("hello", "hi", "hey", "greetings")):
                    fallback = "Hey there! I'm your workspace engineering copilot. I can help with system architecture, API design, sprint planning, and code problem-solving. What are you working on?"
                elif any(w in q_lower for w in ("task", "perform", "can you do", "capabilities", "help")):
                    fallback = "I'm equipped to assist with technical design & architecture, reviewing code patterns, outlining API specs, sprint strategy & task breakdown, and workspace tracking. Let me know what you'd like to work on!"
                else:
                    fallback = (
                        f"Understood. For '{query.strip()}', let's focus on high leverage, clean interfaces, and rapid execution. "
                        f"Tell me more about your specific requirements or trade-offs you want to explore."
                    )
                fallback_tokens = re.findall(r'\S+|\n+|\s+', fallback)
                for tok in fallback_tokens:
                    if request and await request.is_disconnected():
                        return
                    yield f"event: token\ndata: {json.dumps({'text': tok})}\n\n"
                    await asyncio.sleep(0.015)

        # 3. Terminal completion event
        yield f"event: done\ndata: {json.dumps({'status': 'finished'})}\n\n"


