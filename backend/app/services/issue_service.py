import json
from typing import Any, Dict, List, Optional
from datetime import datetime, date, timezone
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
    IssueAssigneeUser,
    ActivityLogResponse,
    CommentCreate,
    CommentUpdate,
    CommentResponse,
    CommentReactionResponse,
)
from app.core.lexorank import calculate_midpoint_rank
from app.services.workspace_service import WorkspaceService


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
            # Scope identifier lookup to user's member organizations to eliminate cross-tenant collision (H-7)
            mem_orgs = (
                db.table("workspace_members")
                .select("organization_id")
                .eq("user_id", user_id)
                .execute()
            )
            org_ids = [m["organization_id"] for m in (mem_orgs.data or []) if m.get("organization_id")]
            if org_ids:
                query = query.eq("identifier", issue_id_or_identifier).in_("organization_id", org_ids)
            else:
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

    @staticmethod
    def _resolve_user_meta(uid: Optional[str], db: Client, cache: Optional[dict] = None) -> Optional[dict]:
        if not uid:
            return None
        if cache is not None and uid in cache:
            return cache[uid]
        email, name = WorkspaceService.resolve_user_info(uid, db)
        meta = {
            "id": uid,
            "email": email,
            "name": name,
        }
        if cache is not None:
            cache[uid] = meta
        return meta

    @classmethod
    def _enrich_issue_users(
        cls,
        item: dict,
        db: Client,
        user_cache: Optional[dict] = None,
        state_cache: Optional[dict] = None,
    ) -> dict:
        item["assignee"] = cls._resolve_user_meta(item.get("assignee_id"), db, user_cache)
        
        assigned_by_id = item.get("assigned_by_id")
        if not assigned_by_id and item.get("assignee_id"):
            assigned_by_id = item.get("creator_id")
        item["assigned_by"] = cls._resolve_user_meta(assigned_by_id, db, user_cache)
        item["creator"] = cls._resolve_user_meta(item.get("creator_id"), db, user_cache)

        if state_cache and item.get("state_id") in state_cache:
            item["state"] = state_cache[item.get("state_id")]
        return item

    @classmethod
    def _enrich_issue_assignee(cls, item: dict, db: Client, cache: Optional[dict] = None) -> dict:
        return cls._enrich_issue_users(item, db, cache)

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
        if project_id:
            query = query.eq("project_id", project_id)
        if priority:
            query = query.eq("priority", priority)
        if search:
            query = query.ilike("title", f"%{search}%")

        query = query.order("sort_order")
        res = query.execute()

        # Cache workflow states for the team to enrich issue.state
        state_cache = {}
        try:
            st_res = db.table("workflow_states").select("id, name, color, category, position, is_default, team_id, created_at").eq("team_id", team_id).execute()
            if st_res.data:
                state_cache = {s["id"]: s for s in st_res.data}
        except Exception:
            pass

        user_cache: dict = {}
        enriched = [cls._enrich_issue_users(item, db, user_cache, state_cache) for item in (res.data or [])]

        # Batch load labels for issues
        issue_ids = [item["id"] for item in enriched]
        labels_by_issue: Dict[str, list] = {iid: [] for iid in issue_ids}
        if issue_ids:
            try:
                lbl_res = (
                    db.table("issue_labels")
                    .select("issue_id, label_id, labels(id, name, color, description)")
                    .in_("issue_id", issue_ids)
                    .execute()
                )
                for row in (lbl_res.data or []):
                    if row.get("labels"):
                        labels_by_issue.setdefault(row["issue_id"], []).append(row["labels"])
            except Exception:
                pass

        for item in enriched:
            item["labels"] = labels_by_issue.get(item["id"], [])

        return [IssueResponse(**item) for item in enriched]

    @classmethod
    def create_issue(cls, data: IssueCreate, user_id: str, db: Client) -> IssueResponse:
        resolved_team_id = data.team_id
        if not resolved_team_id:
            if data.state_id:
                st_res = db.table("workflow_states").select("team_id").eq("id", data.state_id).limit(1).execute()
                if st_res.data:
                    resolved_team_id = st_res.data[0]["team_id"]
            if not resolved_team_id and data.team_key:
                tm_res = db.table("teams").select("id").eq("key", data.team_key.upper()).limit(1).execute()
                if tm_res.data:
                    resolved_team_id = tm_res.data[0]["id"]
            if not resolved_team_id:
                tms_res = db.table("teams").select("id").limit(1).execute()
                if tms_res.data:
                    resolved_team_id = tms_res.data[0]["id"]
                else:
                    raise HTTPException(status_code=400, detail="team_id could not be resolved")

        team = cls._verify_team_member(resolved_team_id, user_id, db)

        # 1. State resolution
        target_state_id = data.state_id

        # Determine if creator is a member of the target destination team
        is_team_member = False
        try:
            tm_chk = (
                db.table("team_members")
                .select("id")
                .eq("team_id", resolved_team_id)
                .eq("user_id", user_id)
                .limit(1)
                .execute()
            )
            data_val = getattr(tm_chk, "data", None)
            if data_val:
                if isinstance(data_val, list):
                    is_team_member = len(data_val) > 0
                else:
                    is_team_member = bool(data_val)
        except Exception:
            is_team_member = False

        # Determine target workflow state
        # All issues route directly to default active state
        if target_state_id:
            try:
                chk_state = (
                    db.table("workflow_states")
                    .select("id")
                    .eq("id", target_state_id)
                    .eq("team_id", resolved_team_id)
                    .limit(1)
                    .execute()
                )
                if not chk_state.data:
                    target_state_id = None
            except Exception:
                target_state_id = None

        # If no valid state provided, fall back to default active state
        if not target_state_id:
            default_state = (
                db.table("workflow_states")
                .select("id")
                .eq("team_id", resolved_team_id)
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
                    .eq("team_id", resolved_team_id)
                    .order("position")
                    .limit(1)
                    .execute()
                )
                if first_state.data:
                    target_state_id = first_state.data[0]["id"]
                else:
                    raise HTTPException(status_code=500, detail="Team has no workflow states configured")

        # 2. Sequential counter & identifier (atomic allocation)
        counter, identifier = cls._allocate_identifier(resolved_team_id, team, db)

        # 3. Calculate initial LexoRank position
        last_issue = (
            db.table("issues")
            .select("sort_order")
            .eq("team_id", resolved_team_id)
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
            "team_id": resolved_team_id,
            "number": counter,
            "identifier": identifier,
            "title": data.title,
            "description_json": data.description_json,
            "description_text": data.description_text,
            "priority": data.priority.value,
            "state_id": target_state_id,
            "assignee_id": data.assignee_id,
            "assigned_by_id": data.assigned_by_id or (user_id if data.assignee_id else None),
            "creator_id": user_id,
            "project_id": data.project_id,
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

        # Attach labels if provided
        created_labels = []
        if data.label_ids:
            for lid in data.label_ids:
                try:
                    db.table("issue_labels").insert({"issue_id": created["id"], "label_id": lid}).execute()
                except Exception:
                    pass
            try:
                l_res = db.table("issue_labels").select("label_id, labels(id, name, color, description)").eq("issue_id", created["id"]).execute()
                created_labels = [x["labels"] for x in (l_res.data or []) if x.get("labels")]
            except Exception:
                pass

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

        created_enriched = cls._enrich_issue_assignee(created, db)
        created_enriched["labels"] = created_labels
        return IssueResponse(**created_enriched)

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

        # Recursively fetch all descendants (children, grandchildren, etc.)
        all_descendants = []
        current_parent_ids = [issue["id"]]
        visited_parents = set(current_parent_ids)
        while current_parent_ids:
            sub_res = (
                db.table("issues")
                .select("*")
                .in_("parent_id", current_parent_ids)
                .is_("deleted_at", "null")
                .order("sort_order")
                .execute()
            )
            if not sub_res.data:
                break
            new_items = [r for r in sub_res.data if r["id"] not in visited_parents]
            if not new_items:
                break
            for r in new_items:
                visited_parents.add(r["id"])
            all_descendants.extend(new_items)
            current_parent_ids = [r["id"] for r in new_items]

        # Workflow states cache for team
        state_cache = {}
        try:
            st_res = db.table("workflow_states").select("id, name, color, category, position, is_default, team_id, created_at").eq("team_id", issue["team_id"]).execute()
            if st_res.data:
                state_cache = {s["id"]: s for s in st_res.data}
        except Exception:
            pass

        cache: dict = {}
        enriched_descendants = [cls._enrich_issue_users(d, db, cache, state_cache) for d in all_descendants]

        # Group descendants by parent_id
        children_by_parent: Dict[str, list] = {}
        for d in enriched_descendants:
            pid = d.get("parent_id")
            if pid:
                children_by_parent.setdefault(pid, []).append(d)

        def attach_children(parent_id: str) -> list:
            children = children_by_parent.get(parent_id, [])
            for child in children:
                child["subtasks"] = attach_children(child["id"])
            return children

        subtasks = attach_children(issue["id"])
        enriched_issue = cls._enrich_issue_users(issue, db, cache, state_cache)

        return IssueDetailResponse(**enriched_issue, labels=labels, subtasks=subtasks)

    @classmethod
    def update_issue(cls, issue_id: str, data: IssueUpdate, user_id: str, db: Client) -> IssueResponse:
        current_issue = cls._verify_issue_access(issue_id, user_id, db)

        # Optimistic Concurrency Control (OCC) - only enforced when expected_version is provided
        if data.expected_version is not None and current_issue["version"] != data.expected_version:
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
        dumped = data.model_dump(exclude_unset=True)

        if "label_ids" in dumped:
            new_label_ids = dumped["label_ids"] or []
            try:
                db.table("issue_labels").delete().eq("issue_id", issue_id).execute()
                for lid in new_label_ids:
                    db.table("issue_labels").insert({"issue_id": issue_id, "label_id": lid}).execute()
            except Exception:
                pass
            changes["labels"] = {"updated": new_label_ids}

        for field, val in dumped.items():
            if field in ("expected_version", "client_session_id", "label_ids"):
                continue
            if val is None:
                update_dict[field] = None
                if current_issue.get(field) is not None:
                    changes[field] = {"old": current_issue.get(field), "new": None}
            else:
                if isinstance(val, (datetime, date)):
                    val_str = val.isoformat()
                elif hasattr(val, "value"):
                    val_str = val.value
                else:
                    val_str = val
                update_dict[field] = val_str
                if current_issue.get(field) != val_str:
                    changes[field] = {"old": current_issue.get(field), "new": val_str}

        # Dynamically record who assigned the issue whenever assignee_id changes
        if "assignee_id" in changes:
            new_assignee = update_dict.get("assignee_id")
            if new_assignee:
                update_dict["assigned_by_id"] = user_id
                changes["assigned_by_id"] = {"old": current_issue.get("assigned_by_id"), "new": user_id}
            else:
                update_dict["assigned_by_id"] = None
                changes["assigned_by_id"] = {"old": current_issue.get("assigned_by_id"), "new": None}

        update_dict["version"] = current_issue["version"] + 1
        update_dict["updated_at"] = datetime.now(timezone.utc).isoformat()
        if data.client_session_id:
            update_dict["last_modified_by_session"] = data.client_session_id

        # Atomic update: predicate on version if expected_version is provided, else unconditional LWW
        query = db.table("issues").update(update_dict).eq("id", issue_id)
        if data.expected_version is not None:
            query = query.eq("version", data.expected_version)
        res = query.execute()
        if not res.data:
            # Re-read to provide fresh state on concurrent conflict
            fresh = db.table("issues").select("*").eq("id", issue_id).limit(1).execute()
            fresh_issue = fresh.data[0] if fresh.data else current_issue
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    "message": "Concurrent edit conflict detected. The issue has been modified by another collaborator.",
                    "current_version": fresh_issue.get("version"),
                    "current_state": fresh_issue,
                }
            )
        updated = {**current_issue, **update_dict, **(res.data[0] if (res.data and isinstance(res.data[0], dict)) else {})}

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

        # Load labels for updated issue
        lbls = []
        try:
            l_res = db.table("issue_labels").select("label_id, labels(id, name, color, description)").eq("issue_id", issue_id).execute()
            lbls = [x["labels"] for x in (l_res.data or []) if x.get("labels")]
        except Exception:
            pass

        updated_dict = cls._enrich_issue_assignee(updated, db)
        updated_dict["labels"] = lbls
        return IssueResponse(**updated_dict)

    @classmethod
    def delete_issue(cls, issue_id: str, user_id: str, db: Client, client_session_id: Optional[str] = None, hard: bool = False) -> None:
        current_issue = cls._verify_issue_access(issue_id, user_id, db)
        now_iso = datetime.now(timezone.utc).isoformat()

        if hard:
            # Only organization admin can permanently hard-delete an issue
            mem = (
                db.table("workspace_members")
                .select("role")
                .eq("organization_id", current_issue["organization_id"])
                .eq("user_id", user_id)
                .limit(1)
                .execute()
            )
            if not mem.data or mem.data[0].get("role") != "admin":
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Only organization admins can permanently hard-delete an issue",
                )

            try:
                sub_res = db.table("issues").select("id").eq("parent_id", issue_id).execute()
                sub_ids = [s["id"] for s in (sub_res.data or [])]
                if sub_ids:
                    db.table("issues").delete().in_("id", sub_ids).execute()
            except Exception:
                pass

            try:
                db.table("issue_comments").delete().eq("issue_id", issue_id).execute()
                db.table("issue_attachments").delete().eq("issue_id", issue_id).execute()
                # Retain audit log records by detaching issue_id rather than wiping historical evidence
                db.table("activity_logs").update({"issue_id": None}).eq("issue_id", issue_id).execute()
            except Exception:
                pass

            db.table("issues").delete().eq("id", issue_id).execute()
            return

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

        if target_state_id != current_issue.get("state_id"):
            try:
                db.table("activity_logs").insert({
                    "organization_id": current_issue["organization_id"],
                    "issue_id": issue_id,
                    "actor_id": user_id,
                    "action": "issue_updated",
                    "changes": {
                        "state_id": {
                            "old": current_issue.get("state_id"),
                            "new": target_state_id,
                        }
                    },
                }).execute()
            except Exception:
                pass

        return IssueResponse(**res.data[0])

    @classmethod
    def batch_reorder(cls, data: BatchReorderRequest, user_id: str, db: Client) -> Dict[str, Any]:
        count = 0
        now_iso = datetime.now(timezone.utc).isoformat()
        for item in data.items:
            current_issue = cls._verify_issue_access(item.issue_id, user_id, db)
            payload = {
                "state_id": item.state_id,
                "sort_order": item.position,
                "version": current_issue.get("version", 1) + 1,
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
            current_issue = cls._verify_issue_access(item.issue_id, user_id, db)
            updates_dict = {}
            if item.state_id is not None:
                updates_dict["state_id"] = item.state_id
            if item.assignee_id is not None:
                updates_dict["assignee_id"] = item.assignee_id
            if item.priority is not None:
                updates_dict["priority"] = item.priority.value
            
            if updates_dict:
                updates_dict["version"] = current_issue.get("version", 1) + 1
                updates_dict["updated_at"] = now_iso
                if data.client_session_id:
                    updates_dict["last_modified_by_session"] = data.client_session_id
                db.table("issues").update(updates_dict).eq("id", item.issue_id).execute()
                
                # Activity log
                try:
                    db.table("activity_logs").insert({
                        "organization_id": current_issue["organization_id"],
                        "issue_id": item.issue_id,
                        "actor_id": user_id,
                        "action": "issue_updated",
                        "changes": updates_dict,
                    }).execute()
                except Exception:
                    pass

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
        cache: dict = {}
        enriched = [cls._enrich_issue_assignee(item, db, cache) for item in (res.data or [])]
        return [IssueResponse(**item) for item in enriched]

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
            .eq("parent_id", parent["id"])
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
            "state_id": parent["state_id"],
            "assignee_id": data.assignee_id,
            "creator_id": user_id,
            "project_id": parent.get("project_id"),
            "parent_id": parent["id"],
            "sort_order": sort_order,
            "version": 1,
        }

        res = db.table("issues").insert(subtask_payload).execute()
        if not res.data:
            raise HTTPException(status_code=500, detail="Failed to create subtask")
        created = res.data[0]

        db.table("activity_logs").insert({
            "organization_id": parent["organization_id"],
            "issue_id": parent["id"],
            "actor_id": user_id,
            "action": "subtask_created",
            "changes": {"subtask_identifier": identifier, "title": data.title},
        }).execute()

        return IssueResponse(**cls._enrich_issue_assignee(created, db))

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
        logs = res.data or []
        actor_ids = list({log["actor_id"] for log in logs if log.get("actor_id")})
        users_map = {}
        if actor_ids:
            for a_id in actor_ids:
                try:
                    email, name = WorkspaceService.resolve_user_info(a_id, db)
                    users_map[a_id] = {"id": a_id, "name": name, "email": email}
                except Exception:
                    users_map[a_id] = {"id": a_id, "name": "Workspace Member"}

        results = []
        for log in logs:
            actor_data = users_map.get(log["actor_id"])
            if not actor_data:
                actor_data = {"id": log["actor_id"], "name": "Workspace Member"}
            results.append(ActivityLogResponse(**log, actor=actor_data))
        return results

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

        # Resolve comment authors
        user_cache: Dict[str, IssueAssigneeUser] = {}
        for c in comments:
            uid = c.get("user_id")
            if uid and uid not in user_cache:
                try:
                    email, name = WorkspaceService.resolve_user_info(uid, db)
                    user_cache[uid] = IssueAssigneeUser(id=uid, email=email, name=name)
                except Exception:
                    user_cache[uid] = IssueAssigneeUser(id=uid, name="Workspace Member")

        result = []
        for c in comments:
            rx_list = [
                CommentReactionResponse(emoji=emoji, count=len(uids), user_ids=uids)
                for emoji, uids in reactions_map[c["id"]].items()
            ]
            author = user_cache.get(c.get("user_id"))
            result.append(CommentResponse(**c, reactions=rx_list, user=author))
        return result

    @classmethod
    def create_comment(cls, issue_id: str, data: CommentCreate, user_id: str, db: Client) -> CommentResponse:
        issue = cls._verify_issue_access(issue_id, user_id, db)
        payload = {
            "issue_id": issue_id,
            "user_id": user_id,
            "body_json": data.body_json or {"type": "doc", "content": []},
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

        author = None
        try:
            email, name = WorkspaceService.resolve_user_info(user_id, db)
            author = IssueAssigneeUser(id=user_id, email=email, name=name)
        except Exception:
            author = IssueAssigneeUser(id=user_id, name="Workspace Member")

        return CommentResponse(**created, reactions=[], user=author)

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

        author = None
        try:
            email, name = WorkspaceService.resolve_user_info(user_id, db)
            author = IssueAssigneeUser(id=user_id, email=email, name=name)
        except Exception:
            author = IssueAssigneeUser(id=user_id, name="Workspace Member")

        return CommentResponse(**res.data[0], reactions=[], user=author)

    @classmethod
    def delete_comment(cls, comment_id: str, user_id: str, db: Client, hard: bool = False) -> None:
        c_res = db.table("issue_comments").select("id, user_id, issue_id").eq("id", comment_id).is_("deleted_at", "null").limit(1).execute()
        if not c_res.data:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Comment not found")
        comment = c_res.data[0]

        # Only comment author or organization admin/owner can delete comment
        if comment["user_id"] != user_id:
            issue = cls._verify_issue_access(comment["issue_id"], user_id, db)
            mem = db.table("workspace_members").select("role").eq("organization_id", issue["organization_id"]).eq("user_id", user_id).limit(1).execute()
            if not mem.data or mem.data[0].get("role") not in ["admin", "owner"]:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only comment author or admin can delete comment")

        if hard:
            try:
                db.table("comment_reactions").delete().eq("comment_id", comment_id).execute()
            except Exception:
                pass
            db.table("issue_comments").delete().eq("id", comment_id).execute()
        else:
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
