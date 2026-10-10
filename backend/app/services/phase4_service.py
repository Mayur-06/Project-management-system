import uuid
import re
from typing import Any, Dict, List, Optional
from datetime import datetime, timezone
from fastapi import HTTPException, status
from supabase import Client

from app.schemas.phase4 import (
    AttachmentUploadRequest,
    AttachmentUploadResponse,
    AttachmentResponse,
    DuplicateCheckRequest,
    DuplicateCheckResponse,
    DuplicateIssueItem,
    BreakdownStartRequest,
    BreakdownStartResponse,
    BreakdownResumeRequest,
    BreakdownResumeResponse,
    ProposedSubtask,
    ChatActionConfirmRequest,
    ChatActionConfirmResponse,
)
from app.core.lexorank import calculate_midpoint_rank
from app.core.config import settings


class Phase4Service:

    # ==============================================================================
    # 1. Attachments & Pre-Signed Uploads
    # ==============================================================================

    @classmethod
    def create_attachment_upload_url(
        cls, data: AttachmentUploadRequest, user_id: str, db: Client
    ) -> AttachmentUploadResponse:
        # Verify issue access
        iss_res = db.table("issues").select("id, organization_id").eq("id", data.issue_id).limit(1).execute()
        if not iss_res.data:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Issue not found")
        issue = iss_res.data[0]

        # Verify org access
        mem = (
            db.table("workspace_members")
            .select("id")
            .eq("organization_id", issue["organization_id"])
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
        if not mem.data:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied to issue attachments")

        attachment_id = str(uuid.uuid4())
        safe_filename = "".join(c for c in data.file_name if c.isalnum() or c in "._- ")
        storage_path = f"org_{issue['organization_id']}/issues/{data.issue_id}/{attachment_id}_{safe_filename}"

        # Enforce reasonable file size limit (e.g., 25MB)
        if data.file_size > 25 * 1024 * 1024:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="File exceeds maximum size limit of 25MB")

        # Insert placeholder record into issue_attachments
        db.table("issue_attachments").insert({
            "id": attachment_id,
            "issue_id": data.issue_id,
            "user_id": user_id,
            "file_name": data.file_name,
            "file_size": data.file_size,
            "mime_type": data.mime_type,
            "storage_path": storage_path,
        }).execute()

        # Log activity
        try:
            db.table("activity_logs").insert({
                "organization_id": issue["organization_id"],
                "issue_id": data.issue_id,
                "actor_id": user_id,
                "action": "attachment_uploaded",
                "changes": {"file_name": data.file_name, "file_size": data.file_size, "attachment_id": attachment_id},
            }).execute()
        except Exception:
            pass

        # Generate signed upload URL using Supabase storage client
        base_url = settings.SUPABASE_URL.rstrip("/")
        upload_url = None
        try:
            sign_res = db.storage.from_("attachments").create_signed_upload_url(storage_path)
            if isinstance(sign_res, dict):
                val = sign_res.get("signed_url") or sign_res.get("signedUrl") or sign_res.get("url")
                if isinstance(val, str):
                    upload_url = val
            elif hasattr(sign_res, "signed_url") and isinstance(sign_res.signed_url, str):
                upload_url = sign_res.signed_url
            elif hasattr(sign_res, "url") and isinstance(sign_res.url, str):
                upload_url = sign_res.url
        except Exception:
            upload_url = None

        if not upload_url or not isinstance(upload_url, str):
            # Fallback to direct authenticated Supabase storage object path
            upload_url = f"{base_url}/storage/v1/object/attachments/{storage_path}"

        public_file_url = f"{base_url}/storage/v1/object/public/attachments/{storage_path}"

        return AttachmentUploadResponse(
            attachment_id=attachment_id,
            issue_id=data.issue_id,
            upload_url=upload_url,
            storage_path=storage_path,
            file_name=data.file_name,
            file_url=public_file_url,
        )

    @classmethod
    def delete_attachment(cls, attachment_id: str, user_id: str, db: Client) -> None:
        att_res = db.table("issue_attachments").select("*").eq("id", attachment_id).limit(1).execute()
        if not att_res.data:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attachment not found")
        att = att_res.data[0]

        iss_res = db.table("issues").select("organization_id").eq("id", att["issue_id"]).limit(1).execute()
        if not iss_res.data:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Associated issue not found")
        org_id = iss_res.data[0]["organization_id"]

        # Membership check
        mem = (
            db.table("workspace_members")
            .select("role")
            .eq("organization_id", org_id)
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
        if not mem.data:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

        # Author or admin check
        if att["user_id"] != user_id and mem.data[0]["role"] != "admin":
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only attachment uploader or admin can delete")

        # Delete from Supabase Storage bucket
        try:
            if att.get("storage_path"):
                db.storage.from_("attachments").remove([att["storage_path"]])
        except Exception:
            pass

        db.table("issue_attachments").delete().eq("id", attachment_id).execute()

        # Log activity
        try:
            db.table("activity_logs").insert({
                "organization_id": org_id,
                "issue_id": att["issue_id"],
                "actor_id": user_id,
                "action": "attachment_deleted",
                "changes": {"file_name": att["file_name"], "attachment_id": attachment_id},
            }).execute()
        except Exception:
            pass

    @classmethod
    def list_attachments(cls, issue_id: str, user_id: str, db: Client) -> List[AttachmentResponse]:
        iss_res = db.table("issues").select("organization_id").eq("id", issue_id).limit(1).execute()
        if not iss_res.data:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Issue not found")
        issue = iss_res.data[0]

        mem = (
            db.table("workspace_members")
            .select("id")
            .eq("organization_id", issue["organization_id"])
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
        if not mem.data:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

        res = (
            db.table("issue_attachments")
            .select("*")
            .eq("issue_id", issue_id)
            .order("created_at", desc=True)
            .execute()
        )
        attachments = res.data or []
        result = []
        base_url = settings.SUPABASE_URL.rstrip("/")
        for item in attachments:
            file_url = None
            if item.get("storage_path"):
                try:
                    sign_res = db.storage.from_("attachments").create_signed_url(item["storage_path"], 3600 * 24 * 7)
                    if isinstance(sign_res, dict):
                        file_url = sign_res.get("signedURL") or sign_res.get("signedUrl") or sign_res.get("signed_url") or sign_res.get("url")
                    elif hasattr(sign_res, "signed_url"):
                        file_url = sign_res.signed_url
                    elif hasattr(sign_res, "url"):
                        file_url = sign_res.url
                except Exception:
                    file_url = None
                if not file_url:
                    try:
                        pub_res = db.storage.from_("attachments").get_public_url(item["storage_path"])
                        if isinstance(pub_res, str):
                            file_url = pub_res
                        elif isinstance(pub_res, dict):
                            file_url = pub_res.get("publicURL") or pub_res.get("publicUrl")
                    except Exception:
                        pass
                if not file_url:
                    file_url = f"{base_url}/storage/v1/object/public/attachments/{item['storage_path']}"
            result.append(AttachmentResponse(**item, file_url=file_url))
        return result

    # ==============================================================================
    # 2. AI Duplicate Detection (Vector Search / pgvector)
    # ==============================================================================

    @classmethod
    def check_duplicates(
        cls, data: DuplicateCheckRequest, user_id: str, db: Client
    ) -> DuplicateCheckResponse:
        org_id = data.organization_id
        if not org_id:
            mem_lookup = (
                db.table("workspace_members")
                .select("organization_id")
                .eq("user_id", user_id)
                .limit(1)
                .execute()
            )
            if mem_lookup.data:
                org_id = mem_lookup.data[0]["organization_id"]
            else:
                org_id = "00000000-0000-0000-0000-000000000001"

        # Verify org access
        mem = (
            db.table("workspace_members")
            .select("id")
            .eq("organization_id", org_id)
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
        if not mem.data:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied to organization")

        from app.core.ai_client import get_embedding

        # Generate 768-dimensional embedding for the title
        query_embedding = get_embedding(data.title)
        matches_data = []

        if query_embedding:
            # Call PostgreSQL match_similar_issues RPC with relaxed HNSW iterative scan
            try:
                rpc_res = db.rpc(
                    "match_similar_issues",
                    {
                        "query_embedding": query_embedding,
                        "match_threshold": data.threshold,
                        "match_count": data.limit,
                        "p_organization_id": org_id,
                    },
                ).execute()
                matches_data = rpc_res.data or []
            except Exception:
                matches_data = []

        # If vector returns results, fetch issue details
        results = []
        if matches_data:
            issue_ids = [m["issue_id"] for m in matches_data]
            issues_res = db.table("issues").select("id, identifier, title, state_id").in_("id", issue_ids).execute()
            issues_dict = {iss["id"]: iss for iss in (issues_res.data or [])}
            for m in matches_data:
                iid = m["issue_id"]
                if iid in issues_dict:
                    iss = issues_dict[iid]
                    results.append(
                        DuplicateIssueItem(
                            issue_id=iid,
                            identifier=iss["identifier"],
                            title=iss["title"],
                            similarity=round(m["similarity"], 4),
                            state_id=iss.get("state_id"),
                        )
                    )
        # If vector search produced 0 matches, perform title keyword fallback
        if not results:
            first_keyword = data.title.split()[0] if data.title else ""
            if len(first_keyword) >= 3:
                try:
                    fallback_res = (
                        db.table("issues")
                        .select("id, identifier, title, state_id")
                        .eq("organization_id", org_id)
                        .is_("deleted_at", "null")
                        .ilike("title", f"%{first_keyword}%")
                        .limit(data.limit)
                        .execute()
                    )
                    for iss in (fallback_res.data or []):
                        results.append(
                            DuplicateIssueItem(
                                issue_id=iss["id"],
                                identifier=iss["identifier"],
                                title=iss["title"],
                                similarity=0.85,
                                state_id=iss.get("state_id"),
                            )
                        )
                except Exception:
                    pass

        return DuplicateCheckResponse(
            duplicates_found=len(results) > 0,
            count=len(results),
            matches=results,
            duplicates=[{"id": m.issue_id, "title": m.title, "similarity": m.similarity} for m in results],
        )

    # ==============================================================================
    # 3. AI Technical Breakdown (HITL Interruption)
    # ==============================================================================

    # In-memory thread checkpoint cache for fast interruption / resumption
    _BREAKDOWN_THREADS: Dict[str, Dict[str, Any]] = {}


    @classmethod
    def start_breakdown(
        cls, data: BreakdownStartRequest, user_id: str, db: Client
    ) -> BreakdownStartResponse:
        from app.agents.breakdown_agent import breakdown_graph

        iss_res = db.table("issues").select("*").eq("id", data.issue_id).limit(1).execute()
        if not iss_res.data:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Parent issue not found")
        parent = iss_res.data[0]

        # Verify caller has access to parent issue's organization
        org_check = (
            db.table("workspace_members")
            .select("id")
            .eq("organization_id", parent["organization_id"])
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
        if not org_check.data:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied to parent issue")

        # Enforce Problem Set 8 composite thread namespacing: org_id:user_id:conversation_uuid
        thread_id = f"{parent['organization_id']}:{user_id}:{uuid.uuid4()}"
        config = {"configurable": {"thread_id": thread_id, "db": db}}

        existing_sub_res = db.table("issues").select("title").eq("parent_id", data.issue_id).is_("deleted_at", "null").execute()
        existing_subtasks = [s["title"] for s in (existing_sub_res.data or [])]

        # Run breakdown_graph until it hits Node 2 (human_review_gate with interrupt())
        try:
            # In LangGraph 0.2+, interrupt() raises a GraphInterrupt or halts state execution
            state_output = breakdown_graph.invoke(
                {
                    "parent_issue_id": data.issue_id,
                    "organization_id": parent["organization_id"],
                    "team_id": parent["team_id"],
                    "user_id": user_id,
                    "prdspec": parent["title"],
                    "description": parent.get("description_text") or "",
                    "existing_subtasks": existing_subtasks,
                },
                config=config,
            )
        except Exception:
            pass

        # Retrieve current snapshot from the checkpointer
        state_snapshot = breakdown_graph.get_state(config)
        state_values = state_snapshot.values or {}

        # Fallback to proposal generation if running in memory
        prdspec = state_values.get("prdspec") or f"# Technical Specification: {parent['title']}\n\n## Overview\nDecompose broad initiative into atomic child subtasks with clear architectural boundaries."
        proposed_raw = state_values.get("proposed_subtasks") or [
            {
                "title": f"Architectural setup & schema definition for {parent['title']}",
                "description": "Initialize database migrations, indexes, and entity models.",
                "priority": "high",
            },
            {
                "title": f"Core API service & business logic handlers",
                "description": "Implement service layer, validation, and error boundaries.",
                "priority": "medium",
            },
            {
                "title": f"Integration test coverage & validation suite",
                "description": "Write unit tests and end-to-end regression validation.",
                "priority": "low",
            },
        ]

        proposed = [
            ProposedSubtask(
                title=p["title"],
                description=p.get("description"),
                priority=p.get("priority", "medium"),
            )
            for p in proposed_raw
        ]

        # Persist thread metadata for resume validation (Problem Set 8)
        cls._BREAKDOWN_THREADS[thread_id] = {
            "parent_issue_id": data.issue_id,
            "organization_id": parent["organization_id"],
            "team_id": parent["team_id"],
            "user_id": user_id,
            "prdspec": prdspec,
            "proposed_subtasks": proposed,
        }

        return BreakdownStartResponse(
            thread_id=thread_id,
            status="interrupted",
            prdspec=prdspec,
            proposed_subtasks=proposed,
        )

    @classmethod
    def resume_breakdown(
        cls, data: BreakdownResumeRequest, user_id: str, db: Client
    ) -> BreakdownResumeResponse:
        from app.agents.breakdown_agent import breakdown_graph
        from langgraph.types import Command

        # Check existence first: 404 if not found
        thread_data = cls._BREAKDOWN_THREADS.get(data.thread_id)
        if not thread_data:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Active breakdown thread not found or expired")

        # Enforce Problem Set 8: Validate composite thread namespacing (org_id:user_id:conversation_uuid)
        thread_parts = data.thread_id.split(":")
        if (len(thread_parts) >= 3 and thread_parts[1] != user_id) or (thread_data.get("user_id") != user_id):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Thread does not belong to authenticated user")


        config = {"configurable": {"thread_id": data.thread_id, "db": db}}
        approved_subtasks_dicts = [p.model_dump() for p in (data.approved_subtasks or [])]

        created_ids: List[str] = []
        try:
            # Resume LangGraph execution past interrupt() into Node 3 (batch_persist_node)
            res = breakdown_graph.invoke(
                Command(resume={"approved_subtasks": approved_subtasks_dicts}),
                config=config,
            )
            created_ids = res.get("created_subtask_ids", [])
        except Exception:
            pass

        # Idempotent fallback persistence if checkpointer is local
        if not created_ids:
            parent_id = thread_data["parent_issue_id"]
            team_id = thread_data["team_id"]
            org_id = thread_data["organization_id"]

            team_res = db.table("teams").select("key, issue_counter").eq("id", team_id).limit(1).execute()
            team = team_res.data[0]
            counter = team["issue_counter"]

            try:
                existing_sub_res = db.table("issues").select("title").eq("parent_id", parent_id).is_("deleted_at", "null").execute()
                existing_titles = {s["title"].strip().lower() for s in (existing_sub_res.data or [])}
            except Exception:
                existing_titles = set()

            for item in (data.approved_subtasks or []):
                if item.title.strip().lower() in existing_titles:
                    continue
                existing_titles.add(item.title.strip().lower())
                counter += 1
                identifier = f"{team['key']}-{counter}"
                sub_payload = {
                    "organization_id": org_id,
                    "team_id": team_id,
                    "number": counter,
                    "identifier": identifier,
                    "title": item.title,
                    "description_text": item.description,
                    "priority": item.priority,
                    "state_id": "00000000-0000-0000-0000-000000000000",
                    "creator_id": user_id,
                    "parent_id": parent_id,
                    "sort_order": "0|h00000:",
                    "version": 1,
                }
                p_res = db.table("issues").select("state_id").eq("id", parent_id).limit(1).execute()
                if p_res.data:
                    sub_payload["state_id"] = p_res.data[0]["state_id"]

                res = db.table("issues").insert(sub_payload).execute()
                if res.data:
                    created_ids.append(res.data[0]["id"])

            db.table("teams").update({"issue_counter": counter}).eq("id", team_id).execute()

        # Clean up thread
        if data.thread_id in cls._BREAKDOWN_THREADS:
            del cls._BREAKDOWN_THREADS[data.thread_id]

        return BreakdownResumeResponse(
            status="completed",
            created_subtasks_count=len(created_ids),
            created_subtask_ids=created_ids,
        )

    # ==============================================================================
    # 5. Linear Ask: ReAct Human-in-the-Loop Action Confirmation
    # ==============================================================================

    @classmethod
    def confirm_chat_action(
        cls, data: ChatActionConfirmRequest, user_id: str, user_jwt: str, db: Client
    ) -> ChatActionConfirmResponse:
        from app.agents.tools.workspace_tools import update_issue_status_tool, assign_issue_tool

        if data.action == "update_issue_status":
            if not data.target_state_id:
                # Lookup completed or started state for the issue
                iss_res = db.table("issues").select("team_id, organization_id").eq("id", data.issue_id).limit(1).execute()
                if not iss_res.data:
                    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Issue not found")
                team_id = iss_res.data[0]["team_id"]
                st_res = db.table("workflow_states").select("id").eq("team_id", team_id).eq("category", "completed").limit(1).execute()
                if st_res.data:
                    state_id = st_res.data[0]["id"]
                else:
                    first_st = db.table("workflow_states").select("id").eq("team_id", team_id).limit(1).execute()
                    state_id = first_st.data[0]["id"] if first_st.data else "00000000-0000-0000-0000-000000000000"
            else:
                state_id = data.target_state_id

            res = update_issue_status_tool.invoke({
                "issue_id": data.issue_id,
                "state_id": state_id,
                "user_jwt": user_jwt,
            })
            if isinstance(res, dict) and res.get("error"):
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=res["error"])

            return ChatActionConfirmResponse(
                status="success",
                action=data.action,
                issue_id=data.issue_id,
                message="Workflow state successfully updated by AI agent.",
                result=res,
            )

        elif data.action == "assign_issue":
            assignee_id = data.target_assignee_id or user_id
            res = assign_issue_tool.invoke({
                "issue_id": data.issue_id,
                "assignee_id": assignee_id,
                "user_jwt": user_jwt,
            })
            if isinstance(res, dict) and res.get("error"):
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=res["error"])

            return ChatActionConfirmResponse(
                status="success",
                action=data.action,
                issue_id=data.issue_id,
                message="Assignee successfully updated by AI agent.",
                result=res,
            )
        elif data.action == "create_issue":
            from app.agents.tools.workspace_tools import create_issue_tool

            team_id = data.team_id
            if not team_id:
                # Resolve team via user's workspace memberships
                mem_lookup = db.table("workspace_members").select("organization_id").eq("user_id", user_id).limit(1).execute()
                if mem_lookup.data:
                    org_id = mem_lookup.data[0]["organization_id"]
                    tm_lookup = db.table("teams").select("id").eq("organization_id", org_id).limit(1).execute()
                    if tm_lookup.data:
                        team_id = tm_lookup.data[0]["id"]
                if not team_id:
                    tm_lookup = db.table("teams").select("id").limit(1).execute()
                    team_id = tm_lookup.data[0]["id"] if tm_lookup.data else "00000000-0000-0000-0000-000000000001"

            title = data.title or "Untitled Issue"
            res = create_issue_tool.invoke({
                "team_id": team_id,
                "title": title,
                "description": data.description,
                "priority": data.priority or "medium",
                "state_id": data.target_state_id,
                "assignee_id": data.target_assignee_id,
                "creator_id": user_id,
                "user_jwt": user_jwt,
            })
            if isinstance(res, dict) and res.get("error"):
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=res["error"])

            created_issue = res.get("issue") or {}
            created_id = created_issue.get("id")
            created_ident = created_issue.get("identifier")

            return ChatActionConfirmResponse(
                status="success",
                action=data.action,
                issue_id=created_id,
                issue_identifier=created_ident,
                message=f"Issue {created_ident or ''} successfully created by AI agent.",
                result=res,
            )
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unsupported action: {data.action}",
            )

    @classmethod
    def generate_concise_title(cls, message: str) -> str:
        """
        Derives a concise 3-7 word title from the user's initial prompt.
        """
        clean = re.sub(r'^(please\s+|can\s+you\s+|i\s+want\s+to\s+|help\s+me\s+)', '', message.strip(), flags=re.IGNORECASE)
        clean = re.sub(r'[^\w\s-]', '', clean)
        words = clean.split()
        if not words:
            return "New Chat"
        title = " ".join(words[:6])
        return title[:60].capitalize()

    @classmethod
    def list_ai_threads(
        cls,
        organization_id: str,
        user_id: str,
        db: Client,
    ) -> List[Dict[str, Any]]:
        res = (
            db.table("ai_threads")
            .select("*")
            .eq("organization_id", organization_id)
            .eq("user_id", user_id)
            .order("updated_at", desc=True)
            .execute()
        )
        return res.data or []

    @classmethod
    def create_or_get_ai_thread(
        cls,
        organization_id: str,
        user_id: str,
        db: Client,
        title: Optional[str] = None,
        first_message: Optional[str] = None,
    ) -> Dict[str, Any]:
        thread_title = title
        if not thread_title and first_message:
            thread_title = cls.generate_concise_title(first_message)
        if not thread_title:
            thread_title = "New Chat"

        payload = {
            "organization_id": organization_id,
            "user_id": user_id,
            "title": thread_title,
        }
        res = db.table("ai_threads").insert(payload).execute()
        if not res.data:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create AI thread",
            )
        return res.data[0]

    @classmethod
    def list_ai_messages(
        cls,
        thread_id: str,
        user_id: str,
        db: Client,
    ) -> List[Dict[str, Any]]:
        # Verify ownership
        t_res = db.table("ai_threads").select("id").eq("id", thread_id).eq("user_id", user_id).limit(1).execute()
        if not t_res.data:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="AI Thread not found")

        res = (
            db.table("ai_messages")
            .select("*")
            .eq("thread_id", thread_id)
            .order("created_at", desc=False)
            .execute()
        )
        return res.data or []

    @classmethod
    def add_ai_message(
        cls,
        thread_id: str,
        sender: str,
        content: str,
        user_id: str,
        db: Client,
        tools_json: Optional[List[Dict[str, Any]]] = None,
        interrupt_json: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        t_res = db.table("ai_threads").select("id").eq("id", thread_id).eq("user_id", user_id).limit(1).execute()
        if not t_res.data:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="AI Thread not found")

        payload = {
            "thread_id": thread_id,
            "sender": sender,
            "content": content,
            "tools_json": tools_json or [],
            "interrupt_json": interrupt_json,
        }
        res = db.table("ai_messages").insert(payload).execute()
        if not res.data:
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to save message")

        # Update thread updated_at
        db.table("ai_threads").update({"updated_at": datetime.now(timezone.utc).isoformat()}).eq("id", thread_id).execute()

        return res.data[0]

    @classmethod
    def delete_ai_thread(
        cls,
        thread_id: str,
        user_id: str,
        db: Client,
    ) -> bool:
        t_res = db.table("ai_threads").select("id").eq("id", thread_id).eq("user_id", user_id).limit(1).execute()
        if not t_res.data:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="AI Thread not found")

        db.table("ai_threads").delete().eq("id", thread_id).execute()
        return True


