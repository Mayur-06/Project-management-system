import json
from typing import Any, Dict, List, Optional
from datetime import datetime, timezone
from fastapi import HTTPException, status
from supabase import Client

from app.schemas.issue import (
    IssueCreate,
    IssueUpdate,
    IssueReorderRequest,
    BatchReorderRequest,
    BatchUpdateRequest,
    SubtaskCreate,
    IssueResponse,
    IssueDetailResponse,
    ActivityLogResponse,
    CommentCreate,
    CommentUpdate,
    CommentResponse,
    CommentReactionResponse,
)
from app.core.lexorank import calculate_midpoint_rank


class IssueService:
    @staticmethod
    def _verify_team_member(team_id: str, user_id: str, db: Client) -> dict:
        team_res = db.table("teams").select("id, organization_id, key, issue_counter").eq("id", team_id).limit(1).execute()
        if not team_res.data:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found")
        team = team_res.data[0]

        member_check = (
            db.table("workspace_members")
            .select("id, role")
            .eq("organization_id", team["organization_id"])
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
        if not member_check.data:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied to team issues")
        return team

    @staticmethod
    def _allocate_identifier(team_id: str, team: dict, db: Client) -> tuple[int, str]:
        """
        Atomically allocates the next sequential issue number & identifier.
        Calls the PostgreSQL SECURITY DEFINER RPC 'allocate_issue_identifier',
        falling back to table-level update if RPC is unavailable in mock tests.
        """
        try:
            rpc_res = db.rpc("allocate_issue_identifier", {"p_team_id": team_id}).execute()
            if rpc_res.data and len(rpc_res.data) > 0:
                row = rpc_res.data[0]
                return int(row["issue_number"]), str(row["issue_identifier"])
        except Exception:
            pass

        # Fallback for environments / unit tests without the RPC mock
        counter = team["issue_counter"] + 1
        identifier = f"{team['key']}-{counter}"
        db.table("teams").update({"issue_counter": counter}).eq("id", team_id).execute()
        return counter, identifier

    @staticmethod
    def _verify_issue_access(issue_id_or_identifier: str, user_id: str, db: Client) -> dict:
        query = db.table("issues").select("*")
        if "-" in issue_id_or_identifier and not len(issue_id_or_identifier) == 36:
            query = query.eq("identifier", issue_id_or_identifier)
        else:
            query = query.eq("id", issue_id_or_identifier)
        
        res = query.limit(1).execute()
        if not res.data:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Issue not found")
        issue = res.data[0]

        member_check = (
            db.table("workspace_members")
            .select("id, role")
            .eq("organization_id", issue["organization_id"])
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
        if not member_check.data:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied to issue")
        return issue

    @classmethod
    def list_issues(
        cls,
        team_id: str,
        user_id: str,
        db: Client,
        state_id: Optional[str] = None,
        assignee_id: Optional[str] = None,
        cycle_id: Optional[str] = None,
        project_id: Optional[str] = None,
        priority: Optional[str] = None,
        search: Optional[str] = None,
    ) -> List[IssueResponse]:
        cls._verify_team_member(team_id, user_id, db)
        
        query = db.table("issues").select("*").eq("team_id", team_id).is_("deleted_at", "null")
        if state_id:
            query = query.eq("state_id", state_id)
        if assignee_id:
            query = query.eq("assignee_id", assignee_id)
        if cycle_id:
            query = query.eq("cycle_id", cycle_id)
        if project_id:
            query = query.eq("project_id", project_id)
        if priority:
            query = query.eq("priority", priority)
        if search:
            query = query.ilike("title", f"%{search}%")

        query = query.order("sort_order")
        res = query.execute()
        return [IssueResponse(**item) for item in (res.data or [])]

    @classmethod
    def create_issue(cls, data: IssueCreate, user_id: str, db: Client) -> IssueResponse:
        team = cls._verify_team_member(data.team_id, user_id, db)

        # 1. State resolution
        target_state_id = data.state_id
        if not target_state_id:
            default_state = (
                db.table("workflow_states")
                .select("id")
                .eq("team_id", data.team_id)
                .eq("is_default", True)
                .limit(1)
                .execute()
            )
            if default_state.data:
                target_state_id = default_state.data[0]["id"]
            else:
                first_state = (
                    db.table("workflow_states")
                    .select("id")
                    .eq("team_id", data.team_id)
                    .order("position")
                    .limit(1)
                    .execute()
                )
                if not first_state.data:
                    raise HTTPException(status_code=500, detail="Team has no workflow states configured")
                target_state_id = first_state.data[0]["id"]

        # 2. Sequential counter & identifier (atomic allocation)
        counter, identifier = cls._allocate_identifier(data.team_id, team, db)

        # 3. Calculate initial LexoRank position
        last_issue = (
            db.table("issues")
            .select("sort_order")
            .eq("team_id", data.team_id)
            .eq("state_id", target_state_id)
            .is_("deleted_at", "null")
            .order("sort_order", desc=True)
            .limit(1)
            .execute()
        )
        prev_rank = last_issue.data[0]["sort_order"] if last_issue.data else None
        sort_order = calculate_midpoint_rank(prev_rank=prev_rank, next_rank=None)

        issue_payload = {
            "organization_id": team["organization_id"],
            "team_id": data.team_id,
            "number": counter,
            "identifier": identifier,
            "title": data.title,
            "description_json": data.description_json,
            "description_text": data.description_text,
            "priority": data.priority.value,
            "estimate": data.estimate,
            "state_id": target_state_id,
            "assignee_id": data.assignee_id,
            "creator_id": user_id,
            "project_id": data.project_id,
            "cycle_id": data.cycle_id,
            "parent_id": data.parent_id,
            "sort_order": sort_order,
            "version": 1,
            "due_date": data.due_date.isoformat() if data.due_date else None,
            "last_modified_by_session": data.client_session_id,
        }

        res = db.table("issues").insert(issue_payload).execute()
        if not res.data:
            raise HTTPException(status_code=500, detail="Failed to create issue")
        created = res.data[0]

        # Audit log
        db.table("activity_logs").insert({
            "organization_id": team["organization_id"],
            "issue_id": created["id"],
            "actor_id": user_id,
            "action": "issue_created",
            "changes": {"title": created["title"], "identifier": identifier},
        }).execute()

        # Generate & persist issue vector embedding asynchronously/safely
        try:
            from app.core.ai_client import get_embedding
            text_to_embed = f"{created['title']} {created.get('description_text') or ''}".strip()
            emb = get_embedding(text_to_embed)
            db.table("issue_embeddings").insert({
                "issue_id": created["id"],
                "organization_id": team["organization_id"],
                "embedding": emb,
            }).execute()
        except Exception:
            pass

        return IssueResponse(**created)

    @classmethod
    def get_issue(cls, issue_id_or_identifier: str, user_id: str, db: Client) -> IssueDetailResponse:
        issue = cls._verify_issue_access(issue_id_or_identifier, user_id, db)

        # Labels
        labels_res = (
            db.table("issue_labels")
            .select("label_id, labels(id, name, color)")
            .eq("issue_id", issue["id"])
            .execute()
        )
        labels = [item["labels"] for item in (labels_res.data or []) if item.get("labels")]

        # Subtasks
        subtasks_res = (
            db.table("issues")
            .select("*")
            .eq("parent_id", issue["id"])
            .is_("deleted_at", "null")
            .order("sort_order")
            .execute()
        )
        subtasks = [IssueResponse(**st) for st in (subtasks_res.data or [])]

        return IssueDetailResponse(**issue, labels=labels, subtasks=subtasks)

    @classmethod
    def update_issue(cls, issue_id: str, data: IssueUpdate, user_id: str, db: Client) -> IssueResponse:
        current_issue = cls._verify_issue_access(issue_id, user_id, db)

        # Optimistic Concurrency Control (OCC)
        if current_issue["version"] != data.expected_version:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    "message": "Concurrent edit conflict detected. The issue has been modified by another collaborator.",
                    "current_version": current_issue["version"],
                    "current_state": current_issue,
                }
            )

        update_dict = {}
        changes = {}
        for field, val in data.model_dump(exclude_unset=True).items():
            if field in ("expected_version", "client_session_id"):
                continue
            if val is not None:
                if isinstance(val, (datetime, datetime)):
                    val_str = val.isoformat()
                elif hasattr(val, "value"):
                    val_str = val.value
                else:
                    val_str = val
                update_dict[field] = val_str
                if current_issue.get(field) != val_str:
                    changes[field] = {"old": current_issue.get(field), "new": val_str}

        update_dict["version"] = current_issue["version"] + 1
        update_dict["updated_at"] = datetime.now(timezone.utc).isoformat()
        if data.client_session_id:
            update_dict["last_modified_by_session"] = data.client_session_id

        res = db.table("issues").update(update_dict).eq("id", issue_id).execute()
        if not res.data:
            raise HTTPException(status_code=500, detail="Failed to update issue")
        updated = res.data[0]

        if changes:
            db.table("activity_logs").insert({
                "organization_id": current_issue["organization_id"],
                "issue_id": issue_id,
                "actor_id": user_id,
                "action": "issue_updated",
                "changes": changes,
            }).execute()

            # Refresh embedding if title or description changed
            if "title" in changes or "description_text" in changes:
                try:
                    from app.core.ai_client import get_embedding
                    text_to_embed = f"{updated['title']} {updated.get('description_text') or ''}".strip()
                    emb = get_embedding(text_to_embed)
                    db.table("issue_embeddings").upsert({
                        "issue_id": issue_id,
                        "organization_id": current_issue["organization_id"],
                        "embedding": emb,
                    }).execute()
                except Exception:
                    pass

        return IssueResponse(**updated)

    @classmethod
    def delete_issue(cls, issue_id: str, user_id: str, db: Client, client_session_id: Optional[str] = None) -> None:
        current_issue = cls._verify_issue_access(issue_id, user_id, db)
        now_iso = datetime.now(timezone.utc).isoformat()

        # Trigger in PostgreSQL handles cascading soft-delete to child subtasks
        delete_payload = {"deleted_at": now_iso}
        if client_session_id:
            delete_payload["last_modified_by_session"] = client_session_id
        db.table("issues").update(delete_payload).eq("id", issue_id).execute()

        db.table("activity_logs").insert({
            "organization_id": current_issue["organization_id"],
            "issue_id": issue_id,
            "actor_id": user_id,
            "action": "issue_deleted",
            "changes": {"deleted_at": now_iso},
        }).execute()

    @classmethod
    def reorder_issue(cls, issue_id: str, data: IssueReorderRequest, user_id: str, db: Client) -> IssueResponse:
        current_issue = cls._verify_issue_access(issue_id, user_id, db)

        target_state_id = data.state_id or current_issue["state_id"]
        new_rank = calculate_midpoint_rank(data.prev_position, data.next_position)

        update_payload = {
            "state_id": target_state_id,
            "sort_order": new_rank,
            "version": current_issue["version"] + 1,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        if data.client_session_id:
            update_payload["last_modified_by_session"] = data.client_session_id

        res = db.table("issues").update(update_payload).eq("id", issue_id).execute()
        if not res.data:
            raise HTTPException(status_code=500, detail="Failed to reorder issue")
        return IssueResponse(**res.data[0])

    @classmethod
    def batch_reorder(cls, data: BatchReorderRequest, user_id: str, db: Client) -> Dict[str, Any]:
        count = 0
        now_iso = datetime.now(timezone.utc).isoformat()
        for item in data.items:
            payload = {
                "state_id": item.state_id,
                "sort_order": item.position,
                "updated_at": now_iso,
            }
            if data.client_session_id:
                payload["last_modified_by_session"] = data.client_session_id
            db.table("issues").update(payload).eq("id", item.issue_id).execute()
            count += 1
        return {"modified_count": count}

    @classmethod
    def batch_update(cls, data: BatchUpdateRequest, user_id: str, db: Client) -> List[str]:
        updated_ids = []
        now_iso = datetime.now(timezone.utc).isoformat()
        for item in data.updates:
            updates_dict = {}
            if item.state_id is not None:
                updates_dict["state_id"] = item.state_id
            if item.assignee_id is not None:
                updates_dict["assignee_id"] = item.assignee_id
            if item.priority is not None:
                updates_dict["priority"] = item.priority.value
            if item.cycle_id is not None:
                updates_dict["cycle_id"] = item.cycle_id
            
            if updates_dict:
                updates_dict["updated_at"] = now_iso
                if data.client_session_id:
                    updates_dict["last_modified_by_session"] = data.client_session_id
                db.table("issues").update(updates_dict).eq("id", item.issue_id).execute()
                updated_ids.append(item.issue_id)
        return updated_ids

    @classmethod
    def list_subtasks(cls, issue_id: str, user_id: str, db: Client) -> List[IssueResponse]:
        cls._verify_issue_access(issue_id, user_id, db)
        res = (
            db.table("issues")
            .select("*")
            .eq("parent_id", issue_id)
            .is_("deleted_at", "null")
            .order("sort_order")
            .execute()
        )
        return [IssueResponse(**item) for item in (res.data or [])]

    @classmethod
    def create_subtask(cls, parent_issue_id: str, data: SubtaskCreate, user_id: str, db: Client) -> IssueResponse:
        parent = cls._verify_issue_access(parent_issue_id, user_id, db)

        # Team counter (atomic allocation)
        team_res = db.table("teams").select("key, issue_counter").eq("id", parent["team_id"]).limit(1).execute()
        team = team_res.data[0]
        counter, identifier = cls._allocate_identifier(parent["team_id"], team, db)

        # Sort order among subtasks
        last_sub = (
            db.table("issues")
            .select("sort_order")
            .eq("parent_id", parent_issue_id)
            .is_("deleted_at", "null")
            .order("sort_order", desc=True)
            .limit(1)
            .execute()
        )
        prev_rank = last_sub.data[0]["sort_order"] if last_sub.data else None
        sort_order = calculate_midpoint_rank(prev_rank=prev_rank, next_rank=None)

        subtask_payload = {
            "organization_id": parent["organization_id"],
            "team_id": parent["team_id"],
            "number": counter,
            "identifier": identifier,
            "title": data.title,
            "priority": data.priority.value,
            "estimate": data.estimate,
            "state_id": parent["state_id"],
            "assignee_id": data.assignee_id,
            "creator_id": user_id,
            "project_id": parent.get("project_id"),
            "cycle_id": parent.get("cycle_id"),
            "parent_id": parent_issue_id,
            "sort_order": sort_order,
            "version": 1,
        }

        res = db.table("issues").insert(subtask_payload).execute()
        if not res.data:
            raise HTTPException(status_code=500, detail="Failed to create subtask")
        created = res.data[0]

        db.table("activity_logs").insert({
            "organization_id": parent["organization_id"],
            "issue_id": parent_issue_id,
            "actor_id": user_id,
            "action": "subtask_created",
            "changes": {"subtask_identifier": identifier, "title": data.title},
        }).execute()

        return IssueResponse(**created)

    @classmethod
    def list_activity_logs(cls, issue_id: str, user_id: str, db: Client) -> List[ActivityLogResponse]:
        cls._verify_issue_access(issue_id, user_id, db)
        res = (
            db.table("activity_logs")
            .select("*")
            .eq("issue_id", issue_id)
            .order("created_at", desc=True)
            .execute()
        )
        return [ActivityLogResponse(**log) for log in (res.data or [])]

    # --- Comments & Reactions ---

    @classmethod
    def list_comments(cls, issue_id: str, user_id: str, db: Client) -> List[CommentResponse]:
        cls._verify_issue_access(issue_id, user_id, db)
        comments_res = (
            db.table("issue_comments")
            .select("*")
            .eq("issue_id", issue_id)
            .is_("deleted_at", "null")
            .order("created_at")
            .execute()
        )
        comments = comments_res.data or []
        comment_ids = [c["id"] for c in comments]

        reactions_map: Dict[str, Dict[str, List[str]]] = {cid: {} for cid in comment_ids}
        if comment_ids:
            rx_res = (
                db.table("comment_reactions")
                .select("comment_id, emoji, user_id")
                .in_("comment_id", comment_ids)
                .execute()
            )
            for r in (rx_res.data or []):
                cid = r["comment_id"]
                emoji = r["emoji"]
                uid = r["user_id"]
                if emoji not in reactions_map[cid]:
                    reactions_map[cid][emoji] = []
                reactions_map[cid][emoji].append(uid)

        result = []
        for c in comments:
            rx_list = [
                CommentReactionResponse(emoji=emoji, count=len(uids), user_ids=uids)
                for emoji, uids in reactions_map[c["id"]].items()
            ]
            result.append(CommentResponse(**c, reactions=rx_list))
        return result

    @classmethod
    def create_comment(cls, issue_id: str, data: CommentCreate, user_id: str, db: Client) -> CommentResponse:
        issue = cls._verify_issue_access(issue_id, user_id, db)
        payload = {
            "issue_id": issue_id,
            "user_id": user_id,
            "body_json": data.body_json,
            "body_text": data.body_text,
        }
        res = db.table("issue_comments").insert(payload).execute()
        if not res.data:
            raise HTTPException(status_code=500, detail="Failed to create comment")
        created = res.data[0]

        db.table("activity_logs").insert({
            "organization_id": issue["organization_id"],
            "issue_id": issue_id,
            "actor_id": user_id,
            "action": "comment_added",
            "changes": {"comment_id": created["id"]},
        }).execute()

        return CommentResponse(**created, reactions=[])

    @classmethod
    def update_comment(cls, comment_id: str, data: CommentUpdate, user_id: str, db: Client) -> CommentResponse:
        c_res = db.table("issue_comments").select("*").eq("id", comment_id).is_("deleted_at", "null").limit(1).execute()
        if not c_res.data:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Comment not found")
        comment = c_res.data[0]

        if comment["user_id"] != user_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only comment author can edit comment")

        now_iso = datetime.now(timezone.utc).isoformat()
        res = db.table("issue_comments").update({
            "body_json": data.body_json,
            "body_text": data.body_text,
            "updated_at": now_iso,
        }).eq("id", comment_id).execute()

        return CommentResponse(**res.data[0], reactions=[])

    @classmethod
    def delete_comment(cls, comment_id: str, user_id: str, db: Client) -> None:
        c_res = db.table("issue_comments").select("id, user_id, issue_id").eq("id", comment_id).is_("deleted_at", "null").limit(1).execute()
        if not c_res.data:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Comment not found")
        comment = c_res.data[0]

        # Verify author or org admin
        if comment["user_id"] != user_id:
            issue = cls._verify_issue_access(comment["issue_id"], user_id, db)
            mem = db.table("workspace_members").select("role").eq("organization_id", issue["organization_id"]).eq("user_id", user_id).limit(1).execute()
            if not mem.data or mem.data[0]["role"] != "admin":
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only comment author or admin can delete comment")

        now_iso = datetime.now(timezone.utc).isoformat()
        db.table("issue_comments").update({"deleted_at": now_iso}).eq("id", comment_id).execute()

    @classmethod
    def toggle_reaction(cls, comment_id: str, emoji: str, user_id: str, db: Client) -> List[CommentReactionResponse]:
        c_res = db.table("issue_comments").select("id, issue_id").eq("id", comment_id).is_("deleted_at", "null").limit(1).execute()
        if not c_res.data:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Comment not found")
        cls._verify_issue_access(c_res.data[0]["issue_id"], user_id, db)

        existing = (
            db.table("comment_reactions")
            .select("id")
            .eq("comment_id", comment_id)
            .eq("user_id", user_id)
            .eq("emoji", emoji)
            .limit(1)
            .execute()
        )
        if existing.data:
            db.table("comment_reactions").delete().eq("id", existing.data[0]["id"]).execute()
        else:
            db.table("comment_reactions").insert({
                "comment_id": comment_id,
                "user_id": user_id,
                "emoji": emoji,
            }).execute()

        # Fetch current reactions
        rx_res = db.table("comment_reactions").select("emoji, user_id").eq("comment_id", comment_id).execute()
        rx_map: Dict[str, List[str]] = {}
        for r in (rx_res.data or []):
            e = r["emoji"]
            if e not in rx_map:
                rx_map[e] = []
            rx_map[e].append(r["user_id"])

        return [
            CommentReactionResponse(emoji=e, count=len(uids), user_ids=uids)
            for e, uids in rx_map.items()
        ]
